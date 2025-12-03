/**
 * 上旋相关算法
 * */

import { goldenSectionSearch } from '../utils'
import {
  ThetaMaxEstimateResult,
  TripSegment,
  ValidThicknessData,
} from '../types'

/**
 * 高鲁棒性 theta_max 估计（支持椭圆膜泡 + 偏心）
 */
export const estimateThetaMaxWithPhaseCorrection = (
  forwardTrip: TripSegment,
  backwardTrip: TripSegment,
  {
    harmonics = 2,
    segments = 20,
  }: {
    /**
     * 傅里叶阶数 默认：2
     * */
    harmonics?: number
    /**
     * 相位分段数 默认：20
     * */
    segments?: number
  } = {}
): ThetaMaxEstimateResult | null => {
  // 校验周期一致性
  const dt = Math.abs(forwardTrip.duration - backwardTrip.duration)
  if (dt > 2000) {
    console.warn(`Half-cycle mismatch: ${dt} ms`)
    return null
  }
  const dataF = forwardTrip.measurements
  const dataB = backwardTrip.measurements.map((p) => ({
    ...p,
    t: backwardTrip.duration - p.t,
  })) // ← 关键！
  if (dataF.length === 0 || dataB.length === 0) {
    return null
  }

  // 初始猜测
  let bestTheta: number | null = null
  let bestLoss = Infinity

  // 在 [180, 360] 搜索 theta_max
  for (let theta = 180; theta < 360; theta += 2) {
    const loss = evaluatePhaseConsistencyV2(
      dataF,
      dataB,
      theta,
      forwardTrip.duration,
      segments
    )
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }
  if (!bestTheta) return null
  // 可选：精细搜索
  const refined = goldenSectionSearch(
    (th) =>
      evaluatePhaseConsistencyV2(
        dataF,
        dataB,
        th,
        forwardTrip.duration,
        segments
      ),
    Math.max(180, bestTheta - 10),
    Math.min(360, bestTheta + 10),
    0.2
  )

  // 计算最终 R²（使用校正后相位）
  const finalR2 = computeR2WithPhaseCorrection(
    dataF,
    dataB,
    refined,
    forwardTrip.duration,
    segments,
    harmonics
  )

  return {
    thetaMaxDeg: refined,
    rSquared: finalR2,
    residual: bestLoss,
    validPoints: dataF.length + dataB.length,
  }
}

/**
 * 构建角度-时间映射函数
 * */
const buildTimeToAngle = (thetaMaxDeg: number, T_half: number, K: number) => {
  const totalAngle = (thetaMaxDeg * Math.PI) / 180
  const segmentAngle = totalAngle / K
  // 假设每段匀速 → 计算每段应耗时
  const nominalSegmentTime = T_half / K

  // 实际：允许每段时间浮动（但总和=T_half）
  // 为简化，先假设匀速（后续可扩展为优化 {dt_k}）
  const segmentTimes = Array(K).fill(nominalSegmentTime) // 可扩展为优化变量

  // 构建角度映射
  return (t: number, isForward: boolean): number => {
    let elapsed = 0
    for (let i = 0; i < K; i++) {
      if (t <= elapsed + segmentTimes[i]) {
        const localT = t - elapsed
        const localAngle = (localT / segmentTimes[i]) * segmentAngle
        return isForward
          ? i * segmentAngle + localAngle
          : totalAngle - (i * segmentAngle + localAngle)
      }
      elapsed += segmentTimes[i]
    }
    return isForward ? totalAngle : 0
  }
}

/**
 * 构建相位映射
 * */
