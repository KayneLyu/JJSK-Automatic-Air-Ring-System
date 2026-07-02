// ============================================================
// 膜泡重建 — 时间戳与反解分解
// ============================================================

import { computePhiPair } from './geometry'
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

/** 角度距离 (0~180°) */
const angularDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/** profile 上做角度插值 */
const interpolateB = (profile: number[], phiDeg: number): number => {
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

const decomposeSample = (
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
    decomposeSample(measurement, profile, membraneWidthMm, processDeformationFactor)
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
    decomposeSample(measurement, profile, membraneWidthMm, processDeformationFactor)
  )
