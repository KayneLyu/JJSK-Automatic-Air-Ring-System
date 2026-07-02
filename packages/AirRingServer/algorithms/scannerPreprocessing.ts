import { calcThickness } from './thickness'
import { computePhiPair } from './bubbleReconstruction/geometry'
import type {
  AirADFallbackSuggestion,
  MeasurementBuildResult,
  MeasurementParams,
  MeasurementTripleInput,
  RotationTripLike,
  SeparationStats,
  SweepPointLike,
  SweepPulseBounds,
  SweepSummaryLike,
  ThetaCoverageStats,
  UpperSweepCoverage,
} from './scannerPreprocessing.types'

// allow: SIZE_OK — this is the required stable migration surface for scanner preprocessing constants and 9 pure functions.

/** 滑动窗口最大包含的扫描趟数 */
export const SCANNER_SLIDING_WINDOW = 640
/** 滑动窗口最大时间跨度 (ms)：超出此范围的趟不参与重构，防止跨工艺状态数据混杂 */
export const WINDOW_MAX_TIME_SPAN_MS = 10 * 60_000
/** 上旋趟匹配容忍间隙 (ms)：超过该值则丢弃该测点，避免错配到过时上旋趟 */
export const UPPER_SWEEP_GAP_TOLERANCE_MS = 1_000
/** 极小时间抖动忽略阈值 (ms)：避免 5~20ms 级别日志噪声 */
export const UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS = 50
/** 重建分箱自适应下限：欠覆盖场景下降分箱，优先保证覆盖连续性 */
export const MIN_ADAPTIVE_NUM_BINS = 90
/** 分箱目标覆盖率：低于该比例时下调分箱 */
export const TARGET_BIN_COVERAGE_RATIO = 0.8
/** φ 对分离度 p95 下限（度）：低于该值说明横向覆盖过窄，重构病态 */
export const MIN_P95_PHI_SEPARATION_DEG = 18
/** θ 覆盖比例下限：低于该值说明上旋时间轴覆盖不足 */
export const MIN_THETA_COVERAGE_RATIO = 0.75
/** θ 覆盖比例硬下限：低于该值说明上旋覆盖严重不足，直接拒绝重构 */
export const HARD_MIN_THETA_COVERAGE_RATIO = 0.65
/** 时延上限（ms）：只拦截明显失真的配置值，避免把长距离合法时延误判为异常 */
export const MAX_EFFECTIVE_TRANSPORT_DELAY_MS = 15 * 60_000
/** 扫描趟摘要默认拉取数量（首屏） */
export const SCANNER_TRIPS_FETCH_COUNT = 400
/** 上旋趟摘要刷新最短间隔，避免高频重复查询 */
export const UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS = 10_000
/** 重建窗口上旋趟拉取数量（较大，优先保证时间覆盖） */
export const UPPER_SWEEPS_FETCH_COUNT = 1200
/** 本页实时刷新间隔（降低 utility 查询压力） */
export const RECON_REFRESH_INTERVAL_MS = 5_000
/** 间隙告警汇总最短间隔，避免按样本刷屏 */
export const GAP_WARNING_SUMMARY_INTERVAL_MS = 15_000

const TIME_TO_ANGLE_SEGMENTS = 60

interface InternalGapStats {
  droppedLateCount: number
  maxDroppedLateGapMs: number
  afterEndCount: number
  maxAfterEndGapMs: number
  beforeFirstCount: number
  maxBeforeFirstGapMs: number
}

type ScannerSampleLike = SweepPointLike | { readonly ts: number; readonly pos: number; readonly ad: number }
type SweepBoundsLike =
  | SweepPulseBounds
  | { readonly membranePulseMin?: number | null; readonly membranePulseMax?: number | null }

// -- 间隙告警节流计数器(模块级，整个 composable 共享) --
let lastGapSummaryWarnAt = 0

