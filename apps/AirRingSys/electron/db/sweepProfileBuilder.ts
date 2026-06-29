/**
 * 上旋旋转趟边界判定 + 单趟膜泡原始厚度重建
 *
 * 从 dataPipeline.ts 拆分出，专注于：
 * 1. 按上旋方向变化识别上旋旋转趟（~6-8min/趟）的起止时间
 * 2. 将单趟原始测量数据重建为膜泡圆周单层厚度分布
 *
 * 术语说明：
 * - "上旋旋转趟"：上旋电机一次完整行程（正转→反转或反之），~6-8min
 * - "测厚仪扫描趟"：测厚仪一次往返扫描，~30s
 * - 一程上旋旋转趟包含多次测厚仪扫描趟
 *
 * 所有函数均为纯函数，通过参数传入依赖（SQLiteService 等）。
 */
import type { SQLiteService } from './service'
import {
  reconstructBubbleThickness,
  type MeasurementTriple,
  type BubbleReconstructionResult,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import { trapezoidalPosition } from '@jjsk/air-ring-server/algorithms/upperRotation/upperRotation.evaluation.ts'
import {
  calcThicknessMicrons,
  detectOutOfBoundsThreshold,
  isProfilePlausible,
} from './sweepHelpers'

/**
 * 上旋旋转趟（~6-8min）的起止时间与方向。
 *
 * 方向切换事件（上旋正转→反转或反转→正转）标记一趟上旋旋转趟的起止。
 * 测厚仪在该趟内进行多次往返扫描，所有扫描数据归属于该上旋旋转趟。
 */
export interface SweepBound {
  /** 该趟起始时间戳 (ms) */
  startTs: number
  /** 该趟结束时间戳 (ms) */
  endTs: number
  /** 该趟上旋旋转方向 */
  direction: 'forward' | 'reverse'
}

export function findSweepsFromHistory(
    sqlite: SQLiteService,
    startMs: number,
    endMs: number
  ): {
    startTs: number
    endTs: number
    direction: 'forward' | 'reverse'
  }[] {
    const rotRows = sqlite.queryRotationRaw(startMs, endMs)
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


export function buildProfile(
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
    numBins: number,
    processDeformationFactor: number = 1.02,
    transportDelayMs?: number
  ): BubbleReconstructionResult | null {
    if (transportDelayMs == null || transportDelayMs <= 0) {
      console.warn(
        '[buildProfile] 缺少运输延迟参数，请标定 测量点距离(upperDistance) 和 牵引速度(rollerTractionSpeed)'
      )
      return null
    }
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
    const thicknessThreshold = detectOutOfBoundsThreshold(
      prefiltered.map((p) => p.thickness)
    )

    // ═══ 构建测量三元组 (delayedUpperAngle, scannerPosMm, thickness) ═══
    // 测厚仪读数 = f(α₁) + f(α₂)，两层膜分别来自膜泡上对称于压合中心
    // (delayedUpperAngle+90°)的两点：α₁=αC+δ, α₂=αC-δ。
    // delayedUpperAngle 用 (timestamp - transportDelayMs) 推算，保证用的是
    // 膜泡被压合时刻的上旋角度而非测量时刻。
    const binWidthDeg = 360 / numBins
    const tripDuration = Math.max(1, cycle.durationMs)
    const accelRatio = Math.min(20_000, tripDuration * 0.45) / tripDuration

    const triples: MeasurementTriple[] = []
    const allBin1: number[] = []
    const allBin2: number[] = []
    const allTimestamps: number[] = []
    const allThicknesses: number[] = []
    const binRawThicknessSums: number[] = new Array(numBins).fill(0)
    const binRawThicknessCounts: number[] = new Array(numBins).fill(0)
    const binTimestampSums: number[] = new Array(numBins).fill(0)
    const binTimestampCounts: number[] = new Array(numBins).fill(0)
    let totalMeasurements = 0

    for (const item of prefiltered) {
      const centeredPos = item.scannerPosMm - centerMm
      if (Math.abs(centeredPos) > halfWidth) continue
      if (thicknessThreshold !== null && item.thickness > thicknessThreshold)
        continue

      const delayedTs = item.timestamp - transportDelayMs
      const delayedElapsed = delayedTs - cycle.startTs
      const delayedProgress = Math.max(0, Math.min(1, delayedElapsed / tripDuration))
      const delayedPos = trapezoidalPosition(delayedProgress, accelRatio)
      const delayedUpperAngleDeg =
        cycle.direction === 'forward'
          ? delayedPos * thetaMaxDeg
          : thetaMaxDeg - delayedPos * thetaMaxDeg

      triples.push({
        upperAngleDeg: delayedUpperAngleDeg,
        scannerPosMm: centeredPos,
        thickness: item.thickness,
      })

      const scannerOffset = (centeredPos / effectiveWidthMm) * 180
      const alphaC = (((delayedUpperAngleDeg + 90) % 360) + 360) % 360
      const alpha1 = ((alphaC + scannerOffset) % 360 + 360) % 360
      const alpha2 = ((alphaC - scannerOffset) % 360 + 360) % 360
      const bin1 = Math.floor(alpha1 / binWidthDeg) % numBins
      const bin2 = Math.floor(alpha2 / binWidthDeg) % numBins
      allBin1.push(bin1)
      allBin2.push(bin2)
      allTimestamps.push(item.timestamp)
      allThicknesses.push(item.thickness)
      binRawThicknessSums[bin1] += item.thickness
      binRawThicknessCounts[bin1] += 1
      binTimestampSums[bin1] += item.timestamp
      binTimestampCounts[bin1] += 1
      if (bin2 !== bin1) {
        binRawThicknessSums[bin2] += item.thickness
        binRawThicknessCounts[bin2] += 1
        binTimestampSums[bin2] += item.timestamp
        binTimestampCounts[bin2] += 1
      }
      totalMeasurements += 1
    }

    if (triples.length < numBins * 2) {
      console.warn(
        `[buildProfile] 有效测量三元组不足: ${triples.length} < ${numBins * 2}`
      )
      return null
    }

    const result = reconstructBubbleThickness(
      triples,
      effectiveWidthMm,
      {
        numBins,
        lambda: 1e-4,
        mu: 0.1,
        processDeformationFactor,
      }
    )

    const nonZeroProfile = result.profile.filter((v) => v > 0)
    if (nonZeroProfile.length < Math.max(numBins * 0.3, 3)) {
      console.warn(
        `[buildProfile] 有效分箱不足: ${nonZeroProfile.length} < ${Math.max(numBins * 0.3, 3)}`
      )
      return null
    }

    if (!isProfilePlausible(result)) return null

    const profile = result.profile
    const binPredictedSums: number[] = new Array(numBins).fill(0)
    const binPredictedCounts: number[] = new Array(numBins).fill(0)
    for (let k = 0; k < allBin1.length; k++) {
      const b1 = allBin1[k]
      const b2 = allBin2[k]
      const predicted = (profile[b1] + profile[b2]) * processDeformationFactor
      binPredictedSums[b1] += predicted
      binPredictedCounts[b1] += 1
      if (b2 !== b1) {
        binPredictedSums[b2] += predicted
        binPredictedCounts[b2] += 1
      }
    }

    const binTimestamps: number[] = binTimestampSums.map((sum, i) =>
      binTimestampCounts[i] > 0 ? sum / binTimestampCounts[i] : 0
    )

    const rawThickness: number[] = binRawThicknessSums.map((sum, i) =>
      binRawThicknessCounts[i] > 0 ? sum / binRawThicknessCounts[i] : 0
    )

    const predictedThickness: number[] = binPredictedSums.map((sum, i) =>
      binPredictedCounts[i] > 0 ? sum / binPredictedCounts[i] : 0
    )

    return {
      ...result,
      numMeasurements: totalMeasurements,
      binTimestamps,
      rawThickness,
      predictedThickness,
    } as any
  }
