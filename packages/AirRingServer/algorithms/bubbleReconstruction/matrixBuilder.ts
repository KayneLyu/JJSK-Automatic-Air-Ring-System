// ============================================================
// 膜泡重建 — 矩阵构造
//
// 从 CSR 稀疏系统构造正规方程矩阵 (AᵀA + λI + μ·D₂ᵀD₂)
//
// D₂ 为离散拉普拉斯算子（circular 边界）：
//   对任意 i：D₂ 的第 i 行有非零元：
//     [i-2]: +1, [i-1]: −4, [i]: +6, [i+1]: −4, [i+2]: +1
//
// 正规方程：
//   (AᵀA + λI + μ·D₂ᵀD₂) · x = Aᵀb
//
// 对于 N=360，矩阵为 360×360 的对称正定矩阵。
// 使用原生 Float64Array 存储，避免 ml-matrix 的对象创建开销。
//
// ATA 存储为线性化行主序数组：ATA[i*N + j] = 第 i 行第 j 列的值。
// ============================================================

import type { SparseSystem } from './types'

const ZERO = 1e-14

/**
 * 从 CSR 稀疏系统构造增广矩阵 [AᵀA+λI+μD₂ᵀD₂ | Aᵀb]
 *
 * 返回的 lhs 为 N×N 的 Float64Array（行主序）。
 * 只填充上三角，由调用方在需要时对称化。
 */
export const buildNormalEquations = (
  sparse: SparseSystem,
  lambda: number,
  mu: number
): { lhs: Float64Array; rhs: Float64Array } => {
  const { M, N, rowPtr, colInd, values, b } = sparse

  // ATA: 扁平化存储，只维护上三角（列索引 ≥ 行索引）
  const ATA = new Float64Array(N * N)
  const ATb = new Float64Array(N)

  // 稀疏 AᵀA 累积：每行最多 4 个非零元
  // 直接填充两个三角形（等效于原始 ml-matrix 版本，但避免了对象创建开销）
  for (let k = 0; k < M; k++) {
    const start = rowPtr[k]
    const end = rowPtr[k + 1]
    for (let p = start; p < end; p++) {
      const colP = colInd[p]
      const valP = values[p]
      ATb[colP] += valP * b[k]
      for (let q = p; q < end; q++) {
        const colQ = colInd[q]
        const val = valP * values[q]
        ATA[colP * N + colQ] += val
        if (colP !== colQ) {
          ATA[colQ * N + colP] += val
        }
      }
    }
  }

  // 添加 λI（只影响对角线 = 上三角）
  for (let i = 0; i < N; i++) {
    ATA[i * N + i] += lambda
  }


  // 添加 μ·D₂ᵀD₂ (9-diagonal, 对称) — D₂ᵀD₂ = D₂² 的正确系数
  if (mu > ZERO) {
    for (let i = 0; i < N; i++) {
      const im4 = (i - 4 + N) % N
      const im3 = (i - 3 + N) % N
      const im2 = (i - 2 + N) % N
      const im1 = (i - 1 + N) % N
      const ip1 = (i + 1) % N
      const ip2 = (i + 2) % N
      const ip3 = (i + 3) % N
      const ip4 = (i + 4) % N

      ATA[i * N + i]   += mu *  70
      ATA[i * N + ip1] += mu * -56
      ATA[i * N + im1] += mu * -56
      ATA[i * N + ip2] += mu *  28
      ATA[i * N + im2] += mu *  28
      ATA[i * N + ip3] += mu *  -8
      ATA[i * N + im3] += mu *  -8
      ATA[i * N + ip4] += mu *   1
      ATA[i * N + im4] += mu *   1
    }
  }

  return { lhs: ATA, rhs: ATb }
}

/**
 * 对称 Cholesky 分解求解 Ax = b。
 *
 * A 以行主序 N×N Float64Array 传入，假定为对称正定且已完全对称化。
 * 使用 O(N³) 标准 Cholesky，对于 N=360 约 ~46M 次浮点操作。
 *
 * 求解流程：
 *   1. Cholesky 分解 A = L·Lᵀ
 *   2. 前代 L·y = b
 *   3. 回代 Lᵀ·x = y
 */
export const solveCholesky = (A: Float64Array, b: Float64Array): Float64Array => {
  const N = Math.round(Math.sqrt(A.length))

  // Cholesky 分解：A = L·Lᵀ（原地覆盖 A 的下三角为 L）
  const L = new Float64Array(N * N)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * N + j] // 对称矩阵
      const rowBaseI = i * N
      const rowBaseJ = j * N
      for (let k = 0; k < j; k++) {
        sum -= L[rowBaseI + k] * L[rowBaseJ + k]
      }
      if (i === j) {
        L[rowBaseI + i] = Math.sqrt(Math.max(sum, ZERO))
      } else {
        L[rowBaseI + j] = sum / Math.max(L[j * N + j], ZERO)
      }
    }
  }

  // 前代：L·y = b
  const y = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let sum = b[i]
    const rowBase = i * N
    for (let j = 0; j < i; j++) {
      sum -= L[rowBase + j] * y[j]
    }
    y[i] = sum / Math.max(L[rowBase + i], ZERO)
  }

  // 回代：Lᵀ·x = y
  const x = new Float64Array(N)
  for (let i = N - 1; i >= 0; i--) {
    let sum = y[i]
    for (let j = i + 1; j < N; j++) {
      sum -= L[j * N + i] * x[j]
    }
    x[i] = sum / Math.max(L[i * N + i], ZERO)
  }

  return x
}

/**
 * 构建 Tikhonov 平滑矩阵 D₂（N×N，circular 边界）
 *
 * D₂[i][i] = 6  D₂[i][i±1] = −4  D₂[i][i±2] = 1
 *
 * 返回行主序扁平 Float64Array。
 */
export const buildLaplacianMatrix = (N: number): Float64Array => {
  const D2 = new Float64Array(N * N)
  for (let i = 0; i < N; i++) {
    D2[i * N + i] = 6
    D2[i * N + (i + 1) % N] = -4
    D2[i * N + (i - 1 + N) % N] = -4
    D2[i * N + (i + 2) % N] = 1
    D2[i * N + (i - 2 + N) % N] = 1
  }
  return D2
}

/**
 * 应用拉普拉斯平滑到 profile
 */
export const applyLaplacianSmoothing = (
  profile: Float64Array,
  mu: number
): Float64Array => {
  const N = profile.length
  const smoothed = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const lap =
      1 * profile[(i - 2 + N) % N] +
      -4 * profile[(i - 1 + N) % N] +
      6 * profile[i] +
      -4 * profile[(i + 1) % N] +
      1 * profile[(i + 2) % N]
    smoothed[i] = profile[i] - mu * lap
  }
  return smoothed
}
