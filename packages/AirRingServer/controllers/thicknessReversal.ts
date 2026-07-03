/**
 * 膜泡厚度重建控制器
 *
 * 基于 bubbleReconstruction 完整双层线性系统求解膜泡圆周厚度分布 B(φ)：
 *   T_k = η × (B(φ₁_k) + B(φ₂_k))
 *   φ₁ = θ + 90° + δ,  φ₂ = θ + 90° − δ
 *   δ = (x / W) × 180°
 *
 * 替代旧的 thicknessReverseCalculation 简化几何模型。
 * 重建后可通过 decomposeMeasurement 将任意测量点分解为前后层贡献，
 * 验证 η×(B(φ₁)+B(φ₂)) ≈ T_measured。
 */
import type { ThicknessData } from '../connections/thickness'
import type { RingData } from '../connections/airRing'
import {
  reconstructBubbleThickness,
  computePhiPair,
  normalizeAngle,
} from '../algorithms/bubbleReconstruction'
import type {
  MeasurementTriple,
  BubbleReconstructionOptions,
} from '../algorithms/bubbleReconstruction'
import { buildTimeToAngle } from '../algorithms/timeToAngle'
import { calcThickness, type ThicknessCalcConfig } from '../algorithms/thickness'

// ---- 导出类型 ----

export interface ThicknessReversalOptions {
  /** 膜宽 (mm) */
  membraneWidthMm: number
  /** 上旋最大旋转角度 (deg) */
  thetaMaxDeg: number
  /** 上旋单程时间 (ms) */
  T_half: number
  /** 脉冲→mm 转换系数 (mm/pulse) */
  pulseToMm: number
  /** 风道总数 (用于 timeToAngle 分段，默认 8) */
  fanCount?: number
  /** 每多少条新测量触发一次重建 (默认 5000) */
  reconstructInterval?: number
  /** 测量缓冲区上限 (默认 100000) */
  bufferWindowSize?: number
  /** 重建历史保留数量 (默认 10) */
  historyMaxSize?: number
  /** 重建算法选项 */
  reconstructionOptions?: Partial<BubbleReconstructionOptions>
  /** X光测厚计算配置（airAD + gain），将 ADBox 原始光通量转换为 μm */
  thicknessCalcConfig?: ThicknessCalcConfig
}

export interface ThicknessReversalResult {
  /** 重建后的膜泡圆周厚度分布 B(φ) (μm) */
  profile: number[]
  /** 分箱数 */
  numBins: number
  /** 每 bin 宽度 (°) */
  binWidthDeg: number
  /** 均方根误差 (μm) */
  rmsError: number
  /** 最大误差 (μm) */
  maxError: number
  /** 测量数 */
  numMeasurements: number
  /** 每 bin 覆盖度 */
  binCoverage: number[]
  /** 重建时间戳 */
  timestamp: number
}

export interface ThicknessReversalState {
  /** 最后一次重建时间戳 */
  lastReconstructionTimestamp: number
  /** 当前上旋方向 */
  isForward: boolean
  /** 当前单程起始时间戳 */
  tripStartTime?: number
  /** 已累积的测量数 */
  measurementCount: number
  /** 最新重建结果 */
  lastResult?: ThicknessReversalResult
}

/** 单点分解结果：将测量厚度分解为前后层 B(φ) 贡献 */
export interface DecomposeResult {
  /** 当前上旋角 (°) */
  upperAngleDeg: number
  /** 扫描仪位置 (mm) */
  scannerPosMm: number
  /** 角位移 δ (°) */
  deltaDeg: number
  /** 压合中心角 αC (°) */
  alphaCenterDeg: number
  /** 前层角 φ₁ (°) */
  phi1Deg: number
  /** 后层角 φ₂ (°) */
  phi2Deg: number
  /** 前层厚度 B(φ₁) (μm) */
  singleLayerFront: number
  /** 后层厚度 B(φ₂) (μm) */
  singleLayerBack: number
  /** 预测的双层总厚度 η×(B(φ₁)+B(φ₂)) (μm) */
  predictedThickness: number
  /** 实测双层总厚度 (μm) */
  measuredThickness: number
  /** 残差 = 实测 − 预测 (μm) */
  residual: number
}

