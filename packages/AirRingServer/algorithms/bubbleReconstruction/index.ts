// ============================================================
// 膜泡厚度重建 — 主入口
//
// 完整流程：
//   1. 几何映射：膜泡圆周 φ ↔ 压平坐标 x
//   2. 相位估计：从扫描数据估计上旋角 θ(t)
//   3. 延迟补偿：补偿运输延迟 τ
//   4. 矩阵构造：建立 A·b = t 稀疏线性系统
//   5. 求解重建：Batch (Cholesky) 或 RLS (在线)
//   6. 后处理：非负约束、平滑、可视化
//
// 算法命名：camelCase 文件/函数，PascalCase 类型，UPPER_SNAKE_CASE 常量
// ============================================================

// ---- 类型 ----
export type * from './types'

// ---- 几何模型 ----
export {
  computePhiPair,
  phiToScannerPosition,
  normalizeAngle,
  angularDifference,
  computePressingCenterShift,
} from './geometry'
export type { PhiPair } from './geometry'

// ---- 测量模型 ----
export {
  buildSparseSystem,
  predictAll,
  predictSingle,
  computeBinCoverage,
  estimateSingleLayerAtEdge,
} from './measurementModel'

// ---- 延迟补偿 ----
export {
  compensateTransportDelay,
  compensateTransportDelayTimeStamp,
  estimateRotationSpeed,
} from './delayCompensation'

// ---- 矩阵构造 ----
export {
  buildNormalEquations,
  solveCholesky,
  buildLaplacianMatrix,
  applyLaplacianSmoothing,
} from './matrixBuilder'

// ---- 求解器 ----
export { solveBatch } from './solvers/batchSolver'
export { solveRLS, rlsIncrementalUpdate, initRLSState } from './solvers/rlsSolver'

// ---- 正则化 ----
export {
  buildD2TD2,
  tikhonovLoss,
  lCurveLambdaSelection,
  gcvScore,
} from './regularization'

// ---- 相位估计 ----
export {
  estimatePhase,
  estimatePhaseHybrid,
  scansToBinVarianceData,
} from './phaseEstimation/phaseEstimator'
export { estimateThetaMaxByBinVariance, binVarianceLoss } from './phaseEstimation/binVariance'
export { estimateShiftByPhaseSlope, pixelsToAngle } from './phaseEstimation/fftPhaseShift'
export {
  estimatePhaseByCrossCorrelation,
  estimatePhaseByFFTCrossCorrelation,
  estimatePhaseFromMultipleScans,
} from './phaseEstimation/crossCorrelation'

// ---- 反解分解 ----
export {
  computeBinTimestamps,
  buildBinDecompositions,
  buildSampleDecompositions,
} from './decompositions'

// ---- 仿真 ----
export {
  generateBubbleProfile,
  generateUniformBubble,
  generateTypicalBubble,
} from './simulation/bubbleSimulator'
export {
  simulateMeasurements,
  simulateSingleScan,
  simulateMultipleScans,
  generateTrueAngles,
} from './simulation/measurementSimulator'

// ---- 验证 ----
export {
  runScenario1_Noiseless,
  runScenario2_WithNoise,
  runScenario3_VariableSpeed,
  runAllScenarios,
  compareSolvers,
  runScenario,
} from './verification/verificationRunner'

// ---- 可视化 ----
export {
  renderAsciiPolar,
  renderSvgPolar,
  exportProfileCsv,
  profileStats,
} from './visualization/polarPlot'
export {
  measurementsToHeatmapGrid,
  renderAsciiHeatmap,
  renderHtmlHeatmap,
  exportMeasurementsCsv,
} from './visualization/heatmap'

// ---- 主 API ----
import type {
  MeasurementTriple,
  BubbleReconstructionOptions,
  BubbleReconstructionResult,
} from './types'
import { buildSparseSystem, predictAll, computeBinCoverage } from './measurementModel'
import { solveBatch } from './solvers/batchSolver'
import { solveRLS } from './solvers/rlsSolver'
import {
  computeBinTimestamps,
  buildBinDecompositions,
  buildSampleDecompositions,
} from './decompositions'

const MIN_VALID_THICKNESS_UM = 1
const SMOOTHING_WEIGHTS = [0.1, 0.2, 0.4, 0.2, 0.1] as const

const clampProfilePositive = (profile: number[]): number[] =>
  profile.map((value) => (value > 0 ? value : 0))

const autoScaleProfile = (
  rawProfile: number[],
  measurements: MeasurementTriple[],
  processFactor: number
): number[] => {
  const rawMean = rawProfile.reduce((sum, value) => sum + value, 0) / rawProfile.length
  const tMean = measurements.reduce((sum, measurement) => sum + measurement.thickness, 0) / measurements.length
  const bTarget = tMean / (2 * processFactor)
  const autoScale = bTarget / Math.max(rawMean, 1e-6)

  if (autoScale > 0.5 && autoScale < 2.0 && Math.abs(autoScale - 1.0) > 0.05) {
    return rawProfile.map((value) => Math.max(0, value * autoScale))
  }

  return clampProfilePositive(rawProfile)
}