/**
 * 仿 packages/AirRingServer/algorithms/timeToAngle.ts::buildTimeToAngle
 * 简化版:采用与后端相同的 20/60/20 加减速分段 + S 形平滑
 */
const timeToAngle = (
  t: number,
  isForward: boolean,
  tHalf: number,
  thetaMaxDeg: number
): number => {
  const totalAngleDeg = thetaMaxDeg
  const segmentAngleDeg = totalAngleDeg / TIME_TO_ANGLE_SEGMENTS

  const accelRatio = 0.2
  const constantRatio = 0.6
  const accelTime = tHalf * accelRatio
  const constantTime = tHalf * constantRatio
  const segmentTimes: number[] = []
  for (let i = 0; i < TIME_TO_ANGLE_SEGMENTS; i++) {
    if (i < TIME_TO_ANGLE_SEGMENTS * 0.2) {
      const accelProgress = i / (TIME_TO_ANGLE_SEGMENTS * 0.2)
      segmentTimes.push(
        (accelTime * (1.5 - 0.5 * accelProgress)) /
          (TIME_TO_ANGLE_SEGMENTS * 0.2)
      )
    } else if (i < TIME_TO_ANGLE_SEGMENTS * 0.8) {
      segmentTimes.push(constantTime / (TIME_TO_ANGLE_SEGMENTS * 0.6))
    } else {
      const decelProgress =
        (i - TIME_TO_ANGLE_SEGMENTS * 0.8) / (TIME_TO_ANGLE_SEGMENTS * 0.2)
      segmentTimes.push(
        (accelTime * (1 + decelProgress)) / (TIME_TO_ANGLE_SEGMENTS * 0.2)
      )
    }
  }

  if (t <= 0) return isForward ? 0 : totalAngleDeg
  if (t >= tHalf) return isForward ? totalAngleDeg : 0

  let elapsed = 0
  for (let i = 0; i < TIME_TO_ANGLE_SEGMENTS; i++) {
    const segmentTime = segmentTimes[i] ?? 0
    if (t <= elapsed + segmentTime) {
      const localT = t - elapsed
      const localAngleDeg = (localT / segmentTime) * segmentAngleDeg
      const normalizedLocal = localT / segmentTime
      const smoothFactor =
        3 * normalizedLocal * normalizedLocal -
        2 * normalizedLocal * normalizedLocal * normalizedLocal
      const correctedLocalAngleDeg = localAngleDeg * smoothFactor
      return isForward
        ? i * segmentAngleDeg + correctedLocalAngleDeg
        : totalAngleDeg - (i * segmentAngleDeg + correctedLocalAngleDeg)
    }
    elapsed += segmentTime
  }
  return isForward ? totalAngleDeg : 0
}

const pulseOf = (sample: ScannerSampleLike): number =>
  'pulse' in sample ? sample.pulse : sample.pos

const boundsOf = (
  pulseBounds?: SweepBoundsLike
): { min: number | null; max: number | null } => {
  if (!pulseBounds) return { min: null, max: null }
  if ('min' in pulseBounds && 'max' in pulseBounds) {
    return { min: pulseBounds.min, max: pulseBounds.max }
  }
  return {
    min: pulseBounds.membranePulseMin ?? null,
    max: pulseBounds.membranePulseMax ?? null,
  }
}

