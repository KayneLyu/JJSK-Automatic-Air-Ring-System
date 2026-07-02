// ============================================================
// 膜泡重建 — 相位估计器（主入口）
//
// 整合多种相位估计方法，提供统一接口。
//
// 方法：
//   1. binVariance     — Bin 方差法（主方法，最鲁棒）
//   2. crossCorrelation — 互相关法（提供粗估计种子）
//   3. fftPhaseShift    — FFT 相位斜率法（备选）
//
// 流程：
//   1. 用互相关/FFT 提供粗估计
//   2. 在粗估计附近用 Bin Variance 精搜索
//   3. 返回最优估计及置信度
// ============================================================

import type { PhaseEstimateResult, PhaseEstimationMethod } from '../types'
import type { BinVarianceData } from './binVariance'
import {
  estimateThetaMaxByBinVariance,
  binVarianceLoss,
} from './binVariance'
import {
  estimatePhaseByCrossCorrelation,
  estimatePhaseByFFTCrossCorrelation,
} from './crossCorrelation'

/**
 * 从扫描剖面提取 Bin Variance 数据
 *
 * @param scans        多个扫描剖面的厚度值 T[i][j]
 * @param offsetDeg    每个扫描点的 offsetDeg
 * @param accelRatios  每个扫描的加速比
 * @returns BinVarianceData 数组
 */
export const scansToBinVarianceData = (
  scans: number[][],
  offsetDegs: number[][] | number[][],
  accelRatios: number[] = []
): BinVarianceData[] => {
  return scans.map((scan, segIdx) => {
    const M = scan.length
    const accelRatio = accelRatios[segIdx] ?? 0
    const offsets = offsetDegs[segIdx] ?? new Array(M).fill(0)

    return scan.map((thickness, i) => ({
      progress: M > 1 ? i / (M - 1) : 0,
      thickness,
      offsetDeg: offsets[i] ?? 0,
      duration: M,
      accelRatio,
    }))
  })
}

/**
 * 综合相位估计
 *
 * @param scans            扫描剖面数组
 * @param membraneWidthMm  膜宽 W (mm)
 * @param options          选项
 * @returns 相位估计结果
 */
export const estimatePhase = (
  scans: number[][],
  membraneWidthMm: number,
  options: {
    method?: PhaseEstimationMethod
    minDeg?: number
    maxDeg?: number
    offsetDegs?: number[][]
    accelRatios?: number[]
  } = {}
): PhaseEstimateResult | null => {
  const {
    method = 'binVariance',
    minDeg = 180,
    maxDeg = 360,
    offsetDegs = [],
    accelRatios = [],
  } = options

  if (scans.length < 2) return null

  // 方法1: Bin Variance (主要方法)
  if (method === 'binVariance') {
    const bvData = scansToBinVarianceData(scans, offsetDegs, accelRatios)
    const thetaMax = estimateThetaMaxByBinVariance(bvData, minDeg, maxDeg)
    if (thetaMax != null) {
      return {
        thetaDeg: thetaMax,
        thetaMaxDeg: thetaMax,
        confidence: 0.9,
        method: 'binVariance',
      }
    }
  }

  // 方法2: 互相关 (提供粗估计)
  if (method === 'crossCorrelation') {
    const deltaThetas: number[] = []
    let maxCorr = 0

    // 累积所有相邻扫描对之间的偏移
    for (let i = 1; i < scans.length; i++) {
      const result = estimatePhaseByCrossCorrelation(scans[i - 1], scans[i], membraneWidthMm)
      deltaThetas.push(result.deltaThetaDeg)
      maxCorr = Math.max(maxCorr, Math.abs(result.correlation))
    }

    if (deltaThetas.length > 0) {
      const meanDelta = deltaThetas.reduce((a, b) => a + b, 0) / deltaThetas.length
      return {
        thetaDeg: meanDelta,
        thetaMaxDeg: meanDelta * scans.length,
        confidence: Math.min(0.8, maxCorr),
        method: 'crossCorrelation',
      }
    }
  }

  // 方法3: FFT 相位偏移
  if (method === 'fftPhaseShift') {
    const deltaThetas: number[] = []
    let maxRSquared = 0

    for (let i = 1; i < scans.length; i++) {
      const result = estimatePhaseByFFTCrossCorrelation(scans[i - 1], scans[i], membraneWidthMm)
      deltaThetas.push(result.deltaThetaDeg)
      maxRSquared = Math.max(maxRSquared, Math.abs(result.correlation))
    }

    if (deltaThetas.length > 0) {
      const meanDelta = deltaThetas.reduce((a, b) => a + b, 0) / deltaThetas.length
      return {
        thetaDeg: meanDelta,
        thetaMaxDeg: meanDelta * scans.length,
        confidence: Math.min(0.7, maxRSquared),
        method: 'fftPhaseShift',
      }
    }
  }

  return null
}

/**
 * 使用互相关提供粗估计，然后用 Bin Variance 精搜索
 *
 * 这是推荐的混合方法，兼顾速度和精度。
 */
export const estimatePhaseHybrid = (
  scans: number[][],
  membraneWidthMm: number,
  options: {
    minDeg?: number
    maxDeg?: number
    offsetDegs?: number[][]
    accelRatios?: number[]
  } = {}
): PhaseEstimateResult | null => {
  const { minDeg = 180, maxDeg = 360, offsetDegs = [], accelRatios = [] } = options

  // Step 1: 互相关粗估计
  const coarseEstimate = estimatePhase(scans, membraneWidthMm, {
    method: 'crossCorrelation',
  })

  // Step 2: 粗估计附近用 Bin Variance 精搜索
  let searchMin = minDeg
  let searchMax = maxDeg

  if (coarseEstimate && coarseEstimate.confidence > 0.5) {
    const coarseTheta = coarseEstimate.thetaMaxDeg
    searchMin = Math.max(minDeg, coarseTheta - 15)
    searchMax = Math.min(maxDeg, coarseTheta + 15)
  }

  const bvData = scansToBinVarianceData(scans, offsetDegs, accelRatios)
  const thetaMax = estimateThetaMaxByBinVariance(bvData, searchMin, searchMax)

  if (thetaMax != null) {
    return {
      thetaDeg: thetaMax,
      thetaMaxDeg: thetaMax,
      confidence: 0.95,
      method: 'binVariance',
    }
  }

  return coarseEstimate
}