const smoothProfileCircular = (profile: number[]): number[] => {
  const numBins = profile.length
  return profile.map((value, index) => {
    const m2 = profile[(index - 2 + numBins) % numBins] ?? 0
    const m1 = profile[(index - 1 + numBins) % numBins] ?? 0
    const p1 = profile[(index + 1) % numBins] ?? 0
    const p2 = profile[(index + 2) % numBins] ?? 0
    return (
      SMOOTHING_WEIGHTS[0] * m2 +
      SMOOTHING_WEIGHTS[1] * m1 +
      SMOOTHING_WEIGHTS[2] * value +
      SMOOTHING_WEIGHTS[3] * p1 +
      SMOOTHING_WEIGHTS[4] * p2
    )
  })
}

/**
 * 从双层测厚数据重建膜泡圆周厚度分布 B(φ)
 *
 * 正模型：
 *   T_k = η × (B(φ₁_k) + B(φ₂_k))
 *   φ₁_k = θ_k + 90° + δ_k   (前层)
 *   φ₂_k = θ_k + 90° − δ_k   (后层)
 *   δ_k  = x_k / W × 180°
 *
 * 关键性质：
 *   φ₁ − φ₂ = 2δ, 仅在边缘 (δ=±90°) 时差 180°
 *   扫描仪覆盖不同 x 打破 φ₁=φ₂ 简并 → 系统满秩
 *
 * @param measurements     (upperAngleDeg, scannerPosMm, thickness)
 * @param membraneWidthMm  膜宽 W (mm)
 * @param options          重建选项
 */
export const reconstructBubbleThickness = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): BubbleReconstructionResult => {
  const numBins = options?.numBins ?? 360
  const lambda = options?.lambda ?? 1e-4
  const mu = options?.mu ?? 0.00625
  const processFactor = options?.processDeformationFactor ?? 1
  const forgettingFactor = options?.forgettingFactor ?? 0.995
  const smoothMu = options?.smoothMu ?? 0.1
  const solverMode = options?.solverMode ?? 'batch'
  const preferAfterTs = options?.preferAfterTs
  const binWidthDeg = 360 / numBins

  if (measurements.length === 0) {
    throw new Error('[BubbleReconstruction] 测量数据为空')
  }

  const validMeasurements = measurements.filter(
    (measurement) => measurement.thickness >= MIN_VALID_THICKNESS_UM
  )

  if (validMeasurements.length === 0) {
    throw new Error('[BubbleReconstruction] 有效测量数据为空')
  }

  if (validMeasurements.length < measurements.length) {
    console.warn(
      `[BubbleReconstruction] 过滤 ${measurements.length - validMeasurements.length} 条厚度<1μm 的异常测量`
    )
  }

  if (validMeasurements.length < numBins) {
    console.warn(
      `[BubbleReconstruction] 测量数 ${validMeasurements.length} < N=${numBins}, 解可能不稳定`
    )
  }

  const sparse = buildSparseSystem(validMeasurements, membraneWidthMm, numBins, processFactor)

  const rawProfile =
    solverMode === 'rls'
      ? solveRLS(sparse, forgettingFactor, smoothMu)
      : solveBatch(sparse, lambda, mu)

  const profile = smoothProfileCircular(
    autoScaleProfile(rawProfile, validMeasurements, processFactor)
  )

  const predicted = predictAll(profile, validMeasurements, membraneWidthMm, processFactor)

  let sumSq = 0,
    maxErr = 0
  for (let k = 0; k < validMeasurements.length; k++) {
    const measurement = validMeasurements[k]
    const predictedThickness = predicted[k]
    if (measurement === undefined || predictedThickness === undefined) continue
    const err = Math.abs(measurement.thickness - predictedThickness)
    sumSq += err * err
    if (err > maxErr) maxErr = err
  }

  const hasTimestamps = validMeasurements.every(
    (measurement) => measurement.timestamp !== undefined
  )
  const decompositionFields = hasTimestamps
    ? {
        binTimestamps: computeBinTimestamps(validMeasurements, membraneWidthMm, numBins),
        binDecompositions: buildBinDecompositions(
          validMeasurements,
          profile,
          membraneWidthMm,
          numBins,
          processFactor,
          preferAfterTs
        ),
        sampleDecompositions: buildSampleDecompositions(
          validMeasurements,
          profile,
          membraneWidthMm,
          processFactor
        ),
      }
    : {}

  return {
    profile,
    numBins,
    binWidthDeg,
    rmsError: Math.sqrt(sumSq / validMeasurements.length),
    maxError: maxErr,
    numMeasurements: validMeasurements.length,
    binCoverage: computeBinCoverage(validMeasurements, membraneWidthMm, numBins),
    ...decompositionFields,
    predictedThickness: predicted,
  }
}