const findUpperSweepAtWithStats = (
  sweeps: readonly RotationTripLike[],
  ts: number,
  gapStats?: InternalGapStats
): RotationTripLike | null => {
  let lo = 0
  let hi = sweeps.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const sweep = sweeps[mid]
    if (sweep && sweep.time <= ts) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const candidate = idx >= 0 ? sweeps[idx] ?? null : null
  if (candidate) {
    const end = candidate.time + candidate.cycleDurationMs
    if (ts <= end) return candidate
    const gapMs = ts - end
    if (gapMs <= UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS) return candidate
    if (gapMs > UPPER_SWEEP_GAP_TOLERANCE_MS) {
      if (gapStats) {
        gapStats.droppedLateCount += 1
        gapStats.maxDroppedLateGapMs = Math.max(gapStats.maxDroppedLateGapMs, gapMs)
      }
      return null
    }
    if (gapStats) {
      gapStats.afterEndCount += 1
      gapStats.maxAfterEndGapMs = Math.max(gapStats.maxAfterEndGapMs, gapMs)
    }
  } else if (sweeps.length > 0) {
    const first = sweeps[0]
    const gapMs = first ? first.time - ts : 0
    if (gapStats) {
      gapStats.beforeFirstCount += 1
      gapStats.maxBeforeFirstGapMs = Math.max(gapStats.maxBeforeFirstGapMs, gapMs)
    }
  }
  return candidate
}

/** 给定 ts, 找出包含它的上旋趟(用于 timeToAngle 算 θ) */
export const findUpperSweepAt = (
  sweeps: readonly RotationTripLike[],
  ts: number
): RotationTripLike | null => findUpperSweepAtWithStats(sweeps, ts)

/** 获取上旋趟的时间覆盖范围 */
export const getUpperSweepsCoverage = (
  sweeps: readonly RotationTripLike[]
): UpperSweepCoverage | null => {
  const first = sweeps[0]
  const last = sweeps[sweeps.length - 1]
  if (!first || !last) return null
  return {
    startTs: first.time,
    endTs: last.time + Math.max(0, last.cycleDurationMs),
  }
}

/** 合并多个 buildMeasurements 结果 */
export const mergeMeasurementBuildResults = (
  builds: readonly MeasurementBuildResult[]
): MeasurementBuildResult => {
  const measurements: MeasurementTripleInput[] = []
  let totalSamples = 0
  let totalMeasurements = 0
  let edgeRejectedCount = 0
  let droppedLateCount = 0
  let transportDelayMs = 0
  for (const build of builds) {
    measurements.push(...build.measurements)
    totalSamples += build.stats.totalSamples
    totalMeasurements += build.stats.totalMeasurements
    edgeRejectedCount += build.stats.edgeRejectedCount
    droppedLateCount += build.stats.droppedLateCount
    transportDelayMs = build.stats.transportDelayMs
  }
  return {
    measurements,
    stats: {
      totalSamples,
      totalMeasurements,
      edgeRejectedCount,
      edgeRejectedRatio:
        totalMeasurements > 0 ? edgeRejectedCount / totalMeasurements : 0,
      droppedLateCount,
      droppedLateRatio: totalSamples > 0 ? droppedLateCount / totalSamples : 0,
      transportDelayMs,
    },
  }
}

