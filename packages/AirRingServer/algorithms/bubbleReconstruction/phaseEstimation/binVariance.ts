// ============================================================
// 膜泡重建 — Bin Variance 相位估计
//
// 原理：
//   如果角度映射正确（θ_max 正确），同一 φ 对应的多次测量值
//   应具有最小的 bin 内方差。如果 θ_max 错误，同一 bin 会
//   混入不同 φ 的测量值 → 方差增大。
//
// 损失函数：
//   L(θ_max) = Σ_bins (σ²_within_bin) / σ²_global
//
// 搜索策略：
//   1. 多起点网格搜索 (12 起点, 步长 0.5°)
//   2. 局部精搜索 (±5°, 步长 0.1°)
//   3. 黄金分割收敛 (tolerance 0.01°)
//
// 此模块是对现有 upperRotation.estimate.ts 的简化重实现。
// ============================================================

import { goldenSectionSearch } from '../../../utils'

export type BinVarianceData = {
  /** 归一化时间/进度 [0, 1] */
  progress: number
  /** 厚度值 (μm) */
  thickness: number
  /** 扫描仪偏移角度 (°) */
  offsetDeg: number
  /** 行程总时长 (ms) */
  duration: number
  /** 加速段占比 [0, 1] */
  accelRatio: number
}[]

/**
 * 梯形速度曲线位置映射
 *
 * @param progress 行程进度 [0, 1]
 * @param accelRatio 加速段占比
 * @returns 归一化角度位置 [0, 1]
 */
const trapezoidalPosition = (progress: number, accelRatio: number): number => {
  if (accelRatio <= 0) return progress
  const normFactor = 1 / (1 - accelRatio)
  let raw: number
  if (progress < accelRatio) {
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - accelRatio) {
    const lp = (progress - (1 - accelRatio)) / accelRatio
    raw = 0.5 * accelRatio + (1 - 2 * accelRatio) + (lp - 0.5 * lp * lp) * accelRatio
  } else {
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }
  return raw * normFactor
}

/**
 * Bin Variance 损失函数
 *
 * @param data       测量数据数组
 * @param thetaMaxDeg 候选 θ_max (°)
 * @param numBins    分箱数
 * @returns 归一化的 bin 内方差（越小越好）
 */
export const binVarianceLoss = (
  data: BinVarianceData,
  thetaMaxDeg: number,
  numBins: number = 36
): number => {
  const N = data.length
  if (N < 2) return Infinity

  const bw = (2 * Math.PI) / numBins
  const bc = new Uint32Array(numBins)
  const bm = new Float64Array(numBins)
  const b2 = new Float64Array(numBins)
  let totalY = 0,
    totalY2 = 0,
    totalN = 0

  const addToBin = (idx: number, y: number) => {
    const n = ++bc[idx]
    const d = y - bm[idx]
    bm[idx] += d / n
    b2[idx] += d * (y - bm[idx])
  }

  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  for (let i = 0; i < N; i++) {
    const d = data[i]
    if (isNaN(d.thickness)) continue

    const phi =
      trapezoidalPosition(d.progress, d.accelRatio) * thetaMaxRad +
      (d.offsetDeg * Math.PI) / 180
    const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    addToBin(Math.floor(np / bw) % numBins, d.thickness)

    totalY += d.thickness
    totalY2 += d.thickness * d.thickness
    totalN++
  }

  if (totalN < 2) return Infinity

  let totalVar = 0
  let validBins = 0
  for (let i = 0; i < numBins; i++) {
    if (bc[i] >= 2) {
      totalVar += b2[i] / bc[i]
      validBins++
    }
  }

  if (validBins === 0) return Infinity

  const globalVar = totalY2 / totalN - (totalY / totalN) ** 2
  return globalVar > 1e-10 ? totalVar / (validBins * globalVar) : totalVar / validBins
}

/**
 * Bin Variance 法估计最优 θ_max
 *
 * @param data        每个 trip 的测量数据
 * @param minDeg      搜索范围下界 (°)
 * @param maxDeg      搜索范围上界 (°)
 * @param fineStep    精搜索步长 (°)
 * @returns 最优 θ_max (°)，估计失败返回 null
 */
export const estimateThetaMaxByBinVariance = (
  data: BinVarianceData[],
  minDeg: number = 180,
  maxDeg: number = 360,
  fineStep: number = 1.0
): number | null => {
  if (!data || data.length === 0) return null

  // 扁平化为单一数组用于损失计算
  const flatData: BinVarianceData = []
  for (const seg of data) {
    for (const d of seg) {
      flatData.push(d)
    }
  }
  if (flatData.length < 20) return null

  // 多起点网格搜索
  const NUM_STARTS = 12
  const searchRange = maxDeg - minDeg
  let bestTheta: number | null = null
  let bestLoss = Infinity

  for (let start = 0; start < NUM_STARTS; start++) {
    const begin = minDeg + (searchRange / NUM_STARTS) * start
    const end = Math.min(maxDeg, begin + searchRange / NUM_STARTS + 10)

    for (let theta = begin; theta <= end; theta += fineStep) {
      const loss = binVarianceLoss(flatData, theta)
      if (loss < bestLoss) {
        bestLoss = loss
        bestTheta = theta
      }
    }
  }

  if (bestTheta == null) return null

  // 精搜索 ±5°, 步长 0.1°
  const fineMin = Math.max(minDeg, bestTheta - 5)
  const fineMax = Math.min(maxDeg, bestTheta + 5)
  for (let theta = fineMin; theta <= fineMax; theta += 0.1) {
    const loss = binVarianceLoss(flatData, theta)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }

  // 黄金分割最终收敛
  const goldenResult = goldenSectionSearch(
    (th) => binVarianceLoss(flatData, th),
    Math.max(minDeg, bestTheta - 1),
    Math.min(maxDeg, bestTheta + 1),
    0.01
  )

  return Math.round(goldenResult * 100) / 100
}

/**
 * 简化版 Bin Variance（无梯形速度曲线修正）
 *
 * 用于无加速段信息的场景，直接使用线性时间→角度映射。
 */
export const estimateThetaMaxSimple = (
  data: BinVarianceData[],
  minDeg: number = 180,
  maxDeg: number = 360
): number | null => {
  // 将每个数据点的 accelRatio 设为 0 以使用线性映射
  const simplifiedData = data.map((seg) =>
    seg.map((d) => ({ ...d, accelRatio: 0 }))
  )
  return estimateThetaMaxByBinVariance(simplifiedData, minDeg, maxDeg, 1.0)
}
