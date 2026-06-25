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
// 对于 N=360，矩阵为 360×360 的对称正定带矩阵。
// 采用 Cholesky 分解求解（来自 ml-matrix）。
// ============================================================

import { Matrix } from 'ml-matrix'
import type { SparseSystem } from './types'

const ZERO = 1e-14

/**
 * 从 CSR 稀疏系统构造增广矩阵 [AᵀA+λI+μD₂ᵀD₂ | Aᵀb]
 */
export const buildNormalEquations = (
  sparse: SparseSystem,
  lambda: number,
  mu: number
): { lhs: Matrix; rhs: Float64Array } => {
  const { M, N, rowPtr, colInd, values, b } = sparse

  // 构建 AᵀA（对称稠密矩阵）
  const ATA = Matrix.zeros(N, N)
  const ATb = new Float64Array(N)

  // 稀疏 A × Aᵀ 累积
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
        const cur = ATA.get(colP, colQ)
        ATA.set(colP, colQ, cur + val)
        if (colP !== colQ) {
          const cur2 = ATA.get(colQ, colP)
          ATA.set(colQ, colP, cur2 + val)
        }
      }
    }
  }

  // 添加 λI
  for (let i = 0; i < N; i++) {
    ATA.set(i, i, ATA.get(i, i) + lambda)
  }

  // 添加 μ·D₂ᵀD₂ (离散拉普拉斯正则化)
  if (mu > ZERO) {
    for (let i = 0; i < N; i++) {
      const im2 = (i - 2 + N) % N
      const im1 = (i - 1 + N) % N
      const ip1 = (i + 1) % N
      const ip2 = (i + 2) % N

      // D₂ 的第 i 行 × D₂ 的第 i 列 → D₂ᵀD₂ 的对角线和近对角元素
      // D₂ᵀD₂ 的非零元素（对每个 i）：
      ATA.set(i, i,     ATA.get(i, i)     + mu *  6)
      ATA.set(i, ip1,   ATA.get(i, ip1)   + mu * -4)
      ATA.set(i, im1,   ATA.get(i, im1)   + mu * -4)
      ATA.set(i, ip2,   ATA.get(i, ip2)   + mu *  1)
      ATA.set(i, im2,   ATA.get(i, im2)   + mu *  1)
    }
  }

  return { lhs: ATA, rhs: ATb }
}

/**
 * 使用 Cholesky 分解求解 Ax = b
 */
export const solveCholesky = (A: Matrix, b: Float64Array): Float64Array => {
  const N = A.rows

  // Cholesky 分解：A = L·Lᵀ
  const L = new Float64Array(N * N)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A.get(i, j)
      for (let k = 0; k < j; k++) {
        sum -= L[i * N + k] * L[j * N + k]
      }
      if (i === j) {
        L[i * N + i] = Math.sqrt(Math.max(sum, ZERO))
      } else {
        L[i * N + j] = sum / Math.max(L[j * N + j], ZERO)
      }
    }
  }

  // 前代：L·y = b
  const y = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let sum = b[i]
    for (let j = 0; j < i; j++) {
      sum -= L[i * N + j] * y[j]
    }
    y[i] = sum / Math.max(L[i * N + i], ZERO)
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
 * D₂[i][i] = 6
 * D₂[i][i±1] = −4
 * D₂[i][i±2] = 1
 */
export const buildLaplacianMatrix = (N: number): Matrix => {
  const D2 = Matrix.zeros(N, N)
  for (let i = 0; i < N; i++) {
    D2.set(i, i, 6)
    D2.set(i, (i + 1) % N, -4)
    D2.set(i, (i - 1 + N) % N, -4)
    D2.set(i, (i + 2) % N, 1)
    D2.set(i, (i - 2 + N) % N, 1)
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