/** 用 (pos, ad, ts) + 上旋趟信息 构造测量三元组,δ 居中 + 边外过滤 */
export const buildMeasurements = (
  samples: readonly ScannerSampleLike[],
  airAD: number,
  gain: number,
  transportDelayMs: number,
  upperSweeps: readonly RotationTripLike[],
  params: MeasurementParams,
  pulseBounds?: SweepBoundsLike,
  emitDiagnostics = false
): MeasurementBuildResult => {
  const gapStats: InternalGapStats = {
    droppedLateCount: 0,
    maxDroppedLateGapMs: 0,
    afterEndCount: 0,
    maxAfterEndGapMs: 0,
    beforeFirstCount: 0,
    maxBeforeFirstGapMs: 0,
  }

  const all: MeasurementTripleInput[] = []
  const { min: boundsMin, max: boundsMax } = boundsOf(pulseBounds)
  const hasBounds =
    boundsMin != null &&
    boundsMax != null &&
    Number.isFinite(boundsMin) &&
    Number.isFinite(boundsMax) &&
    boundsMax > boundsMin
  const pulseCenter = hasBounds ? (boundsMin + boundsMax) / 2 : 0
  const pulseHalfSpan = hasBounds ? (boundsMax - boundsMin) / 2 : 0

  for (const sample of samples) {
    if (sample.ad <= 0 || sample.ad >= airAD) continue
    const alignedTs = sample.ts - transportDelayMs
    const upper = findUpperSweepAtWithStats(upperSweeps, alignedTs, gapStats)
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
    const pulse = pulseOf(sample)
    const x = hasBounds
      ? ((pulse - pulseCenter) / pulseHalfSpan) * (params.membraneWidthMm / 2)
      : pulse * params.mmPerPulse
    const thickness = calcThickness(sample.ad, { airAD, gain })
    if (thickness <= 0) continue
    all.push({
      upperAngleDeg: theta,
      scannerPosMm: x,
      thickness,
      timestamp: sample.ts,
    })
  }

  if (all.length === 0) {
    return {
      measurements: [],
      stats: {
        totalSamples: samples.length,
        totalMeasurements: 0,
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

  const width = params.membraneWidthMm
  const deltas = all.map((measurement) => (measurement.scannerPosMm / width) * 180)
  deltas.sort((a, b) => a - b)
  const deltaCenter = deltas[Math.floor(deltas.length / 2)] ?? 0
  const minDelta = deltas[0] ?? 0
  const maxDelta = deltas[deltas.length - 1] ?? 0
  const halfSpan = Math.max(Math.abs(minDelta - deltaCenter), Math.abs(maxDelta - deltaCenter))
  if (emitDiagnostics) {
    console.log(
      `[buildMeasurements] δ 中位数=${deltaCenter.toFixed(1)}° 半跨=${halfSpan.toFixed(1)}° (${minDelta.toFixed(0)}~${maxDelta.toFixed(0)})`
    )
  }

  const triples: MeasurementTripleInput[] = []
  let edgeRejected = 0
  for (const measurement of all) {
    const deltaCentered = (measurement.scannerPosMm / width) * 180 - deltaCenter
    if (Math.abs(deltaCentered) > 90) {
      edgeRejected += 1
      continue
    }
    const centeredX = (deltaCentered / 180) * width
    triples.push({ ...measurement, scannerPosMm: centeredX })
  }
  if (emitDiagnostics && edgeRejected > 0) {
    console.log(`[buildMeasurements] δ 居中后过滤 ${edgeRejected} 条边外测量(|δ|>90°)`)
  }
  return {
    measurements: triples,
    stats: {
      totalSamples: samples.length,
      totalMeasurements: all.length,
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
export const estimateCoverageRatio = (
  measurements: readonly MeasurementTripleInput[],
  membraneWidthMm: number,
  numBins: number
): { readonly coveredBins: number; readonly ratio: number } => {
  if (measurements.length === 0 || numBins <= 0 || membraneWidthMm <= 0) {
    return { coveredBins: 0, ratio: 0 }
  }
  const binWidth = 360 / numBins
  const covered = new Array<boolean>(numBins).fill(false)
  for (const measurement of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(
      measurement.upperAngleDeg,
      measurement.scannerPosMm,
      membraneWidthMm
    )
    covered[Math.floor(phi1Deg / binWidth) % numBins] = true
    covered[Math.floor(phi2Deg / binWidth) % numBins] = true
  }
  const coveredBins = covered.filter(Boolean).length
  return { coveredBins, ratio: coveredBins / numBins }
}

/** 估计 |φ₁-φ₂| 分离度分位数 */
export const estimatePhiSeparationStats = (
  measurements: readonly MeasurementTripleInput[],
  membraneWidthMm: number
): SeparationStats => {
  if (measurements.length === 0 || membraneWidthMm <= 0) {
    return { min: 0, max: 0, p95: 0, mean: 0 }
  }
  const separations = measurements
    .map((measurement) => {
      const { phi1Deg, phi2Deg } = computePhiPair(
        measurement.upperAngleDeg,
        measurement.scannerPosMm,
        membraneWidthMm
      )
      const diff = Math.abs(phi1Deg - phi2Deg) % 360
      return Math.min(diff, 360 - diff)
    })
    .sort((a, b) => a - b)
  const p95Idx = Math.max(
    0,
    Math.min(separations.length - 1, Math.floor(separations.length * 0.95))
  )
  const min = separations[0] ?? 0
  const max = separations[separations.length - 1] ?? 0
  const mean = separations.reduce((sum, value) => sum + value, 0) / separations.length
  return { min, max, p95: separations[p95Idx] ?? 0, mean }
}

/** 估计 θ 覆盖分位数 */
export const estimateThetaCoverageStats = (
  measurements: readonly MeasurementTripleInput[],
  thetaMaxDeg: number
): ThetaCoverageStats => {
  if (measurements.length === 0 || thetaMaxDeg <= 0) {
    return { min: 0, max: 0, p05: 0, p95: 0, span: 0, ratio: 0 }
  }
  const thetas = measurements
    .map((measurement) => measurement.upperAngleDeg)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
  if (thetas.length === 0) {
    return { min: 0, max: 0, p05: 0, p95: 0, span: 0, ratio: 0 }
  }
  const p05Idx = Math.max(0, Math.min(thetas.length - 1, Math.floor(thetas.length * 0.05)))
  const p95Idx = Math.max(0, Math.min(thetas.length - 1, Math.floor(thetas.length * 0.95)))
  const min = thetas[0] ?? 0
  const max = thetas[thetas.length - 1] ?? 0
  const p05 = thetas[p05Idx] ?? 0
  const p95 = thetas[p95Idx] ?? 0
  const span = Math.max(0, p95 - p05)
  return { min, max, p05, p95, span, ratio: span / thetaMaxDeg }
}

/** 根据样本 ad 分布推测回退 airAD */
export const suggestFallbackAirAD = (
  samples: readonly ScannerSampleLike[],
  currentAirAD: number
): AirADFallbackSuggestion | null => {
  const positiveAds = samples
    .map((sample) => sample.ad)
    .filter((ad) => Number.isFinite(ad) && ad > 0)
  if (positiveAds.length < 200) return null

  let above = 0
  for (const ad of positiveAds) {
    if (ad >= currentAirAD) above += 1
  }
  const aboveRatio = above / positiveAds.length
  if (aboveRatio < 0.9) return null

  const sorted = [...positiveAds].sort((a, b) => a - b)
  const p99 = sorted[Math.floor((sorted.length - 1) * 0.99)] ?? 0
  const suggestedAirAD = Math.ceil(Math.max(currentAirAD + 1, 50_300, p99 * 1.01))
  if (!Number.isFinite(suggestedAirAD) || suggestedAirAD <= currentAirAD) {
    return null
  }
  return { suggestedAirAD, aboveRatio, belowRatio: 1 - aboveRatio, p99Ad: p99 }
}

/** 滑动窗口: baseline + 前 N-1 趟,受时间跨度约束 */
export const getWindowTrips = <T extends Pick<SweepSummaryLike, 'sweepId' | 'startTs' | 'endTs'>>(
  allTrips: readonly T[],
  baseline: T
): T[] => {
  const idx = allTrips.findIndex((sweep) => sweep.sweepId === baseline.sweepId)
  if (idx < 0) return [baseline]
  const countStart = Math.max(0, idx - (SCANNER_SLIDING_WINDOW - 1))
  const baselineStart = baseline.startTs
  let timeStart = countStart
  while (
    timeStart < idx &&
    baselineStart - (allTrips[timeStart]?.startTs ?? baselineStart) > WINDOW_MAX_TIME_SPAN_MS
  ) {
    timeStart += 1
  }
  const start = Math.max(countStart, timeStart)
  const trips = allTrips.slice(start, idx + 1)
  if (trips.length < 2 && idx > 0) {
    return allTrips.slice(Math.max(0, idx - 1), idx + 1)
  }
  return trips
}
