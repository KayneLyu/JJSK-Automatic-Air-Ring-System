import { BrowserWindow } from 'electron'
import { RingBuffer, ThicknessRingItem, RotationRingItem } from './ringBuffer'
import { SQLiteService } from './sqliteService'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IUpperRotationDebugData, BubbleSweepResult } from '@/types/ipc'
import { DataBatcher } from './data-batcher'
import {
  type BubbleReconstructionResult,
} from '@jjsk/air-ring-server/algorithms/bubbleThicknessReconstruction.ts'
import { trapezoidalPosition } from '@jjsk/air-ring-server/algorithms/upperRotation/upperRotation.evaluation.ts'

/**
 * X 光 AD → 厚度 (μm) 转换
 *
 * 与 `apps/AirRingSys/src/views/settings/rack/utiles.ts:241` 同源。
 * 主进程复制一份以避免 renderer→main 反向依赖；公式不变。
 */
const calcThicknessMicrons = (
  ad: number,
  airAD: number,
  gain: number
): number => {
  if (ad <= 0 || airAD <= 0) return 0
  if (ad >= airAD) return 0
  const x = Math.log(airAD / ad)
  const base = 9.65 * x * x + 243.08 * x - 0.087
  return Math.max(0, base * (gain || 1.0))
}

/**
 * 数据管道 — 硬件→RingBuffer→{渲染, 计算, 持久化} 三路分离
 *
 *                                ┌─► DataBatcher ─► Renderer (50ms, 最新帧)
 *   ADBox/S7 ─► RingBuffer ─────┼─► computation (calibrationBridge)
 *                                └─► SQLite (WAL, 500ms批量写入)
 */
export class DataPipeline {
  readonly thicknessRing: RingBuffer<ThicknessRingItem>
  readonly rotationRing: RingBuffer<RotationRingItem>

  private sqlite: SQLiteService
  private batcher: DataBatcher<PushData>
  private flushTimer: NodeJS.Timeout | null = null
  private readonly FLUSH_INTERVAL_MS = 500
  private cleanupTimer: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL_MS = 60_000 // 每分钟
  private readonly RETENTION_THICKNESS_MS = 2 * 3600_000 // 2小时

  // 计算回调
  private feedThicknessSample?: (sample: {
    timestamp: number
    ProbeValue: number
    HorizontalPulse: number
  }) => void
  private feedUpperRotationData?: (data: IUpperRotationDebugData) => void
  private emitUpperRotationData?: (data: IUpperRotationDebugData) => void

  constructor(window: BrowserWindow, sqlite: SQLiteService) {
    this.thicknessRing = new RingBuffer<ThicknessRingItem>(200_000)
    this.rotationRing = new RingBuffer<RotationRingItem>(10_000)
    this.sqlite = sqlite

    // 50ms 节流推送至渲染层
    this.batcher = new DataBatcher<PushData>(window, 'adbox-data', {
      interval: 50,
    })
  }

  /** 注册计算管线回调 */
  registerComputation(callbacks: {
    feedThicknessSample: (sample: {
      timestamp: number
      ProbeValue: number
      HorizontalPulse: number
    }) => void
    feedUpperRotationData: (data: IUpperRotationDebugData) => void
    emitUpperRotationData: (data: IUpperRotationDebugData) => void
  }): void {
    this.feedThicknessSample = callbacks.feedThicknessSample
    this.feedUpperRotationData = callbacks.feedUpperRotationData
    this.emitUpperRotationData = callbacks.emitUpperRotationData
  }

  /** 启动定时 flush + cleanup */
  start(): void {
    // cleanup 暂时关闭，但保留配置常量便于后续恢复。
    void this.CLEANUP_INTERVAL_MS
    void this.RETENTION_THICKNESS_MS

    this.flushTimer = setInterval(() => {
      const counts = this.sqlite.flush()
      if (counts.thickness > 0 || counts.rotation > 0) {
        console.log(
          `[Pipeline] SQLite flush: T=${counts.thickness} R=${counts.rotation}`
        )
      }
    }, this.FLUSH_INTERVAL_MS)

    // this.cleanupTimer = setInterval(() => {
    //   const before = Date.now() - this.RETENTION_THICKNESS_MS
    //   const result = this.sqlite.cleanup(before)
    //   if (result.thickness > 0) {
    //     console.log(`[Pipeline] 清理过期数据: T=${result.thickness} R=${result.rotation} A=${result.airRing}`)
    //   }
    // }, this.CLEANUP_INTERVAL_MS)
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.sqlite.flush()
    this.batcher.destroy()
  }