const buildPhaseMap = (
  dataF: readonly ValidThicknessData[],
  dataB: readonly ValidThicknessData[],
  timeToAngle: (t: number, isForward: boolean) => number
) => {
  // 将所有点映射到膜泡相位 φ ∈ [0, 2π)
  const phiF = dataF.map(
    (p) =>
      ((timeToAngle(p.t, true) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  )
  const phiB = dataB.map(
    (p) =>
      ((timeToAngle(p.t, false) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  )
  return {
    phiF,
    phiB,
  }
}
/**
 * 核心：评估相位一致性（越小越好）
 * 相邻匹配法
 */
const evaluatePhaseConsistencyV1 = (
  dataF: readonly ValidThicknessData[],
  dataB: readonly ValidThicknessData[],
  thetaMaxDeg: number,
  T_half: number,
  K: number
): number => {
  const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, K)
  const { phiF, phiB } = buildPhaseMap(dataF, dataB, timeToAngle)
  // 使用最近邻匹配正反向点（简化版）
  let totalDiff = 0
  let count = 0

  for (let i = 0; i < phiF.length; i++) {
    const match = findBestMatchWithWrap(
      phiF[i],
      phiB,
      dataB.map((p) => p.y)
    )
    if (match) {
      totalDiff += Math.pow(dataF[i].y - match.y, 2)
      count++
    }
  }

  return count > 0 ? totalDiff / count : Infinity
}

/**
 * 在给定 thetaMax 和相位分段下，计算厚度信号的 R²（越高越好）
 */
const computeR2WithPhaseCorrection = (
  dataF: readonly ValidThicknessData[],
  dataB: readonly ValidThicknessData[],
  thetaMaxDeg: number,
  T_half: number,
  K: number,
  N: number
): number => {
  const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, K)
  // 将所有点映射到膜泡相位 φ ∈ [0, 2π)
  const allPoints = [
    ...dataF.map((p) => ({
      phi:
        ((timeToAngle(p.t, true) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI),
      y: p.y,
    })),
    ...dataB.map((p) => ({
      phi:
        ((timeToAngle(p.t, false) % (2 * Math.PI)) + 2 * Math.PI) %
        (2 * Math.PI),
      y: p.y,
    })),
  ]

  if (allPoints.length < 2 * N + 3) return 0

  // 构造傅里叶设计矩阵: [1, cos(φ), sin(φ), cos(2φ), sin(2φ), ...]
  const X: number[][] = []
  const Y: number[] = []

  for (const pt of allPoints) {
    const row = [1] // intercept A0
    for (let n = 1; n <= N; n++) {
      row.push(Math.cos(n * pt.phi))
      row.push(Math.sin(n * pt.phi))
    }
    X.push(row)
    Y.push(pt.y)
  }

  // 解线性最小二乘: β = (XᵀX)⁻¹ XᵀY
  // 使用数值稳定方法（QR 或 SVD），但此处用正规方程（小规模安全）
  const p = X[0].length // 参数个数 = 1 + 2*N
  const XtX: number[][] = Array(p)
    .fill(0)
    .map(() => Array(p).fill(0))
  const XtY: number[] = Array(p).fill(0)

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < p; j++) {
      XtY[j] += X[i][j] * Y[i]
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k]
      }
    }
  }

  // 求解线性系统 XtX * beta = XtY
  // 使用高斯消元（小矩阵）
  try {
    const beta = solveLinearSystem(XtX, XtY)
    if (!beta) return 0

    // 计算预测值和 R²
    let ssRes = 0
    let ssTot = 0
    const yMean = Y.reduce((a, b) => a + b, 0) / Y.length

    for (let i = 0; i < X.length; i++) {
      let pred = 0
      for (let j = 0; j < p; j++) {
        pred += beta[j] * X[i][j]
      }
      ssRes += Math.pow(Y[i] - pred, 2)
      ssTot += Math.pow(Y[i] - yMean, 2)
    }

    return ssTot > 0 ? 1 - ssRes / ssTot : 0
  } catch (e) {
    console.warn('R² computation failed:', e)
    return 0
  }
}

/**
 * 高斯消元法解线性方程组 Ax = b（仅用于小矩阵）
 */
const solveLinearSystem = (A: number[][], b: number[]): number[] | null => {
  const n = A.length
  // 创建增广矩阵
  const M = A.map((row, i) => [...row, b[i]])

  // 前向消元
  for (let i = 0; i < n; i++) {
    // 找主元
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k
      }
    }
    if (Math.abs(M[maxRow][i]) < 1e-12)
      return null // 奇异矩阵

      // 交换行
    ;[M[i], M[maxRow]] = [M[maxRow], M[i]]

    // 消元
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i]
      for (let j = i; j <= n; j++) {
        M[k][j] -= factor * M[i][j]
      }
    }
  }

  // 回代
  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j]
    }
    x[i] = sum / M[i][i]
  }

  return x
}

