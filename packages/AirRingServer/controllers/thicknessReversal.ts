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
import type { ThicknessData } from '../connections/thickness/types'
import type { RingData } from '../connections/airRing/types'
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

// ---- 内部类型 ----

interface TimedMeasurement extends MeasurementTriple {
  timestamp: number
}

// ---- 内部工具 ----

const interpProfile = (profile: number[], phiDeg: number): number => {
  const N = profile.length
  const bw = 360 / N
  const a = normalizeAngle(phiDeg)
  const idx = a / bw
  const lo = Math.floor(idx) % N
  const hi = (lo + 1) % N
  const w = idx - Math.floor(idx)
  return profile[lo] * (1 - w) + profile[hi] * w
}

// ---- 工厂函数 ----

/**
 * 创建膜泡厚度重建控制器
 *
 * 使用 bubbleReconstruction 完整双层线性系统。
 * 替代旧的 thicknessReverseCalculation 简化模型。
 */
export const thicknessReversal = (options: ThicknessReversalOptions) => {
  const {
    membraneWidthMm,
    thetaMaxDeg,
    T_half,
    pulseToMm,
    fanCount = 8,
    reconstructInterval = 5000,
    bufferWindowSize = 100000,
    historyMaxSize = 10,
    reconstructionOptions = {},
    thicknessCalcConfig,
  } = options

  const timeToAngle = buildTimeToAngle(thetaMaxDeg, T_half, fanCount)

  // ---- 状态 ----
  let isForward = true
  let tripStartTime: number | undefined
  let scannerZeroOffset: number | null = null
  let measurementCount = 0
  let pendingSinceLastRecon = 0
  let lastReconstructionTimestamp = 0
  let lastResult: ThicknessReversalResult | undefined

  const buffer: TimedMeasurement[] = []
  const history: ThicknessReversalResult[] = []

  // ---- 上旋状态更新 ----

  const updateAirRingState = (ringData: RingData) => {
    const ts = ringData.timestamp
    if (ts === undefined) return

    if (ringData.Reset) {
      tripStartTime = ts
      isForward = true
      return
    }

    if (ringData.ReverseDirectionChange) {
      tripStartTime = ts
      isForward = true
      return
    }

    if (ringData.ForwardDirectionChange) {
      tripStartTime = ts
      isForward = false
      return
    }

    if (
      ringData.ForwardRotation !== undefined ||
      ringData.ReverseRotation !== undefined
    ) {
      const nextIsForward =
        !!ringData.ForwardRotation && !ringData.ReverseRotation

      if (tripStartTime === undefined) {
        tripStartTime = ts
        isForward = nextIsForward
        return
      }

      if (nextIsForward !== isForward) {
        tripStartTime = ts
        isForward = nextIsForward
      }
    }
  }

  // ---- 扫描仪零点跟踪 ----

  const updateScannerZero = (data: ThicknessData) => {
    if (data.ResetSignal && data.HorizontalPulse != null) {
      scannerZeroOffset = data.HorizontalPulse
      return
    }
    if (scannerZeroOffset === null && data.LeftLimit && data.HorizontalPulse != null) {
      scannerZeroOffset = data.HorizontalPulse
    }
  }

  // ---- 测量转换：ThicknessData → MeasurementTriple ----

  const toMeasurement = (data: ThicknessData): TimedMeasurement | null => {
    if (
      data.ProbeValue === undefined ||
      data.ProbeValue <= 0 ||
      data.timestamp === undefined ||
      tripStartTime === undefined ||
      data.HorizontalPulse === undefined ||
      scannerZeroOffset === null
    ) {
      return null
    }

    const thickness = thicknessCalcConfig
      ? calcThickness(data.ProbeValue, thicknessCalcConfig)
      : data.ProbeValue

    if (thickness < 1.0) return null

    const tRel = Math.max(0, Math.min(data.timestamp - tripStartTime, T_half))
    const angleRad = timeToAngle(tRel, isForward)
    const upperAngleDeg = (angleRad * 180) / Math.PI
    const scannerPosMm = (data.HorizontalPulse - scannerZeroOffset) * pulseToMm

    return {
      upperAngleDeg: normalizeAngle(upperAngleDeg),
      scannerPosMm,
      thickness,
      timestamp: data.timestamp,
    }
  }

  // ---- 重建 ----

  const runReconstruction = (): ThicknessReversalResult | null => {
    if (buffer.length < 2) return null

    const triples: MeasurementTriple[] = buffer.map(
      ({ timestamp: _ts, ...rest }) => rest
    )

    try {
      const result = reconstructBubbleThickness(triples, membraneWidthMm, {
        processDeformationFactor: 1.02,
        ...reconstructionOptions,
      })

      const ts = buffer[buffer.length - 1]?.timestamp ?? Date.now()
      const reversalResult: ThicknessReversalResult = {
        profile: result.profile,
        numBins: result.numBins,
        binWidthDeg: result.binWidthDeg,
        rmsError: result.rmsError,
        maxError: result.maxError,
        numMeasurements: result.numMeasurements,
        binCoverage: result.binCoverage,
        timestamp: ts,
      }

      lastResult = reversalResult
      lastReconstructionTimestamp = ts
      pendingSinceLastRecon = 0
      history.push(reversalResult)
      if (history.length > historyMaxSize) history.shift()

      return reversalResult
    } catch (err) {
      console.error('[ThicknessReversal] 重建失败:', err)
      return null
    }
  }

  // ---- 单点分解 ----

  /**
   * 将一条测量分解为前后层 B(φ) 贡献
   *
   * 用于验证重建结果：给定测量 T=101μm，
   * 返回 B(φ₁)=48μm, B(φ₂)=53μm, 预测=103μm, 残差=-2μm
   */
  const decomposeMeasurement = (input: {
    thickness: number
    upperAngleDeg: number
    scannerPosMm: number
  }): DecomposeResult | null => {
    if (!lastResult) return null

    const { thickness, upperAngleDeg, scannerPosMm } = input
    const { phi1Deg, phi2Deg, deltaDeg, alphaCenterDeg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )

    const processFactor = reconstructionOptions.processDeformationFactor ?? 1.02
    const singleLayerFront = interpProfile(lastResult.profile, phi1Deg)
    const singleLayerBack = interpProfile(lastResult.profile, phi2Deg)
    const predictedThickness =
      processFactor * (singleLayerFront + singleLayerBack)

    return {
      upperAngleDeg,
      scannerPosMm,
      deltaDeg,
      alphaCenterDeg,
      phi1Deg,
      phi2Deg,
      singleLayerFront,
      singleLayerBack,
      predictedThickness,
      measuredThickness: thickness,
      residual: thickness - predictedThickness,
    }
  }

  // ---- 批量处理 ----

  const processBatch = (
    thicknessDataList: ThicknessData[],
    ringDataList?: RingData[]
  ): ThicknessReversalResult | null => {
    if (ringDataList) {
      for (const rd of ringDataList) updateAirRingState(rd)
    }

    for (const td of thicknessDataList) {
      updateScannerZero(td)
      const m = toMeasurement(td)
      if (m) {
        buffer.push(m)
        pendingSinceLastRecon++
        measurementCount++
      }
    }

    if (buffer.length > bufferWindowSize) {
      buffer.splice(0, buffer.length - bufferWindowSize)
    }

    return runReconstruction()
  }

  // ---- 流式处理 ----

  const next = (data: {
    thickness?: ThicknessData
    airRing?: RingData
  }): ThicknessReversalResult | null => {
    if (data.airRing) {
      updateAirRingState(data.airRing)
    }

    if (!data.thickness) return null

    updateScannerZero(data.thickness)
    const m = toMeasurement(data.thickness)
    if (!m) return null

    buffer.push(m)
    pendingSinceLastRecon++
    measurementCount++

    if (buffer.length > bufferWindowSize) {
      buffer.splice(0, buffer.length - bufferWindowSize)
    }

    if (pendingSinceLastRecon >= reconstructInterval) {
      return runReconstruction()
    }

    return null
  }

  // ---- 状态查询 ----

  const getState = (): ThicknessReversalState => ({
    lastReconstructionTimestamp,
    isForward,
    tripStartTime,
    measurementCount,
    lastResult,
  })

  const getStatistics = () => {
    if (!lastResult) {
      return {
        meanThickness: 0,
        thicknessStdDev: 0,
        minThickness: 0,
        maxThickness: 0,
        rmsError: 0,
        maxError: 0,
        numMeasurements: 0,
        reconstructionCount: 0,
      }
    }

    const profile = lastResult.profile
    const mean = profile.reduce((a, b) => a + b, 0) / profile.length
    const variance =
      profile.reduce((sum, v) => sum + (v - mean) ** 2, 0) / profile.length

    return {
      meanThickness: mean,
      thicknessStdDev: Math.sqrt(variance),
      minThickness: Math.min(...profile),
      maxThickness: Math.max(...profile),
      rmsError: lastResult.rmsError,
      maxError: lastResult.maxError,
      numMeasurements: lastResult.numMeasurements,
      reconstructionCount: history.length,
    }
  }

  const getHistory = (limit?: number): ThicknessReversalResult[] => {
    return limit ? history.slice(-limit) : [...history]
  }

  const reset = () => {
    isForward = true
    tripStartTime = undefined
    scannerZeroOffset = null
    measurementCount = 0
    pendingSinceLastRecon = 0
    lastReconstructionTimestamp = 0
    lastResult = undefined
    buffer.length = 0
    history.length = 0
  }

  return {
    next,
    decomposeMeasurement,
    processBatch,
    getState,
    getStatistics,
    getHistory,
    reset,
  }
}