  // ══ 数据接收 ══

  /** ADBox 测厚数据入口 */
  receiveThickness(push: PushData, timestamp: number): void {
    if (typeof push.pos0 !== 'number' || !Number.isFinite(push.pos0)) return

    // 1. RingBuffer 写入
    this.thicknessRing.push({
      timestamp,
      pulse: push.pos0,
      ad: push.ad0,
      source: 'adbox',
    })

    // 2. 推送至渲染 (50ms 节流)
    this.batcher.push(push)

    // 3. 推送至计算管线
    this.feedThicknessSample?.({
      timestamp,
      ProbeValue: push.ad0,
      HorizontalPulse: push.pos0,
    })

    // 4. 持久化 (批量缓冲)
    this.sqlite.pushThickness(timestamp, push.pos0, push.ad0, 'adbox', 0, 1.0)
  }

  /** 上旋/风环数据入口 */
  receiveRotation(data: IUpperRotationDebugData): void {
    const ts = data.timestamp ?? Date.now()

    // 1. RingBuffer
    this.rotationRing.push({
      timestamp: ts,
      forwardRotation: data.ForwardRotation ?? false,
      reverseRotation: data.ReverseRotation ?? false,
      motorFrequency: data.MotorFrequency ?? 0,
      heats: data.Heats ?? [],
    })

    // 2. 推送至计算管线
    this.feedUpperRotationData?.(data)

    // 3. 推送至渲染
    this.emitUpperRotationData?.(data)

    // 4. 持久化
    this.sqlite.pushRotation(
      ts,
      data.ForwardRotation ? 1 : 0,
      data.ReverseRotation ? 1 : 0,
      data.MotorFrequency ?? 0,
      data.ForwardDirectionChange ? 1 : 0,
      data.ReverseDirectionChange ? 1 : 0,
      data.Reset ? 1 : 0,
      data.Heats ?? []
    )

    // 5. 风环通道数据
    if (data.Heats && data.Heats.length > 0) {
      this.sqlite.pushAirRing(ts, data.Heats, 0, 0, 0)
    }
  }

  /** 强制刷写 SQLite 缓冲区 */
  flush(): void {
    this.sqlite.flush()
  }

