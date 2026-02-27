/**
 * 上旋相关算法
 * */

import { goldenSectionSearch } from '../utils'
import {
  TripSegment,
  UpperRotationDeltaRange,
  ValidThicknessData,
} from '../types'

/**
 * 鲁棒 theta_max 估计（支持偏心、椭圆、起始相位、非匀速、首趟不完整）
 */
export const estimateThetaMaxWithPhaseCorrection = (
  tripSegments: TripSegment[],
  {
    segments = 24,
    deltaRange: { min = 180, max = 359, step = 1 } = {},
  }: {
    /**
     * 傅里叶阶数 默认：2
     * */
    harmonics?: number
    /**
     * 相位分段数 默认：24
     * */
    segments?: number
    /**
     * 上旋最大旋转角度评估范围
     * */
    deltaRange?: UpperRotationDeltaRange
  } = {}
): number | null => {
  // -------------------------------
  // 1) 标准化正/反向时间轴
  // -------------------------------
  const normalized = tripSegments.map((seg) => ({
    data: seg.isForward
      ? seg.measurements
      : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t })),
    duration: seg.duration,
  }))

  // 初始猜测
  let bestTheta: number | null = null
  let bestLoss = Infinity

  // -----------------------------------------
  // 2) 同时搜索 θmax 与 起始相位 φ0
  // -----------------------------------------
  for (let theta = min; theta < max; theta += step) {
    const loss = evaluatePhaseConsistency(normalized, theta, segments)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }

  if (bestTheta == null) return null

  // 2. 精搜索：在最佳点附近使用黄金分割
  const searchRadius = 10 // 搜索半径

  return goldenSectionSearch(
    (th) => evaluatePhaseConsistency(normalized, th, segments),
    Math.max(min, bestTheta - searchRadius),
    Math.min(max, bestTheta + searchRadius),
    0.1
  )
}

/**
 * 评估相位一致性：通过比较正向/反向行程在膜泡相位域的厚度分布相似性
 * 越小越好。不依赖固定容差，适用于大相位偏移场景。
 * 直方图法
 * @param tripSegments 预处理数据
 * @param thetaMaxDeg 模泡最大角度
 * @param NUM_BINS 相位分段数（用于构建 φ(t) 映射）
 */
const evaluatePhaseConsistency = (
  tripSegments: {
    data: readonly ValidThicknessData[]
    duration: number
  }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  // 输入校验
  if (!tripSegments || tripSegments.length === 0) return Infinity

  const binWidth = (2 * Math.PI) / NUM_BINS
  const allY: number[] = []
  let totalVariance = 0
  let validBinCount = 0

  // 初始化 binValues 数组
  const binValues: number[][] = Array.from({ length: NUM_BINS }, () => [])

  // 填充 binValues 并收集所有 y 值
  for (const { data, duration } of tripSegments) {
    if (!data || data.length === 0) continue // 忽略空数据
    for (const p of data) {
      const phi = ((thetaMaxDeg * Math.PI) / 180 / duration) * p.t
      const normPhi = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      const binIdx = Math.floor(normPhi / binWidth) % NUM_BINS
      binValues[binIdx].push(p.y)
      allY.push(p.y)
    }
  }

  // 计算每个 bin 的方差并累加
  for (let i = 0; i < NUM_BINS; i++) {
    const values = binValues[i]
    if (values.length < 2) continue // 跳过点数不足的 bin

    // 一次遍历计算均值和方差
    let sum = 0
    let sumSquares = 0
    for (const value of values) {
      sum += value
      sumSquares += value * value
    }
    const mean = sum / values.length
    const variance = sumSquares / values.length - mean * mean

    totalVariance += variance
    validBinCount++
  }

  // 若无有效 bin，返回无穷大
  if (validBinCount === 0) return Infinity

  // 计算全局标准差
  const globalMean = allY.reduce((a, b) => a + b, 0) / allY.length
  const globalVariance =
    allY.reduce((sum, y) => sum + (y - globalMean) ** 2, 0) / allY.length
  const globalStd = Math.sqrt(globalVariance)

  // 返回标准化后的方差
  return globalStd > 1
    ? totalVariance / (validBinCount * globalStd * globalStd)
    : totalVariance / validBinCount
}
