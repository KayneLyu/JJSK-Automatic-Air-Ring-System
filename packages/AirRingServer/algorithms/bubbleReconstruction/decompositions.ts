// ============================================================
// 膜泡重建 — 时间戳与反解分解
// ============================================================

// allow: SIZE_OK — central decomposition API retains existing reconstruction helpers plus migrated sample decomposition exports.

import { calcThickness, type ThicknessCalcConfig } from '../thickness'
import { computePhiPair, normalizeAngle } from './geometry'
import type {
  BinDecomposition,
  MeasurementTriple,
  SampleDecomposition,
} from './types'

const EMPTY_BIN_DECOMPOSITION: BinDecomposition = {
  ts: 0,
  phi1: 0,
  phi2: 0,
  b1: 0,
  b2: 0,
  tMeasured: 0,
  tPredicted: 0,
}

const TIME_TO_ANGLE_SEGMENTS = 60

export interface DecomposeInput {
  /** 扫描样本 (pos, ad, ts) */
  readonly pos: number
  readonly ad: number
  readonly ts: number
  /** 该样本所属的上旋扫描趟 */
  readonly tripStartTime: number
  readonly tripDurationMs: number
  readonly isForward: boolean
  /** 几何参数 */
  readonly mmPerPulse: number
  readonly membraneWidthMm: number
  readonly thetaMaxDeg: number
  /** B(φ) 剖面(360 bin) */
  readonly profile: number[]
  /** 测厚仪计算参数 */
  readonly thicknessCfg: ThicknessCalcConfig
  /** 形变因子 */
  readonly processDeformation: number
}

export interface DecomposeResult {
  readonly ts: number
  readonly x: number
  readonly delta: number
  readonly theta: number
  readonly alphaCenter: number
  readonly phi1: number
  readonly phi2: number
  readonly b1: number
  readonly b2: number
  readonly tMeasured: number
  readonly tPredicted: number
  readonly residual: number
}

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

/** 角度距离 (0~180°) */
export const angularDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/** profile 上做角度插值 */
export const interpolateB = (profile: number[], phiDeg: number): number => {
  const numBins = profile.length
  if (numBins === 0) return 0

  const binWidth = 360 / numBins
  const normalized = ((phiDeg % 360) + 360) % 360
  const idx = normalized / binWidth
  const lo = Math.floor(idx) % numBins
  const hi = (lo + 1) % numBins
  const w = idx - Math.floor(idx)
  return (profile[lo] ?? 0) * (1 - w) + (profile[hi] ?? 0) * w
}

/**
 * per-bin 平均时间戳: 对 bin 有贡献的样本 ts 按插值权重加权平均。
 * 无 timestamp 的样本按 0 处理；调用方通常只在全部样本有 timestamp 时使用。
 */
export const computeBinTimestamps = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] => {
  const binWidth = 360 / numBins
  const sums = new Float64Array(numBins)
  const counts = new Float64Array(numBins)

  for (const { upperAngleDeg, scannerPosMm, timestamp } of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )
    const ts = timestamp ?? 0
    const addPair = (phiDeg: number): void => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % numBins
      const hi = (lo + 1) % numBins
      const w = idx - Math.floor(idx)
      sums[lo] += ts * (1 - w)
      counts[lo] += 1 - w
      sums[hi] += ts * w
      counts[hi] += w
    }
    addPair(phi1Deg)
    addPair(phi2Deg)
  }

  const result = new Array<number>(numBins)
  for (let i = 0; i < numBins; i++) {
    result[i] = counts[i] > 0 ? sums[i] / counts[i] : 0
  }
  return result
}

const decomposeMeasurement = (
  measurement: MeasurementTriple,
  profile: number[],
  membraneWidthMm: number,
  processDeformationFactor: number
): SampleDecomposition => {
  const { phi1Deg, phi2Deg } = computePhiPair(
    measurement.upperAngleDeg,
    measurement.scannerPosMm,
    membraneWidthMm
  )
  const b1 = interpolateB(profile, phi1Deg)
  const b2 = interpolateB(profile, phi2Deg)

  return {
    ts: measurement.timestamp ?? 0,
    phi1: phi1Deg,
    phi2: phi2Deg,
    b1,
    b2,
    tMeasured: measurement.thickness,
    tPredicted: processDeformationFactor * (b1 + b2),
  }
}

