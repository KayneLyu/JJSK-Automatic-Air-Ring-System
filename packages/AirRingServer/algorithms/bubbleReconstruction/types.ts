// ============================================================
// 膜泡重建 — 类型定义
// ============================================================

/** 单条测厚仪测量三元组 */
export type MeasurementTriple = {
  /** 当前上旋角 (°) */
  upperAngleDeg: number
  /** 测厚仪探头位置 (mm) 在压平膜宽方向 */
  scannerPosMm: number
  /** 双层总厚度 (μm) */
  thickness: number
  /** 测量时间戳 (ms)，用于 per-bin/sample 反解展示 */
  timestamp?: number
}

/** 膜泡重建配置 */
export type BubbleReconstructionOptions = {
  /** 角度分箱数 N (默认 360, 1°/bin) */
  numBins?: number
  /** L2 正则化系数 λ (默认 1e-4) */
  lambda?: number
  /** Tikhonov 二阶差分平滑系数 μ (默认 0.00625) */
  mu?: number
  /** 工艺变形因子 η (默认 1.0) */
  processDeformationFactor?: number
  /** RLS 遗忘因子 λ_f ∈ (0,1] (默认 0.995) */
  forgettingFactor?: number
  /** RLS 二阶差分平滑系数 μ_s (默认 0.1, 每 200 步应用) */
  smoothMu?: number
  /** 求解模式 (默认 'rls') */
  solverMode?: 'batch' | 'rls'
  /** tooltip 反解时优先选择 ts >= 此值的样本 */
  preferAfterTs?: number
}

/** 单个 bin 的代表样本反解 */
export interface BinDecomposition {
  ts: number
  phi1: number
  phi2: number
  b1: number
  b2: number
  tMeasured: number
  tPredicted: number
}

/** 单个测量样本的完整反解 */
export interface SampleDecomposition {
  ts: number
  phi1: number
  phi2: number
  b1: number
  b2: number
  tMeasured: number
  tPredicted: number
}

/** 膜泡重建结果 */
export type BubbleReconstructionResult = {
  /** 重建后的膜泡圆周厚度分布 B[0..N-1] (μm) */
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
  /** 每 bin 覆盖度 (等效观测次数) */
  binCoverage: number[]
  /** 每个 bin 的贡献样本平均时间戳 (ms)，无贡献为 0 */
  binTimestamps?: number[]
  /** 每个 bin 的代表样本反解 */
  binDecompositions?: BinDecomposition[]
  /** 样本级反解列表 */
  sampleDecompositions?: SampleDecomposition[]
  /** 预测的测量厚度 (μm) */
  predictedThickness?: number[]
}

/** CSR 稀疏矩阵 */
export type SparseSystem = {
  M: number
  N: number
  rowPtr: Int32Array
  colInd: Int32Array
  values: Float64Array
  b: Float64Array
  rawThickness: Float64Array
}

/** 膜泡厚度分布生成器参数 */
export type BubbleSimulatorParams = {
  /** 基准厚度 (μm) */
  baseThickness: number
  /** 低频波动幅值 (μm) */
  lowFreqAmplitude: number
  /** 低频波动周期数 (圈内完整正弦周期数) */
  lowFreqHarmonics: number
  /** 高频扰动幅值 (μm) */
  highFreqAmplitude: number
  /** 高频扰动周期数 */
  highFreqHarmonics: number
  /** 随机噪声标准差 (μm) */
  noiseStdDev: number
  /** 是否添加局部缺陷（厚点/薄点） */
  withDefects?: boolean
  /** 种子 (0 = 随机) */
  seed?: number
}

/** 测量仿真器参数 */
export type MeasurementSimulatorParams = {
  /** 膜宽 W (mm) */
  membraneWidthMm: number
  /** 上旋角速度 (°/s) */
  rotationSpeedDegPerSec: number
  /** 扫描周期 Ts (s) */
  scanPeriodSec: number
  /** 扫描采样点数 M */
  numScanPoints: number
  /** 运输延迟 τ (s) */
  transportDelaySec: number
  /** 总仿真时间 (s) */
  totalTimeSec: number
  /** 工艺变形因子 η */
  processDeformationFactor: number
  /** 测量噪声标准差 (μm) */
  measurementNoiseStdDev: number
}

/** 相位估计方法枚举 */
export type PhaseEstimationMethod = 'binVariance' | 'crossCorrelation' | 'fftPhaseShift'

/** 相位估计结果 */
export type PhaseEstimateResult = {
  /** 估计的上旋角 (°) */
  thetaDeg: number
  /** 上旋范围 θ_max (°) */
  thetaMaxDeg: number
  /** 置信度 (0-1) */
  confidence: number
  /** 方法名 */
  method: PhaseEstimationMethod
}

/** 验证场景结果 */
export type VerificationResult = {
  scenario: string
  rmsErrorUm: number
  maxErrorUm: number
  phaseErrorDeg: number
  coveragePercent: number
  solverTimeMs: number
}
