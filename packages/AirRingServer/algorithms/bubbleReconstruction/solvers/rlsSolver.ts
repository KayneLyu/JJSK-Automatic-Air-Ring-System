// ============================================================
// 膜泡重建 — RLS 在线求解器
//
// 递推最小二乘（Recursive Least Squares）：
//
//   对于每条测量 k（行向量 a_k）：
//     ŷ_k = a_kᵀ · x_k                              — 预测
//     e_k = b_k − ŷ_k                                — 新息
//
//   对角协方差更新（精度形式 π_j = 1/P_jj）：
//     π_{k}[j] = λ_f · π_{k-1}[j] + a_k[j]²         — 精度更新
//
//   预测方差：
//     S_k = Σ_j a_k[j]² / π_k[j] + σ²               — 含测量噪声
//
//   增益：
//     K_k[j] = a_k[j] / (π_k[j] · S_k)              — 归一化增益
//
//   状态更新：
//     x_{k+1}[j] = x_k[j] + K_k[j] · e_k
//
// 周期性拉普拉斯平滑（每 s 步）：
//     x := x − μ_s · L · x
//
// ============================================================

import type { SparseSystem } from '../types'
import { applyLaplacianSmoothing } from '../matrixBuilder'

const ZERO = 1e-14
const MEASUREMENT_NOISE_VAR = 1.0

/**
 * RLS 模式在线求解
 *
 * @param sparse            CSR 稀疏系统
 * @param forgettingFactor 遗忘因子 λ_f ∈ (0, 1]
 * @param smoothMu          平滑系数 μ_s
 * @param nominal           初始厚度标称值 (μm)
 * @param smoothInterval    平滑间隔（每多少步应用一次）
 * @returns 解向量 B[0..N-1]
 */
export const solveRLS = (
  sparse: SparseSystem,
  forgettingFactor: number,
  smoothMu: number,
  nominal: number = 50,
  smoothInterval: number = 200
): number[] => {
  const { M, N, rowPtr, colInd, values, b } = sparse

  // 初始化状态 B = nominal
  const B = new Float64Array(N)
  for (let i = 0; i < N; i++) B[i] = nominal

  // 对角协方差精度（π_j = 1/P_jj）
  // 初始化为较大值 → 初始步长较小，避免早期 overshoot
  const pi = new Float64Array(N)
  for (let i = 0; i < N; i++) pi[i] = 10.0

  for (let k = 0; k < M; k++) {
    const start = rowPtr[k]
    const end = rowPtr[k + 1]

    // Step 1: 预测 ŷ = a_kᵀ · B
    let predicted = 0
    for (let p = start; p < end; p++) {
      predicted += values[p] * B[colInd[p]]
    }
    const e = b[k] - predicted

    // Step 2: 更新精度
    for (let p = start; p < end; p++) {
      const col = colInd[p]
      const a = values[p]
      pi[col] = forgettingFactor * pi[col] + a * a
    }

    // Step 3: 计算预测方差 S = Σ a[j]² / π[j] + σ²
    let predVar = MEASUREMENT_NOISE_VAR
    for (let p = start; p < end; p++) {
      const col = colInd[p]
      const a = values[p]
      predVar += (a * a) / Math.max(ZERO, pi[col])
    }

    // Step 4: 状态更新 B[j] += K[j] · e
    if (predVar > ZERO) {
      for (let p = start; p < end; p++) {
        const col = colInd[p]
        const a = values[p]
        const gain = a / Math.max(ZERO, pi[col] * predVar)
        B[col] += gain * e
      }
    }

    // Step 5: 裁剪异常值（防止溢出）
    for (let p = start; p < end; p++) {
      const col = colInd[p]
      if (!isFinite(B[col])) B[col] = nominal
      if (B[col] < 0) B[col] = 0
      if (B[col] > 500) B[col] = 500
    }

    // Step 6: 周期性拉普拉斯平滑
    if (smoothMu > ZERO && (k + 1) % smoothInterval === 0) {
      const s = applyLaplacianSmoothing(B, smoothMu * 0.03)
      for (let i = 0; i < N; i++) {
        B[i] = s[i]
        if (!isFinite(B[i])) B[i] = nominal
      }
    }
  }

  const result = new Array<number>(N)
  for (let i = 0; i < N; i++) result[i] = Math.max(0, B[i])
  return result
}

/**
 * RLS 增量更新（单步）
 *
 * 用于流式数据场景，每个新测量到来时调用一次。
 *
 * @returns 更新后的 profile 和新息
 */
export const rlsIncrementalUpdate = (
  profile: Float64Array,
  pi: Float64Array,
  a: { col: number; val: number }[],
  targetB: number,
  forgettingFactor: number
): number => {
  if (a.length === 0) return 0

  // 预测
  let predicted = 0
  for (const { col, val } of a) {
    predicted += val * profile[col]
  }
  const e = targetB - predicted

  // 更新精度
  for (const { col, val } of a) {
    pi[col] = forgettingFactor * pi[col] + val * val
  }

  // 预测方差
  let predVar = MEASUREMENT_NOISE_VAR
  for (const { col, val } of a) {
    predVar += (val * val) / Math.max(ZERO, pi[col])
  }

  // 状态更新
  if (predVar > ZERO) {
    for (const { col, val } of a) {
      const gain = val / Math.max(ZERO, pi[col] * predVar)
      profile[col] += gain * e
      if (!isFinite(profile[col])) profile[col] = 50
    }
  }

  return e
}

/**
 * 初始化 RLS 状态
 */
export const initRLSState = (
  N: number,
  nominal: number = 50,
  initialPrecision: number = 10.0
): { profile: Float64Array; pi: Float64Array } => {
  const profile = new Float64Array(N)
  const piArr = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    profile[i] = nominal
    piArr[i] = initialPrecision
  }
  return { profile, pi: piArr }
}
