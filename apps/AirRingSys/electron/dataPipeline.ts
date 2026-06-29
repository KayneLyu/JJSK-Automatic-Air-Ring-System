import type { BrowserWindow } from 'electron'
import { RingBuffer, ThicknessRingItem, RotationRingItem } from './ringBuffer'
import { SQLiteService } from './db/service'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IUpperRotationDebugData, BubbleSweepResult } from '@/types/ipc'
import { DataBatcher } from './data-batcher'
import type {
  BubbleReconstructionResult,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import {
  findSweepsFromHistory,
  buildProfile,
} from './db/sweepProfileBuilder'
import {
  downsampleUniform,
} from './db/sweepHelpers'
import {
  createScanPassDetector,
} from './db/scanPassDetector'


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

  // ── 扫描趟实时检测 ──
  private readonly scanPassDetector = createScanPassDetector()

  // ── 上旋旋转趟实时检测 ──
  private rotationTripStartTs: number | null = null
  private rotationTripDirection: number | null = null

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

    // 关闭当前扫描趟
    const closed = this.scanPassDetector.close(Date.now())
    if (closed) {
      this.sqlite.insertScanPass(closed)
    }

    // 关闭当前上旋趟
    if (
      this.rotationTripStartTs !== null &&
      this.rotationTripDirection !== null
    ) {
      const now = Date.now()
      const tripId = this.sqlite.insertRotationTrip({
        startTs: this.rotationTripStartTs,
        endTs: now,
        direction: this.rotationTripDirection,
      })
      if (tripId > 0) {
        this.sqlite.backfillScanPassRotationTrip(
          tripId,
          this.rotationTripStartTs,
          now
        )
      }
    }

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

    // 5. 扫描趟实时检测
    const closed = this.scanPassDetector.feed(timestamp, push.pos0, push.ad0)
    if (closed) {
      this.sqlite.insertScanPass(closed)
    }
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

    // 6. 上旋旋转趟实时检测
    if (data.Reset) {
      this.rotationTripStartTs = null
      this.rotationTripDirection = null
      return
    }

    const directionSignal =
      data.ForwardDirectionChange
        ? 1
        : data.ReverseDirectionChange
          ? 0
          : null

    if (directionSignal !== null) {
      // 前一趟结束
      if (
        this.rotationTripStartTs !== null &&
        this.rotationTripDirection !== null &&
        ts > this.rotationTripStartTs
      ) {
        const tripId = this.sqlite.insertRotationTrip({
          startTs: this.rotationTripStartTs,
          endTs: ts,
          direction: this.rotationTripDirection,
        })
        // 回填该上旋趟时间范围内的 scan_pass
        if (tripId > 0) {
          this.sqlite.backfillScanPassRotationTrip(
            tripId,
            this.rotationTripStartTs,
            ts
          )
        }
      }
      // 新一趟开始
      this.rotationTripStartTs = ts
      this.rotationTripDirection = directionSignal
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
    transportDelayMs?: number
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

    const sweeps = findSweepsFromHistory(this.sqlite, startMs, endMs)
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

    return buildProfile(
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
      numBins,
      params.processDeformationFactor,
      params.transportDelayMs
    )
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
    transportDelayMs?: number
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

    const sweeps = findSweepsFromHistory(this.sqlite, startMs, endMs)
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
      const profile = buildProfile(
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
        numBins,
        params.processDeformationFactor,
        params.transportDelayMs
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
    transportDelayMs?: number
  }): BubbleSweepResult[] {
    if (params.membraneWidthMm <= 0 || params.thetaMaxDeg <= 0) return []
    if (params.mmPerPulse <= 0) return []
    if (params.airAD <= 0) return []
    if (params.count <= 0) return []

    const numBins = params.numBins ?? 48
    const MAX_POINTS_PER_SWEEP = 2000
    const MIN_SWEEP_MS = 30_000

    // 多取方向变化事件以匹配 LongitudinalCharts 的趟数
    // rotation_raw 记录可能比 thickness_raw 检测到的方向变化稀疏，
    // 需要扩大采样窗口确保能凑满请求的 count 趟
    const eventCount = Math.max(params.count * 8, 200)
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

    const results: BubbleSweepResult[] = []
    const maxPairs = changes.length - 1
    for (let i = 0; i < maxPairs && results.length < params.count; i += 1) {
      const start = changes[i + 1]
      const end = changes[i]
      if (end.ts - start.ts < MIN_SWEEP_MS) continue

      const allRows = this.sqlite.queryThicknessRaw(start.ts, end.ts)
      if (allRows.length < 100) continue
      const rows =
        allRows.length > MAX_POINTS_PER_SWEEP
          ? downsampleUniform(allRows, MAX_POINTS_PER_SWEEP)
          : allRows
      const profile = buildProfile(
        rows,
        {
          startTs: start.ts,
          direction: start.direction,
          durationMs: end.ts - start.ts,
        },
        params.membraneWidthMm,
        params.thetaMaxDeg,
        params.mmPerPulse,
        params.airAD,
        params.gain,
        numBins,
        params.processDeformationFactor,
        params.transportDelayMs
      )
      if (!profile) continue
      results.push({
        ...profile,
        id: `sweep-${start.ts}-${start.direction}`,
        time: start.ts,
        direction: start.direction,
        cycleDurationMs: end.ts - start.ts,
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
    transportDelayMs?: number
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

    const profile = buildProfile(
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
      numBins,
      params.processDeformationFactor,
      params.transportDelayMs
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

}
