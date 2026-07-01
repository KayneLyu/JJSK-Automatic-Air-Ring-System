// ============================================================
// 膜泡重建 — Tikhonov 正则化
//
// Tikhonov 正则化的最小二乘问题：
//
//   min_x { ||Ax − b||² + λ||x||² + μ||D₂x||² }
//
// 其中：
//   · λ||x||² — L2 正则化，惩罚大值
//   · μ||D₂x||² — 二阶差分平滑，惩罚高频振荡
//
// 正规方程：
//   (AᵀA + λI + μ·D₂ᵀD₂) · x = Aᵀb
//
// 离散拉普拉斯算子 D₂ (circular)：
//   D₂[i][i] = 6
//   D₂[i][i±1] = −4
//   D₂[i][i±2] = 1
//
// 使用原生 Float64Array，避免 ml-matrix 对象分配。
// ============================================================

const ZERO = 1e-14

/**
 * 构建 Tikhonov 正则化的 D₂ᵀD₂ 矩阵（N×N，行主序 Float64Array）
 *
 * D₂ 的行 i 计算平滑度：Δ²x[i] = x[i−2] − 4x[i−1] + 6x[i] − 4x[i+1] + x[i+2]
 * D₂ᵀD₂ 的 banded 结构：每行最多 9 个非零元。
 */
export const buildD2TD2 = (N: number): Float64Array => {
  const D2TD2 = new Float64Array(N * N)
  for (let i = 0; i < N; i++) {
    const im2 = (i - 2 + N) % N
    const im1 = (i - 1 + N) % N
    const ip1 = (i + 1) % N
    const ip2 = (i + 2) % N

    const kernel = [
      [im2, 1], [im1, -4], [i, 6], [ip1, -4], [ip2, 1],
    ] as const

    for (const [p, wp] of kernel) {
      for (const [q, wq] of kernel) {
        D2TD2[p * N + q] += wp * wq
      }
    }
  }
  return D2TD2
}

/**
 * 计算 Tikhonov 正则化损失
 *
 *   L(x) = ||Ax − b||² + λ||x||² + μ||D₂x||²
 *
 * @param A    测量矩阵 (M×N, 行主序 Float64Array)
 * @param cols A 的列数 N
 */
export const tikhonovLoss = (
  x: number[],
  A: Float64Array,
  cols: number,
  b: Float64Array | number[],
  D2: Float64Array,
  lambda: number,
  mu: number
): number => {
  const N = x.length
  const rows = A.length / cols

  // ||Ax − b||²
  let residual = 0
  for (let i = 0; i < rows; i++) {
    let pred = 0
    const base = i * cols
    for (let j = 0; j < N; j++) pred += A[base + j] * x[j]
    const err = pred - b[i]
    residual += err * err
  }

  // λ||x||²
  let l2Norm = 0
  for (let i = 0; i < N; i++) l2Norm += x[i] * x[i]

  // μ||D₂x||² — D₂ 是 N×N
  let smoothNorm = 0
  for (let i = 0; i < N; i++) {
    let lap = 0
    const d2Base = i * N
    for (let j = 0; j < N; j++) lap += D2[d2Base + j] * x[j]
    smoothNorm += lap * lap
  }

  return residual + lambda * l2Norm + mu * smoothNorm
}

/**
 * L-曲线法选择最优 λ 值
 *
 * 在不同 λ 值下绘制 ||D₂x||² vs ||Ax−b||²，
 * L-曲线的拐点对应最优 λ。
 *
 * 简化版：在候选 λ 值中搜索使 GCV 最小的值。
 *
 * @param lambdaCandidates 候选 λ 值
 * @returns 最优 λ 值
 */
export const lCurveLambdaSelection = (
  lambdaCandidates: number[],
  solveFn: (lambda: number) => { residual: number; smoothness: number }
): number => {
  let bestLambda = lambdaCandidates[0]
  let bestCurvature = -Infinity

  for (let i = 1; i < lambdaCandidates.length - 1; i++) {
    const prev = solveFn(lambdaCandidates[i - 1])
    const curr = solveFn(lambdaCandidates[i])
    const next = solveFn(lambdaCandidates[i + 1])

    const logRes = [Math.log10(prev.residual), Math.log10(curr.residual), Math.log10(next.residual)]
    const logSmooth = [Math.log10(prev.smoothness), Math.log10(curr.smoothness), Math.log10(next.smoothness)]

    // 二阶导数估计拐点曲率
    const d1r = logRes[1] - logRes[0]
    const d2r = logRes[2] - 2 * logRes[1] + logRes[0]
    const d1s = logSmooth[1] - logSmooth[0]
    const d2s = logSmooth[2] - 2 * logSmooth[1] + logSmooth[0]

    const curvature = Math.abs(d1r * d2s - d2r * d1s) / Math.pow(d1r * d1r + d1s * d1s, 1.5)
    if (curvature > bestCurvature) {
      bestCurvature = curvature
      bestLambda = lambdaCandidates[i]
    }
  }

  return bestLambda
}

/**
 * GCV (Generalized Cross-Validation) 准则
 *
 * GCV(λ) = ||Ax−b||² / (tr(I − H(λ)))²
 *
 * 其中 H(λ) = A(AᵀA + λD₂ᵀD₂)⁻¹Aᵀ 是帽子矩阵
 */
export const gcvScore = (
  residualNorm: number,
  nMeasurements: number,
  effectiveDoF: number
): number => {
  const denom = Math.max(1e-10, (nMeasurements - effectiveDoF) / nMeasurements)
  return residualNorm / (nMeasurements * denom * denom)
}
