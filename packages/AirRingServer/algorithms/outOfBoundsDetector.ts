/**
 * 出膜检测器
 *
 * 基于滑动窗口 + 百分比阈值检测：
 * - 出膜：最近 outWindowSize 个样本中 ≥ outThreshold 比例判为出膜
 * - 入膜：最近 inWindowSize 个样本中 ≥ inThreshold 比例判为入膜
 *
 * 运动方向基于脉冲位移趋势判定（脉冲变化≥10才更新），比逐采样 motionDirection 鲁棒。
 */
import { calcThickness, type ThicknessCalcConfig } from './thickness'

export interface OutOfBoundsDetectorOptions {
  /** 空气 AD 值（用于 calcThickness 计算，非直接判定阈值） */
  airAD: number
  /** 最小膜厚（μm），低于此值视为出膜（默认 5.0） */
  minThickness?: number
  /** 出膜窗口大小（样本数，默认 500） */
  outWindowSize?: number
  /** 出膜比例阈值（默认 0.95，即窗口内 95% 出膜才确认） */
  outThreshold?: number
  /** 入膜窗口大小（样本数，默认 1000） */
  inWindowSize?: number
  /** 入膜比例阈值（默认 0.95） */
  inThreshold?: number
}

export interface OutOfBoundsResult {
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 窗口内 ≥ outThreshold 比例的样本为出膜 */
  confirmedOutOfBounds: boolean
  /** 窗口内 ≥ inThreshold 比例的样本为入膜 */
  confirmedInMembrane: boolean
  /** 首次确认出膜时的脉冲值 */
  boundaryPulse?: number
  /** 左/右边界（由调用方传入的 motionDirection 判定） */
  boundarySide?: 'left' | 'right'
}

export const outOfBoundsDetector = (options: OutOfBoundsDetectorOptions) => {
  const {
    airAD,
    minThickness = 5.0,
    outWindowSize = 100,
    outThreshold = 0.95,
    inWindowSize = 200,
    inThreshold = 0.95,
  } = options
  const thicknessConfig: ThicknessCalcConfig = { airAD }

  let effectiveMinThickness = minThickness

  // 环形缓冲区：存储最近 N 个样本是否为出膜，及出膜时的方向
  const outRing: (boolean | null)[] = new Array(outWindowSize).fill(null)
  const inRing: boolean[] = new Array(inWindowSize).fill(false)
  let outRingIdx = 0
  let inRingIdx = 0
  let outRingFilled = false
  let inRingFilled = false
  let outCount = 0 // 窗口内出膜样本数
  let inCount = 0  // 窗口内入膜样本数

  // 运动方向：基于脉冲位置变化趋势判定（比逐采样 pulse>=lastPulse 更鲁棒）
  let trendPulse: number | null = null // 用于方向判定的参考脉冲
  let trendDirection: boolean | null = null // true=右, false=左, null=未知

  let boundaryRecorded = false

  const next = (
    probeValue: number,
    horizontalPulse: number,
    motionDirection: boolean
  ): OutOfBoundsResult => {
    const thickness = calcThickness(probeValue, thicknessConfig)
    const outOfBounds = thickness < effectiveMinThickness

    // ── 运动方向趋势（基于脉冲位移，比逐采样 direction 鲁棒） ──
    if (trendPulse === null) {
      trendPulse = horizontalPulse
      trendDirection = null
    } else if (Math.abs(horizontalPulse - trendPulse) >= 10) {
      trendDirection = horizontalPulse > trendPulse
      trendPulse = horizontalPulse
    }

    // ── 出膜窗口 ──
    {
      const oldOut = outRing[outRingIdx]
      outRing[outRingIdx] = outOfBounds ? trendDirection : null
      outRingIdx = (outRingIdx + 1) % outWindowSize
      if (outRingIdx === 0) outRingFilled = true
      if (oldOut !== null && oldOut !== false) outCount--
      else if (oldOut === false) outCount--
      if (outOfBounds) outCount++
    }

    // ── 入膜窗口 ──
    {
      const old = inRing[inRingIdx]
      inRing[inRingIdx] = !outOfBounds // in-membrane = not out
      inRingIdx = (inRingIdx + 1) % inWindowSize
      if (inRingIdx === 0) inRingFilled = true
      if (old) inCount--
      if (!outOfBounds) inCount++
    }

    const confirmedOut = outRingFilled && outCount / outWindowSize >= outThreshold
    const confirmedIn = inRingFilled && inCount / inWindowSize >= inThreshold

    const justNowConfirmed = confirmedOut && !boundaryRecorded
    if (justNowConfirmed) {
      boundaryRecorded = true
    }

    // 确认入膜后重置 boundaryRecorded
    if (confirmedIn) {
      boundaryRecorded = false
    }

    return {
      inMembrane: !outOfBounds,
      confirmedOutOfBounds: confirmedOut,
      confirmedInMembrane: confirmedIn,
      boundaryPulse: justNowConfirmed ? horizontalPulse : undefined,
      // 基于脉冲位移趋势判定运动方向 → 边界侧
      boundarySide: trendDirection !== null
        ? (trendDirection ? 'right' : 'left')
        : (motionDirection ? 'right' : 'left'),
    }
  }

  const reset = () => {
    outRing.fill(null)
    inRing.fill(false)
    outRingIdx = 0
    inRingIdx = 0
    outRingFilled = false
    inRingFilled = false
    outCount = 0
    inCount = 0
    trendPulse = null
    trendDirection = null
    boundaryRecorded = false
    effectiveMinThickness = minThickness
  }

  /** 调试：获取检测器内部状态 */
  const getDebugInfo = () => ({
    outCount,
    inCount,
    outWindowSize,
    inWindowSize,
    boundaryRecorded,
    effectiveMinThickness,
  })

  return { next, reset, getDebugInfo }
}
