import type {
  MeasurementTripleInput,
  RotationTripSummaryRow,
  SweepPoint,
  SweepSummaryRow,
} from '@/types/ipc'
import { calcThickness } from '@jjsk/air-ring-server/algorithms/thickness'
import {
  SCANNER_SLIDING_WINDOW,
  WINDOW_MAX_TIME_SPAN_MS,
  UPPER_SWEEP_GAP_TOLERANCE_MS,
  UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS,
  GAP_WARNING_SUMMARY_INTERVAL_MS,
} from './scannerTripReconstruction.constants'
import type {
  UpperSweepGapStats,
  MeasurementBuildResult,
  SweepPulseBounds,
  SeparationStats,
  ThetaCoverageStats,
  AirADFallbackSuggestion,
  UpperSweepCoverage,
  MeasurementParams,
} from './scannerTripReconstruction.types'
import { timeToAngle } from './utils/sampleDecompose'

// -- 间隙告警节流计数器(模块级，整个 composable 共享) --
let lastGapSummaryWarnAt = 0

/** 给定 ts, 找出包含它的上旋趟(用于 timeToAngle 算 θ) */
export function findUpperSweepAt(
  sweeps: RotationTripSummaryRow[],
  ts: number,
  gapStats?: UpperSweepGapStats
): RotationTripSummaryRow | null {
  // 上旋趟按 time 升序, 用二分定位 time <= ts 的最后一个
  let lo = 0
  let hi = sweeps.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sweeps[mid].time <= ts) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const candidate: RotationTripSummaryRow | null = idx >= 0 ? sweeps[idx] : null
  if (candidate) {
    const end = candidate.time + candidate.cycleDurationMs
    if (ts <= end) {
      return candidate
    }
    // ts 落在候补趟结束之后 → 间隙
    const gapMs = ts - end
    if (gapMs <= UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS) {
      return candidate
    }
    if (gapMs > UPPER_SWEEP_GAP_TOLERANCE_MS) {
      if (gapStats) {
        gapStats.droppedLateCount += 1
        gapStats.maxDroppedLateGapMs = Math.max(
          gapStats.maxDroppedLateGapMs,
          gapMs
        )
      }
      return null
    }
    if (gapStats) {
      gapStats.afterEndCount += 1
      gapStats.maxAfterEndGapMs = Math.max(gapStats.maxAfterEndGapMs, gapMs)
    }
  } else if (sweeps.length > 0) {
    const gapMs = sweeps[0].time - ts
    if (gapStats) {
      gapStats.beforeFirstCount += 1
      gapStats.maxBeforeFirstGapMs = Math.max(
        gapStats.maxBeforeFirstGapMs,
        gapMs
      )
    }
  }
  return candidate
}

/** 获取上旋趟的时间覆盖范围 */
export function getUpperSweepsCoverage(
  sweeps: RotationTripSummaryRow[]
): UpperSweepCoverage | null {
  const first = sweeps[0]
  const last = sweeps[sweeps.length - 1]
  if (!first || !last) return null
  return {
    startTs: first.time,
    endTs: last.time + Math.max(0, last.cycleDurationMs),
  }
}

/** 合并多个 buildMeasurements 结果 */
export function mergeMeasurementBuildResults(
  builds: MeasurementBuildResult[]
): MeasurementBuildResult {
  const measurements: MeasurementTripleInput[] = []
  let totalSamples = 0
  let rawMeasurementCount = 0
  let edgeRejectedCount = 0
  let droppedLateCount = 0
  let transportDelayMs = 0
  for (const b of builds) {
    measurements.push(...b.measurements)
    totalSamples += b.stats.totalSamples
    rawMeasurementCount += b.stats.rawMeasurementCount
    edgeRejectedCount += b.stats.edgeRejectedCount
    droppedLateCount += b.stats.droppedLateCount
    transportDelayMs = b.stats.transportDelayMs
  }
  return {
    measurements,
    stats: {
      totalSamples,
      rawMeasurementCount,
      edgeRejectedCount,
      edgeRejectedRatio:
        rawMeasurementCount > 0 ? edgeRejectedCount / rawMeasurementCount : 0,
      droppedLateCount,
      droppedLateRatio: totalSamples > 0 ? droppedLateCount / totalSamples : 0,
      transportDelayMs,
    },
  }
}

