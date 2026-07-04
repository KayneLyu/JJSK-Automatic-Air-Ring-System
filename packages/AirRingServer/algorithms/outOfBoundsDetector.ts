/**
 * 出膜检测器
 *
 * 基于滑动窗口 + 百分比阈值检测，比连续计数更鲁棒：
 * - 出膜：最近 outWindowSize 个样本中 ≥ outThreshold 比例判为出膜
 * - 入膜：最近 inWindowSize 个样本中 ≥ inThreshold 比例判为入膜
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
  let outRightCount = 0 // 窗口内出膜且方向为右的样本数

  let boundaryRecorded = false

  const next = (
    probeValue: number,
    horizontalPulse: number,
    motionDirection: boolean
  ): OutOfBoundsResult => {
    const thickness = calcThickness(probeValue, thicknessConfig)
    const outOfBounds = thickness < effectiveMinThickness

    // ── 出膜窗口 ──
    {
      const oldOut = outRing[outRingIdx]
      outRing[outRingIdx] = outOfBounds ? motionDirection : null
      outRingIdx = (outRingIdx + 1) % outWindowSize
      if (outRingIdx === 0) outRingFilled = true
      if (oldOut !== null && oldOut !== false) {
        outCount--
        outRightCount--
      } else if (oldOut === false) {
        outCount--
      }
      if (outOfBounds) {
        outCount++
        if (motionDirection) outRightCount++
      }
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
      // 多数投票：窗口内出膜样本中方向占多数的为边界侧
      boundarySide: outCount > 0
        ? (outRightCount > outCount / 2 ? 'right' : 'left')
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
    outRightCount = 0
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