// 替换原来的最近邻 + 固定容差
const findBestMatchWithWrap = (
  targetPhi: number,
  phiArray: number[],
  yArray: number[],
  maxSearchWindowRad: number = Math.PI / 2 // 默认 ±90°
): { diff: number; y: number } | null => {
  let bestDiff = Infinity
  let bestY = 0

  for (let j = 0; j < phiArray.length; j++) {
    // 计算圆周距离（0 ~ π）
    const d = Math.min(
      Math.abs(phiArray[j] - targetPhi),
      2 * Math.PI - Math.abs(phiArray[j] - targetPhi)
    )

    // 限制搜索范围（避免匹配到对侧）
    if (d <= maxSearchWindowRad && d < bestDiff) {
      bestDiff = d
      bestY = yArray[j]
    }
  }

  return bestDiff < maxSearchWindowRad ? { diff: bestDiff, y: bestY } : null
}

/**
 * 评估相位一致性：通过比较正向/反向行程在膜泡相位域的厚度分布相似性
 * 越小越好。不依赖固定容差，适用于大相位偏移场景。
 * 直方图法
 */
const evaluatePhaseConsistencyV2 = (
  dataF: readonly ValidThicknessData[],
  dataB: readonly ValidThicknessData[],
  thetaMaxDeg: number,
  T_half: number,
  K: number // 相位分段数（用于构建 φ(t) 映射）
): number => {
  const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, K)
  const { phiF, phiB } = buildPhaseMap(dataF, dataB, timeToAngle)
  const yF = dataF.map((p) => p.y)
  const yB = dataB.map((p) => p.y)

  // === 核心：相位直方图一致性评估 ===
  const NUM_BINS = 36 // 每 10° 一个 bin，可根据需要调整（建议 18~72）
  const binWidth = (2 * Math.PI) / NUM_BINS

  // 初始化直方图（存储每个 bin 的厚度总和和计数）
  const sumF = new Float64Array(NUM_BINS)
  const cntF = new Uint32Array(NUM_BINS)
  const sumB = new Float64Array(NUM_BINS)
  const cntB = new Uint32Array(NUM_BINS)

  // 填充正向行程直方图
  for (let i = 0; i < phiF.length; i++) {
    const binIdx = Math.floor(phiF[i] / binWidth) % NUM_BINS
    sumF[binIdx] += yF[i]
    cntF[binIdx]++
  }

  // 填充反向行程直方图
  for (let i = 0; i < phiB.length; i++) {
    const binIdx = Math.floor(phiB[i] / binWidth) % NUM_BINS
    sumB[binIdx] += yB[i]
    cntB[binIdx]++
  }

  // 计算有效 bin 的均方误差（MSE）
  let totalMSE = 0
  let validBinCount = 0

  for (let i = 0; i < NUM_BINS; i++) {
    // 仅当正反行程在该 bin 都有数据时才参与评估
    if (cntF[i] > 0 && cntB[i] > 0) {
      const avgF = sumF[i] / cntF[i]
      const avgB = sumB[i] / cntB[i]
      const diff = avgF - avgB
      totalMSE += diff * diff
      validBinCount++
    }
  }

  // 若几乎没有重叠 bin，返回高损失
  if (validBinCount === 0) {
    return Infinity
  }

  // 返回归一化 MSE（可选：除以厚度方差以无量纲化）
  const meanThickness =
    (yF.reduce((a, b) => a + b, 0) + yB.reduce((a, b) => a + b, 0)) /
    (yF.length + yB.length)
  const thicknessStd = Math.sqrt(
    [...yF, ...yB].reduce((sum, y) => sum + Math.pow(y - meanThickness, 2), 0) /
      (yF.length + yB.length)
  )

  // 避免除零；若信号平坦，用绝对 MSE

  return thicknessStd > 1
    ? totalMSE / (validBinCount * thicknessStd * thicknessStd)
    : totalMSE / validBinCount
}