/** 用 (pos, ad, ts) + 上旋趟信息 构造测量三元组,δ 居中 + 边外过滤 */
export function buildMeasurements(
  samples: SweepPoint[],
  airAD: number,
  gain: number,
  transportDelayMs: number,
  upperSweeps: RotationTripSummaryRow[],
  params: MeasurementParams,
  pulseBounds?: SweepPulseBounds,
  emitDiagnostics = true
): MeasurementBuildResult {
  const gapStats: UpperSweepGapStats = {
    droppedLateCount: 0,
    maxDroppedLateGapMs: 0,
    afterEndCount: 0,
    maxAfterEndGapMs: 0,
    beforeFirstCount: 0,
    maxBeforeFirstGapMs: 0,
  }

  // 第一遍: 构建所有三元组
  const all: MeasurementTripleInput[] = []
  const boundsMin = pulseBounds?.membranePulseMin ?? null
  const boundsMax = pulseBounds?.membranePulseMax ?? null
  const hasBounds =
    boundsMin != null &&
    boundsMax != null &&
    Number.isFinite(boundsMin) &&
    Number.isFinite(boundsMax) &&
    boundsMax > boundsMin
  const pulseCenter = hasBounds ? (boundsMin + boundsMax) / 2 : 0
  const pulseHalfSpan = hasBounds ? (boundsMax - boundsMin) / 2 : 0

  for (const s of samples) {
    if (s.ad <= 0 || s.ad >= airAD) continue
    const alignedTs = s.ts - transportDelayMs
    const upper = findUpperSweepAt(upperSweeps, alignedTs, gapStats)
    if (!upper) continue
    const tInTrip = alignedTs - upper.time
    const tHalf = upper.cycleDurationMs
    if (tInTrip < 0 || tInTrip > tHalf) continue
    const theta = timeToAngle(
      tInTrip,
      upper.direction === 'forward',
      tHalf,
      params.thetaMaxDeg
    )
    const x = hasBounds
      ? ((s.pos - pulseCenter) / pulseHalfSpan) * (params.membraneWidthMm / 2)
      : s.pos * params.mmPerPulse
    const T = calcThickness(s.ad, { airAD, gain })
    if (T <= 0) continue
    all.push({
      upperAngleDeg: theta,
      scannerPosMm: x,
      thickness: T,
      timestamp: s.ts,
    })
  }

  if (all.length === 0) {
    return {
      measurements: [],
      stats: {
        totalSamples: samples.length,
        rawMeasurementCount: 0,
        edgeRejectedCount: 0,
        edgeRejectedRatio: 0,
        droppedLateCount: gapStats.droppedLateCount,
        droppedLateRatio:
          samples.length > 0 ? gapStats.droppedLateCount / samples.length : 0,
        transportDelayMs,
      },
    }
  }

  const hasGapIssue =
    gapStats.droppedLateCount > 0 ||
    gapStats.afterEndCount > 0 ||
    gapStats.beforeFirstCount > 0
  if (hasGapIssue) {
    const now = Date.now()
    if (now - lastGapSummaryWarnAt >= GAP_WARNING_SUMMARY_INTERVAL_MS) {
      lastGapSummaryWarnAt = now
      console.warn(
        `[findUpperSweepAt] 样本匹配汇总: droppedLate=${gapStats.droppedLateCount}(max=${gapStats.maxDroppedLateGapMs.toFixed(0)}ms) afterEnd=${gapStats.afterEndCount}(max=${gapStats.maxAfterEndGapMs.toFixed(0)}ms) beforeFirst=${gapStats.beforeFirstCount}(max=${gapStats.maxBeforeFirstGapMs.toFixed(0)}ms) totalSamples=${samples.length} transportDelay=${transportDelayMs.toFixed(0)}ms`
      )
    }
  }

  // 计算 δ 分布,找扫描中心偏移
  const W = params.membraneWidthMm
  const deltas = all.map((m) => (m.scannerPosMm / W) * 180)
  deltas.sort((a, b) => a - b)
  const deltaCenter = deltas[Math.floor(deltas.length / 2)]
  const halfSpan = Math.max(
    Math.abs(deltas[0] - deltaCenter),
    Math.abs(deltas[deltas.length - 1] - deltaCenter)
  )
  if (emitDiagnostics) {
    console.log(
      `[buildMeasurements] δ 中位数=${deltaCenter.toFixed(1)}° 半跨=${halfSpan.toFixed(1)}° (${deltas[0].toFixed(0)}~${deltas[deltas.length - 1].toFixed(0)})`
    )
  }

  // 第二遍: δ 居中后过滤 |δ| > 90° (膜边外)
  const triples: MeasurementTripleInput[] = []
  let edgeRejected = 0
  for (const m of all) {
    const deltaCentered = (m.scannerPosMm / W) * 180 - deltaCenter
    if (Math.abs(deltaCentered) > 90) {
      edgeRejected++
      continue
    }
    const centeredX = (deltaCentered / 180) * W
    triples.push({ ...m, scannerPosMm: centeredX })
  }
  if (emitDiagnostics && edgeRejected > 0) {
    console.log(
      `[buildMeasurements] δ 居中后过滤 ${edgeRejected} 条边外测量(|δ|>90°)`
    )
  }
  return {
    measurements: triples,
    stats: {
      totalSamples: samples.length,
      rawMeasurementCount: all.length,
      edgeRejectedCount: edgeRejected,
      edgeRejectedRatio: all.length > 0 ? edgeRejected / all.length : 0,
      droppedLateCount: gapStats.droppedLateCount,
      droppedLateRatio:
        samples.length > 0 ? gapStats.droppedLateCount / samples.length : 0,
      transportDelayMs,
    },
  }
}