  /** 获取 RingBuffer 统计 */
  getStats(): {
    thicknessInRing: number
    rotationInRing: number
    thicknessTimeRange: { oldest: number | null; newest: number | null }
  } {
    return {
      thicknessInRing: this.thicknessRing.size,
      rotationInRing: this.rotationRing.size,
      thicknessTimeRange: this.thicknessRing.getTimeRange(),
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 膜泡原始厚度重建（Bubble Thickness Reconstruction）
  // ═══════════════════════════════════════════════════════════════

  getBubbleProfile(params: {
    membraneWidthMm: number
    thetaMaxDeg: number
    mmPerPulse: number
    airAD: number
    gain: number
    numBins?: number
    processDeformationFactor?: number
    startMs?: number
    endMs?: number
    useLatestWindowMs?: number
  }): BubbleReconstructionResult | null {
    if (params.membraneWidthMm <= 0 || params.thetaMaxDeg <= 0) return null
    if (params.mmPerPulse <= 0) return null
    if (params.airAD <= 0) return null

    const numBins = params.numBins ?? 48
    const MAX_POINTS_PER_SWEEP = 2000

    let startMs = params.startMs ?? 0
    let endMs = params.endMs ?? Date.now()
    if (params.useLatestWindowMs && params.useLatestWindowMs > 0) {
      endMs = Date.now()
      startMs = endMs - params.useLatestWindowMs
    }

    const sweeps = this.findSweepsFromHistory(startMs, endMs)
    if (sweeps.length === 0) return null

    // 取最长一趟
    const sweep = sweeps.reduce((a, b) =>
      b.endTs - b.startTs > a.endTs - a.startTs ? b : a
    )

    const allRows = this.sqlite.queryThicknessRaw(sweep.startTs, sweep.endTs)
    if (allRows.length < 100) return null
    const rows =
      allRows.length > MAX_POINTS_PER_SWEEP
        ? downsampleUniform(allRows, MAX_POINTS_PER_SWEEP)
        : allRows

    return this.buildProfile(
      rows,
      {
        startTs: sweep.startTs,
        direction: sweep.direction,
        durationMs: sweep.endTs - sweep.startTs,
      },
      params.membraneWidthMm,
      params.thetaMaxDeg,
      params.mmPerPulse,
      params.airAD,
      params.gain,
      numBins
    )
  }

  /**
   * 在 [startMs, endMs] 窗口内找所有趟的起止时刻
   */
  private findSweepsFromHistory(
    startMs: number,
    endMs: number
  ): {
    startTs: number
    endTs: number
    direction: 'forward' | 'reverse'
  }[] {
    const rotRows = this.sqlite.queryRotationRaw(startMs, endMs)
    if (!rotRows || rotRows.length === 0) return []

    const changes: { ts: number; direction: 'forward' | 'reverse' }[] = []
    for (const r of rotRows) {
      if (r.forwardDirChange) {
        changes.push({ ts: r.timestamp, direction: 'forward' })
      } else if (r.reverseDirChange) {
        changes.push({ ts: r.timestamp, direction: 'reverse' })
      }
    }
    if (changes.length === 0) return []

    const MIN_SWEEP_MS = 30_000
    const sweeps: {
      startTs: number
      endTs: number
      direction: 'forward' | 'reverse'
    }[] = []

    for (let i = 0; i < changes.length - 1; i += 1) {
      const start = changes[i]
      const end = changes[i + 1]
      if (end.ts - start.ts < MIN_SWEEP_MS) continue
      sweeps.push({
        startTs: start.ts,
        endTs: end.ts,
        direction: start.direction,
      })
    }

    // 如果窗口末尾还有一段未完成的当前行程，补一段到 endMs
    const last = changes[changes.length - 1]
    if (endMs - last.ts >= MIN_SWEEP_MS) {
      sweeps.push({
        startTs: last.ts,
        endTs: endMs,
        direction: last.direction,
      })
    }

    return sweeps
  }

  /**
   * 按时间窗口取多趟扫描，每趟重建一个 profile
   */
  getBubbleSweeps(params: {
    membraneWidthMm: number
    thetaMaxDeg: number
    mmPerPulse: number
    airAD: number
    gain: number
    numBins?: number
    processDeformationFactor?: number
    startMs?: number
    endMs?: number
    useLatestWindowMs?: number
    limit?: number
  }): BubbleSweepResult[] {
    if (params.membraneWidthMm <= 0 || params.thetaMaxDeg <= 0) return []
    if (params.mmPerPulse <= 0) return []
    if (params.airAD <= 0) return []

    const numBins = params.numBins ?? 48
    const MAX_POINTS_PER_SWEEP = 2000

    let startMs = params.startMs ?? 0
    let endMs = params.endMs ?? Date.now()
    if (params.useLatestWindowMs && params.useLatestWindowMs > 0) {
      endMs = Date.now()
      startMs = endMs - params.useLatestWindowMs
    }

    const sweeps = this.findSweepsFromHistory(startMs, endMs)
    if (sweeps.length === 0) return []

    const limited = params.limit ? sweeps.slice(-params.limit) : sweeps

    const results: BubbleSweepResult[] = []
    for (const sweep of limited) {
      const allRows = this.sqlite.queryThicknessRaw(sweep.startTs, sweep.endTs)
      if (allRows.length < 100) continue
      const rows =
        allRows.length > MAX_POINTS_PER_SWEEP
          ? downsampleUniform(allRows, MAX_POINTS_PER_SWEEP)
          : allRows
      const profile = this.buildProfile(
        rows,
        {
          startTs: sweep.startTs,
          direction: sweep.direction,
          durationMs: sweep.endTs - sweep.startTs,
        },
        params.membraneWidthMm,
        params.thetaMaxDeg,
        params.mmPerPulse,
        params.airAD,
        params.gain,
        numBins
      )
      if (!profile) continue
      results.push({
        ...profile,
        id: `sweep-${sweep.startTs}-${sweep.direction}`,
        time: sweep.startTs,
        direction: sweep.direction,
        cycleDurationMs: sweep.endTs - sweep.startTs,
      })
    }

    return results
  }

  getLatestBubbleSweeps(params: {
    count: number
    beforeTs?: number
    membraneWidthMm: number
    thetaMaxDeg: number
    mmPerPulse: number
    airAD: number
    gain: number
    numBins?: number
    processDeformationFactor?: number
  }): BubbleSweepResult[] {
    if (params.membraneWidthMm <= 0 || params.thetaMaxDeg <= 0) return []
    if (params.mmPerPulse <= 0) return []
    if (params.airAD <= 0) return []
    if (params.count <= 0) return []

    const numBins = params.numBins ?? 48
    const MAX_POINTS_PER_SWEEP = 2000
    const eventCount = params.count + 1

    const rotRows = this.sqlite.queryLatestDirectionChanges(
      eventCount,
      params.beforeTs ?? 0
    )
    if (rotRows.length < 2) return []

    const changes: { ts: number; direction: 'forward' | 'reverse' }[] = []
    for (const r of rotRows) {
      if (r.forwardDirChange) {
        changes.push({ ts: r.timestamp, direction: 'forward' })
      } else if (r.reverseDirChange) {
        changes.push({ ts: r.timestamp, direction: 'reverse' })
      }
    }
    if (changes.length < 2) return []

    const MIN_SWEEP_MS = 30_000
    const sweepBounds: {
      startTs: number
      endTs: number
      direction: 'forward' | 'reverse'
    }[] = []
    const pairCount = Math.min(params.count, changes.length - 1)
    for (let i = 0; i < pairCount; i += 1) {
      const start = changes[i + 1]
      const end = changes[i]
      if (end.ts - start.ts < MIN_SWEEP_MS) continue
      sweepBounds.push({
        startTs: start.ts,
        endTs: end.ts,
        direction: start.direction,
      })
    }
    const results: BubbleSweepResult[] = []
    for (const sweep of sweepBounds) {
      const allRows = this.sqlite.queryThicknessRaw(sweep.startTs, sweep.endTs)
      if (allRows.length < 100) continue
      const rows =
        allRows.length > MAX_POINTS_PER_SWEEP
          ? downsampleUniform(allRows, MAX_POINTS_PER_SWEEP)
          : allRows
      const profile = this.buildProfile(
        rows,
        {
          startTs: sweep.startTs,
          direction: sweep.direction,
          durationMs: sweep.endTs - sweep.startTs,
        },
        params.membraneWidthMm,
        params.thetaMaxDeg,
        params.mmPerPulse,
        params.airAD,
        params.gain,
        numBins
      )
      if (!profile) continue
      results.push({
        ...profile,
        id: `sweep-${sweep.startTs}-${sweep.direction}`,
        time: sweep.startTs,
        direction: sweep.direction,
        cycleDurationMs: sweep.endTs - sweep.startTs,
      })
    }

    return results.sort((a, b) => a.time - b.time)
  }

  getCurrentBubbleSweep(params: {
    membraneWidthMm: number
    thetaMaxDeg: number
    mmPerPulse: number
    airAD: number
    gain: number
    numBins?: number
    processDeformationFactor?: number
  }): BubbleSweepResult | null {
    if (params.membraneWidthMm <= 0 || params.thetaMaxDeg <= 0) return null
    if (params.mmPerPulse <= 0) return null
    if (params.airAD <= 0) return null

    const numBins = params.numBins ?? 48
    const MAX_POINTS_PER_SWEEP = 2000
    const rotRows = this.sqlite.queryLatestDirectionChanges(1)
    if (rotRows.length === 0) return null

    const latest = rotRows[0]
    const currentDirection = latest.forwardDirChange
      ? 'forward'
      : latest.reverseDirChange
        ? 'reverse'
        : null
    if (!currentDirection) return null

    const startTs = latest.timestamp
    const endTs = Date.now()
    if (endTs <= startTs) return null

    const allRows = this.sqlite.queryThicknessRaw(startTs, endTs)
    if (allRows.length < 100) return null
    const rows =
      allRows.length > MAX_POINTS_PER_SWEEP
        ? downsampleUniform(allRows, MAX_POINTS_PER_SWEEP)
        : allRows

    const profile = this.buildProfile(
      rows,
      {
        startTs,
        direction: currentDirection,
        durationMs: endTs - startTs,
      },
      params.membraneWidthMm,
      params.thetaMaxDeg,
      params.mmPerPulse,
      params.airAD,
      params.gain,
      numBins
    )
    if (!profile) return null

    return {
      ...profile,
      id: `live-${startTs}-${currentDirection}`,
      time: startTs,
      direction: currentDirection,
      cycleDurationMs: endTs - startTs,
      inProgress: true,
    }
  }

  private buildProfile(
    data: ReadonlyArray<{ timestamp: number; pulse: number; ad: number }>,
    cycle: {
      startTs: number
      direction: 'forward' | 'reverse'
      durationMs: number
    },
    membraneWidthMm: number,
    thetaMaxDeg: number,
    mmPerPulse: number,
    airAD: number,
    gain: number,
    numBins: number
  ): BubbleReconstructionResult | null {
    if (data.length < 100) return null

    const prefiltered: Array<{
      timestamp: number
      scannerPosMm: number
      thickness: number
    }> = []

    for (const item of data) {
      if (item.ad <= 0 || item.pulse < 0) continue
      if (item.ad < airAD * 0.3) continue
      const thickMicrons = calcThicknessMicrons(item.ad, airAD, gain)
      if (thickMicrons <= 0 || thickMicrons > 500) continue
      const elapsed = item.timestamp - cycle.startTs
      if (elapsed < 0) continue

      prefiltered.push({
        timestamp: item.timestamp,
        scannerPosMm: item.pulse * mmPerPulse,
        thickness: thickMicrons,
      })
    }

    if (prefiltered.length < numBins) return null

    const sortedPositions = [...prefiltered]
      .map((p) => p.scannerPosMm)
      .sort((a, b) => a - b)
    const centerMm = sortedPositions[Math.floor(sortedPositions.length / 2)]

    const q05 = sortedPositions[Math.floor(sortedPositions.length * 0.05)]
    const q95 = sortedPositions[Math.floor(sortedPositions.length * 0.95)]
    const inferredWidthMm = q95 - q05
    const effectiveWidthMm =
      inferredWidthMm > 0 && inferredWidthMm < membraneWidthMm * 3
        ? inferredWidthMm
        : membraneWidthMm

    const halfWidth = effectiveWidthMm / 2
    const thicknessThreshold = this.detectOutOfBoundsThreshold(
      prefiltered.map((p) => p.thickness)
    )

    // ═══ 直接分箱统计（不做 f(α)+f(α+180°) 反卷积） ═══
    //
    // 每个测量点按膜泡角度 α 直接分箱取均值，不做反卷积重建。
    // 这样保留了真实的圆周厚度分布形态，不会因为 T(α)=f(α)+f(α+180°)
    // 正模型的零空间（反对称函数族）而强制输出对称 profile。
    const binWidthDeg = 360 / numBins
    const binThicknessSums: number[] = new Array(numBins).fill(0)
    const binThicknessCounts: number[] = new Array(numBins).fill(0)
    const binTimestampSums: number[] = new Array(numBins).fill(0)
    const binTimestampCounts: number[] = new Array(numBins).fill(0)

    const tripDuration = Math.max(1, cycle.durationMs)
    const accelRatio = Math.min(20_000, tripDuration * 0.45) / tripDuration

    let totalMeasurements = 0
    for (const item of prefiltered) {
      const centeredPos = item.scannerPosMm - centerMm
      if (Math.abs(centeredPos) > halfWidth) continue
      if (thicknessThreshold !== null && item.thickness > thicknessThreshold)
        continue

      const elapsed = item.timestamp - cycle.startTs
      const progress = Math.max(0, Math.min(1, elapsed / tripDuration))
      const pos = trapezoidalPosition(progress, accelRatio)
      const upperAngleDeg =
        cycle.direction === 'forward'
          ? pos * thetaMaxDeg
          : thetaMaxDeg - pos * thetaMaxDeg

      const scannerOffset = (centeredPos / effectiveWidthMm) * 180
      const alpha = (((upperAngleDeg + scannerOffset) % 360) + 360) % 360
      const binIdx = Math.floor(alpha / binWidthDeg) % numBins

      binThicknessSums[binIdx] += item.thickness
      binThicknessCounts[binIdx] += 1
      binTimestampSums[binIdx] += item.timestamp
      binTimestampCounts[binIdx] += 1
      totalMeasurements += 1
    }

    const profile: number[] = binThicknessSums.map((sum, i) =>
      binThicknessCounts[i] > 0 ? sum / binThicknessCounts[i] : 0
    )

    const binCoverage: number[] = binThicknessCounts.map((c) => c)

    const nonZeroProfile = profile.filter((v) => v > 0)
    if (nonZeroProfile.length < Math.max(numBins * 0.3, 3)) {
      console.warn(
        `[buildProfile] 有效分箱不足: ${nonZeroProfile.length} < ${Math.max(numBins * 0.3, 3)}`
      )
      return null
    }

    if (!this.isProfilePlausible({ profile } as BubbleReconstructionResult))
      return null

    const binTimestamps: number[] = binTimestampSums.map((sum, i) =>
      binTimestampCounts[i] > 0 ? sum / binTimestampCounts[i] : 0
    )

    return {
      profile,
      numBins,
      binWidthDeg,
      rmsError: 0,
      maxError: 0,
      numMeasurements: totalMeasurements,
      binCoverage,
      binTimestamps,
    }
  }

  private detectOutOfBoundsThreshold(values: number[]): number | null {
    if (values.length < 100) return null

    const sorted = [...values].sort((a, b) => a - b)
    const p01 = sorted[Math.floor(sorted.length * 0.01)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    const range = p99 - p01
    if (range <= 0) return null

    const NUM_BINS = 50
    const binWidth = range / NUM_BINS
    const hist = new Array(NUM_BINS).fill(0)

    for (const v of values) {
      const bin = Math.min(Math.floor((v - p01) / binWidth), NUM_BINS - 1)
      hist[bin]++
    }

    let maxCount = 0
    let peakBin = 0
    for (let i = 0; i < NUM_BINS; i++) {
      if (hist[i] > maxCount) {
        maxCount = hist[i]
        peakBin = i
      }
    }

    let valleyBin = -1
    let valleyCount = Infinity
    const startBin = Math.max(peakBin + 3, Math.floor(NUM_BINS * 0.3))
    const endBin = Math.min(NUM_BINS - 3, Math.floor(NUM_BINS * 0.9))

    for (let i = startBin; i < endBin; i++) {
      if (hist[i] < valleyCount) {
        valleyCount = hist[i]
        valleyBin = i
      }
    }

    if (valleyBin < 0) return null
    if (valleyCount > maxCount * 0.2) return null

    let rightPeak = 0
    for (let i = valleyBin + 1; i < NUM_BINS; i++) {
      if (hist[i] > rightPeak) rightPeak = hist[i]
    }
    if (rightPeak < 0.02 * maxCount) return null

    return p01 + (valleyBin + 0.5) * binWidth
  }

  private isProfilePlausible(result: BubbleReconstructionResult): boolean {
    if (result.profile.length === 0) return false
    return result.profile.every((v) => Number.isFinite(v))
  }
}

const downsampleUniform = <T>(arr: T[], target: number): T[] => {
  if (arr.length <= target) return arr
  const stride = arr.length / target
  const out: T[] = []
  for (let i = 0; i < target; i += 1) {
    out.push(arr[Math.floor(i * stride)])
  }
  return out
}
