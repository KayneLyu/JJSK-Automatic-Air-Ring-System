// 风道配置
import { WithRequired } from '@jjsk/core'
import { ThicknessData } from '../connections/thickness/opcua'

interface WindRingConfig {
  numFans: number // 风道数量 N
  phaseOffsetRad: number // 风道0相对于人字架零点的安装偏移（弧度）
}

// 控制参数
interface ControlParams {
  targetThickness: number // 目标厚度 (μm)
  baseFanSpeed: number // 基础风速 (0~100%)
  kp: number // 比例增益
  maxAdjustPercent: number // 最大调节幅度（如 0.2 表示 ±20%）
  binCount: number // 相位分箱数（建议 ≥ numFans）
  smoothingAlpha: number // 指数平滑系数 α ∈ (0,1]
}

// 系统状态（由外部维护）
interface WindControlState {
  binErrors: readonly number[] // 每个相位 bin 的平均厚度偏差
}
/**
 * 给定相位 φ，返回最接近的风道索引（考虑圆周 wrap）
 */
const getNearestFanIndex = (phiRad: number, config: WindRingConfig): number => {
  const { numFans, phaseOffsetRad } = config
  const normalizedPhi =
    (((phiRad - phaseOffsetRad) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const fanAngle = (2 * Math.PI) / numFans
  const index = Math.round(normalizedPhi / fanAngle) % numFans
  return index < 0 ? index + numFans : index
}
/**
 * 将一个 (φ, Δy) 测量点融入 binErrors 状态
 */
const updateBinErrors = (
  state: WindControlState,
  phiRad: number,
  thicknessError: number,
  params: Pick<ControlParams, 'binCount' | 'smoothingAlpha'>
): WindControlState => {
  const { binCount, smoothingAlpha: alpha } = params
  const binWidth = (2 * Math.PI) / binCount
  const binIndex =
    Math.floor(
      (((phiRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / binWidth
    ) % binCount

  const newBinErrors = [...state.binErrors]
  newBinErrors[binIndex] =
    alpha * thicknessError + (1 - alpha) * newBinErrors[binIndex]

  return { binErrors: newBinErrors }
}
/**
 * 将相位 bin 的误差投影到各个风道（高斯加权平均）
 */
const computeFanAdjustments = (
  state: WindControlState,
  config: WindRingConfig,
  params: Pick<ControlParams, 'kp' | 'maxAdjustPercent'>
): readonly number[] => {
  const { binErrors } = state
  const { numFans, phaseOffsetRad } = config
  const { kp, maxAdjustPercent } = params

  const binCount = binErrors.length
  const binWidth = (2 * Math.PI) / binCount
  const fanWidth = (2 * Math.PI) / numFans
  const sigma = fanWidth / 2 // 影响半径 ≈ 1 个风道宽度

  const adjustments: number[] = []

  for (let i = 0; i < numFans; i++) {
    const fanCenter = phaseOffsetRad + i * fanWidth
    let weightedSum = 0
    let weightSum = 0

    // 遍历所有 bins，计算对当前风道的贡献
    for (let j = 0; j < binCount; j++) {
      const binCenter = j * binWidth
      const delta = Math.min(
        Math.abs(fanCenter - binCenter),
        2 * Math.PI - Math.abs(fanCenter - binCenter)
      )
      const weight = Math.exp(-(delta * delta) / (2 * sigma * sigma))
      weightedSum += weight * binErrors[j]
      weightSum += weight
    }

    const avgError = weightSum > 0 ? weightedSum / weightSum : 0
    let adjust = kp * avgError

    // 限幅
    const maxAdjust = maxAdjustPercent * 100 // 转为百分比单位
    adjust = Math.max(-maxAdjust, Math.min(maxAdjust, adjust))

    adjustments.push(adjust)
  }

  return adjustments
}

/**
 * 根据风道数量、膜泡参数和采样率，自动计算突变检测窗口大小
 * @param data 最近测厚数据（用于计算平均采样间隔）
 * @param numFans 风道数量 N
 * @param thetaMaxDeg 膜泡最大展开角（度）—— 你已通过 V2 估计
 * @param T_half 半行程时间（ms）
 * @param beta 窗口相位跨度系数（默认 1.5）
 */
export const computeWindowSizeByFanCount = (
  data: WithRequired<ThicknessData, 'timestamp'>[],
  numFans: number,
  thetaMaxDeg: number,
  T_half: number,
  beta: number = 1.5
): number => {
  if (numFans <= 0 || thetaMaxDeg <= 0 || T_half <= 0 || data.length < 2) {
    return minWindowSize
  }

  // 1. 计算平均采样间隔 Δt (ms)
  let totalDt = 0
  let validCount = 0
  for (let i = 1; i < data.length; i++) {
    const dt = data[i].timestamp - data[i - 1].timestamp
    if (dt > 0 && isFinite(dt)) {
      totalDt += dt
      validCount++
    }
  }
  const avgSamplingInterval = validCount > 0 ? totalDt / validCount : 100

  // 2. 转换 thetaMax 到弧度
  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  // 3. 计算窗口时间（ms）
  //    T_window = β * (2π / N) / (θ_max / T_half)
  const T_window = ((beta * (2 * Math.PI)) / numFans / thetaMaxRad) * T_half

  // 4. 转换为点数
  const windowSizeFloat = T_window / avgSamplingInterval
  let windowSize = Math.round(windowSizeFloat)

  // 5. 边界限制
  windowSize = Math.max(minWindowSize, Math.min(maxWindowSize, windowSize))

  return windowSize
}