/** 估计 φ 分箱覆盖率 */
export function estimateCoverageRatio(
  measurements: MeasurementTripleInput[],
  membraneWidthMm: number,
  numBins: number
): { coveredBins: number; ratio: number } {
  if (measurements.length === 0 || numBins <= 0 || membraneWidthMm <= 0) {
    return { coveredBins: 0, ratio: 0 }
  }
  const binWidth = 360 / numBins
  const covered = new Array<boolean>(numBins).fill(false)
  for (const m of measurements) {
    const delta = (m.scannerPosMm / membraneWidthMm) * 180
    const alphaCenter = (((m.upperAngleDeg + 90) % 360) + 360) % 360
    const phi1 = (((alphaCenter + delta) % 360) + 360) % 360
    const phi2 = (((alphaCenter - delta) % 360) + 360) % 360
    covered[Math.floor(phi1 / binWidth) % numBins] = true
    covered[Math.floor(phi2 / binWidth) % numBins] = true
  }
  const coveredBins = covered.filter(Boolean).length
  return { coveredBins, ratio: coveredBins / numBins }
}

/** 估计 |φ₁-φ₂| 分离度分位数 */
export function estimatePhiSeparationStats(
  measurements: MeasurementTripleInput[],
  membraneWidthMm: number
): SeparationStats {
  if (measurements.length === 0 || membraneWidthMm <= 0) {
    return { p95: 0, max: 0 }
  }
  const separations = measurements
    .map((m) => {
      const delta = (m.scannerPosMm / membraneWidthMm) * 180
      return Math.min(360, Math.abs(delta) * 2)
    })
    .sort((a, b) => a - b)
  const p95Idx = Math.max(
    0,
    Math.min(separations.length - 1, Math.floor(separations.length * 0.95))
  )
  return { p95: separations[p95Idx], max: separations[separations.length - 1] }
}

/** 估计 θ 覆盖分位数 */
export function estimateThetaCoverageStats(
  measurements: MeasurementTripleInput[],
  thetaMaxDeg: number
): ThetaCoverageStats {
  if (measurements.length === 0 || thetaMaxDeg <= 0) {
    return { p05: 0, p95: 0, span: 0, ratio: 0 }
  }
  const thetas = measurements
    .map((m) => m.upperAngleDeg)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
  if (thetas.length === 0) {
    return { p05: 0, p95: 0, span: 0, ratio: 0 }
  }
  const p05Idx = Math.max(
    0,
    Math.min(thetas.length - 1, Math.floor(thetas.length * 0.05))
  )
  const p95Idx = Math.max(
    0,
    Math.min(thetas.length - 1, Math.floor(thetas.length * 0.95))
  )
  const p05 = thetas[p05Idx]
  const p95 = thetas[p95Idx]
  const span = Math.max(0, p95 - p05)
  return { p05, p95, span, ratio: span / thetaMaxDeg }
}

/** 根据样本 ad 分布推测回退 airAD */
export function suggestFallbackAirAD(
  samples: SweepPoint[],
  currentAirAD: number
): AirADFallbackSuggestion | null {
  const positiveAds = samples
    .map((s) => s.ad)
    .filter((ad) => Number.isFinite(ad) && ad > 0)
  if (positiveAds.length < 200) return null

  let above = 0
  for (const ad of positiveAds) {
    if (ad >= currentAirAD) above += 1
  }
  const aboveRatio = above / positiveAds.length
  if (aboveRatio < 0.9) return null

  const sorted = [...positiveAds].sort((a, b) => a - b)
  const p99 = sorted[Math.floor((sorted.length - 1) * 0.99)]
  const suggestedAirAD = Math.ceil(
    Math.max(currentAirAD + 1, 50_300, p99 * 1.01)
  )
  if (!Number.isFinite(suggestedAirAD) || suggestedAirAD <= currentAirAD) {
    return null
  }
  return { suggestedAirAD, aboveRatio, p99Ad: p99 }
}

/** 滑动窗口: baseline + 前 N-1 趟,受时间跨度约束 */
export function getWindowTrips(
  allTrips: SweepSummaryRow[],
  baseline: SweepSummaryRow
): SweepSummaryRow[] {
  const idx = allTrips.findIndex((s) => s.sweepId === baseline.sweepId)
  if (idx < 0) return [baseline]
  const countStart = Math.max(0, idx - (SCANNER_SLIDING_WINDOW - 1))
  const baselineStart = baseline.startTs
  let timeStart = countStart
  while (
    timeStart < idx &&
    baselineStart - allTrips[timeStart].startTs > WINDOW_MAX_TIME_SPAN_MS
  ) {
    timeStart++
  }
  const start = Math.max(countStart, timeStart)
  const trips = allTrips.slice(start, idx + 1)
  if (trips.length < 2 && idx > 0) {
    return allTrips.slice(Math.max(0, idx - 1), idx + 1)
  }
  return trips
}