/** 每个 bin 找代表样本，返回该样本的完整反解。 */
export const buildBinDecompositions = (
  measurements: MeasurementTriple[],
  profile: number[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number,
  preferAfterTs?: number
): BinDecomposition[] => {
  if (measurements.length === 0) {
    return new Array<BinDecomposition>(numBins).fill(EMPTY_BIN_DECOMPOSITION)
  }

  const binWidth = 360 / numBins
  const perMeasurement = measurements.map((measurement) =>
    decomposeMeasurement(measurement, profile, membraneWidthMm, processDeformationFactor)
  )
  const result = new Array<BinDecomposition>(numBins)
  const timePenaltyDeg = preferAfterTs !== undefined ? 3 : 0

  for (let i = 0; i < numBins; i++) {
    const binAngle = i * binWidth + binWidth / 2
    let bestIdx = 0
    let bestDist = Infinity

    for (let k = 0; k < perMeasurement.length; k++) {
      const sample = perMeasurement[k] ?? EMPTY_BIN_DECOMPOSITION
      const d1 = angularDistance(sample.phi1, binAngle)
      const d2 = angularDistance(sample.phi2, binAngle)
      const timePenalty =
        preferAfterTs !== undefined && sample.ts < preferAfterTs ? timePenaltyDeg : 0
      const distance = Math.min(d1, d2) + timePenalty

      if (distance < bestDist) {
        bestDist = distance
        bestIdx = k
      }
    }

    result[i] = perMeasurement[bestIdx] ?? EMPTY_BIN_DECOMPOSITION
  }

  return result
}

/** 样本级反解：每个测量样本对应一组 (φ₁, φ₂, B₁, B₂, T_pred, T_meas, ts)。 */
export const buildSampleDecompositions = (
  measurements: MeasurementTriple[],
  profile: number[],
  membraneWidthMm: number,
  processDeformationFactor: number
): SampleDecomposition[] =>
  measurements.map((measurement) =>
    decomposeMeasurement(measurement, profile, membraneWidthMm, processDeformationFactor)
  )

/**
 * 对单个测厚仪样本做完整反解
 */
export const decomposeSample = (input: DecomposeInput): DecomposeResult => {
  const x = input.pos * input.mmPerPulse
  const delta = (x / input.membraneWidthMm) * 180
  const tInTrip = input.ts - input.tripStartTime
  const tHalf = input.tripDurationMs / 2
  const theta = timeToAngle(tInTrip, input.isForward, tHalf, input.thetaMaxDeg)
  const alphaCenter = theta + 90
  const phi1 = normalizeAngle(alphaCenter + delta)
  const phi2 = normalizeAngle(alphaCenter - delta)
  const b1 = interpolateB(input.profile, phi1)
  const b2 = interpolateB(input.profile, phi2)
  const tMeasured = calcThickness(input.ad, input.thicknessCfg)
  const tPredicted = input.processDeformation * (b1 + b2)
  return {
    ts: input.ts,
    x,
    delta,
    theta,
    alphaCenter,
    phi1,
    phi2,
    b1,
    b2,
    tMeasured,
    tPredicted,
    residual: tMeasured - tPredicted,
  }
}

/**
 * 在样本数组中找最接近目标 ts 的样本(用于 hover bin 时取代表样本)
 */
export const findClosestSample = <T extends { readonly ts: number }>(
  samples: readonly T[],
  targetTs: number
): T | null => {
  if (samples.length === 0) return null
  // 假设样本按 ts 升序,用二分
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const sample = samples[mid]
    if (sample && sample.ts < targetTs) lo = mid + 1
    else hi = mid
  }
  const cand1 = samples[lo]
  if (!cand1) return null
  const cand2 = lo > 0 ? samples[lo - 1] ?? null : null
  if (!cand2) return cand1
  return Math.abs(cand1.ts - targetTs) < Math.abs(cand2.ts - targetTs)
    ? cand1
    : cand2
}
