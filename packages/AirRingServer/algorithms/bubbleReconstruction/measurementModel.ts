// ============================================================
// 膜泡重建 — 测量模型（前向模型）
//
// 正模型：
//   T(x,t) = η × [ B(φ₁(x,t)) + B(φ₂(x,t)) ]
//
//   其中 η = processDeformationFactor (≈ 1.02)
//
// 离散形式（线性插值）：
//   设 i = ⌊φ/Δφ⌋ mod N，w = φ/Δφ − i
//   B(φ) ≈ (1−w)·B[i] + w·B[i+1]
//
//   T_k / η = (1−w₁)·B[i₁] + w₁·B[i₁_next]
//           + (1−w₂)·B[i₂] + w₂·B[i₂_next]
//
// 矩阵形式：
//   A · b = t     (b = B[j], t_k = T_k / η)
//   A 稀疏，每行 ≤ 4 非零元
// ============================================================

import type { MeasurementTriple, SparseSystem } from './types'
import { computePhiPair } from './geometry'

const ZERO = 1e-14

/**
 * 从测量三元组构建 CSR 稀疏线性系统 A·x = b
 *
 * @param measurements      测量数据
 * @param membraneWidthMm   膜宽 W (mm)
 * @param numBins           分箱数 N
 * @param processDeformationFactor 工艺变形因子 η
 * @returns CSR 稀疏系统
 */
export const buildSparseSystem = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number
): SparseSystem => {
  const M = measurements.length
  const N = numBins
  const binWidth = 360 / N

  const rows: Array<Map<number, number>> = []
  const b = new Float64Array(M)
  const rawThickness = new Float64Array(M)

  for (let k = 0; k < M; k++) {
    const { upperAngleDeg, scannerPosMm, thickness } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    const row = new Map<number, number>()
    const addPair = (phiDeg: number) => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      row.set(lo, (row.get(lo) ?? 0) + (1 - w))
      row.set(hi, (row.get(hi) ?? 0) + w)
    }
    addPair(phi1Deg)
    addPair(phi2Deg)

    rows.push(row)
    b[k] = thickness / processDeformationFactor
    rawThickness[k] = thickness
  }

  let nnz = 0
  for (const row of rows) nnz += row.size

  const rowPtr = new Int32Array(M + 1)
  const colInd = new Int32Array(nnz)
  const values = new Float64Array(nnz)

  let offset = 0
  for (let k = 0; k < M; k++) {
    rowPtr[k] = offset
    for (const [col, val] of rows[k]) {
      colInd[offset] = col
      values[offset] = val
      offset++
    }
  }
  rowPtr[M] = offset

  return { M, N, rowPtr, colInd, values, b, rawThickness }
}

/**
 * 前向预测：给定 profile B[N]，计算所有测量点的预测值
 *
 * @returns T_k (也即双层总厚度的预测值，已包含工艺因子)
 */
export const predictAll = (
  profile: number[],
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  processDeformationFactor: number
): number[] => {
  const N = profile.length
  const binWidth = 360 / N
  const predicted = new Array<number>(measurements.length)

  for (let k = 0; k < measurements.length; k++) {
    const { upperAngleDeg, scannerPosMm } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    const interp = (phiDeg: number): number => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      return profile[lo] * (1 - w) + profile[hi] * w
    }
    predicted[k] = (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor
  }

  return predicted
}

/**
 * 单点预测
 */
export const predictSingle = (
  profile: number[],
  measurement: MeasurementTriple,
  membraneWidthMm: number,
  processDeformationFactor: number = 1.02
): number => {
  const numBins = profile.length
  const binWidth = 360 / numBins
  const { phi1Deg, phi2Deg } = computePhiPair(
    measurement.upperAngleDeg, measurement.scannerPosMm, membraneWidthMm
  )
  const interp = (phiDeg: number): number => {
    const idx = phiDeg / binWidth
    const lo = Math.floor(idx) % numBins
    const hi = (lo + 1) % numBins
    const w = idx - Math.floor(idx)
    return profile[lo] * (1 - w) + profile[hi] * w
  }
  return (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor
}

/**
 * 计算 bin 覆盖度
 */
export const computeBinCoverage = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] => {
  const binWidth = 360 / numBins
  const coverage = new Array<number>(numBins).fill(0)
  for (const { upperAngleDeg, scannerPosMm } of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)
    coverage[Math.floor(phi1Deg / binWidth) % numBins] += 0.5
    coverage[Math.floor(phi2Deg / binWidth) % numBins] += 0.5
  }
  return coverage
}

/**
 * 计算双层厚度分离：
 * 对于边沿测量（δ ≈ ±90°），φ₁ 和 φ₂ 分离 180°，
 * 可以将 T ≈ η×(B(φ₁) + B(φ₂)) 中的近似单层厚度估算出来
 */
export const estimateSingleLayerAtEdge = (
  profile: number[],
  measurement: MeasurementTriple,
  membraneWidthMm: number,
  processDeformationFactor: number = 1.02
): { phi1: number; phi2: number; singleLayer: number } | null => {
  const { phi1Deg, phi2Deg, deltaDeg } = computePhiPair(
    measurement.upperAngleDeg, measurement.scannerPosMm, membraneWidthMm
  )
  // 只在边缘处有效
  if (Math.abs(Math.abs(deltaDeg) - 90) > 10) return null
  return {
    phi1: phi1Deg,
    phi2: phi2Deg,
    singleLayer: measurement.thickness / (2 * processDeformationFactor),
  }
}
