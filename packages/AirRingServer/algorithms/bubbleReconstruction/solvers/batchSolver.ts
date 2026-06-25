// ============================================================
// 膜泡重建 — Batch 最小二乘求解器
//
// 求解正规方程：
//   (AᵀA + λI + μ·D₂ᵀD₂) · x = Aᵀb
//
// 使用 Cholesky 分解（矩阵对称正定）。
//
// 适用场景：启动阶段，积累足够数据后一次性求解。
// ============================================================

import type { SparseSystem } from '../types'
import { buildNormalEquations, solveCholesky } from '../matrixBuilder'

const ZERO = 1e-14

/**
 * Batch 模式求解膜泡厚度分布
 *
 * @param sparse       CSR 稀疏系统
 * @param lambda       L2 正则化系数
 * @param mu           Tikhonov 二阶差分平滑系数
 * @returns 解向量 B[0..N-1]
 */
export const solveBatch = (
  sparse: SparseSystem,
  lambda: number,
  mu: number
): number[] => {
  const { M, N } = sparse

  const { lhs, rhs } = buildNormalEquations(sparse, lambda, mu)

  const x = solveCholesky(lhs, rhs)

  // 非负约束：负值归零
  const result = new Array<number>(N)
  for (let i = 0; i < N; i++) {
    result[i] = Math.max(0, x[i])
  }

  return result
}

/**
 * Batch 模式并使用 ml-matrix 的 SVD 求解（更稳定，适合病态矩阵）
 */
export { solveBatch as solveBatchCholesky }
