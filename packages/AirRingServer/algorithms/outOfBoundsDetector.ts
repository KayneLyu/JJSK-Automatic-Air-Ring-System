/**
 * 出膜检测器
 *
 * 基于 calcThickness 计算的膜厚（μm）检测测厚仪是否运动出膜。
 * 膜内：厚度 ≥ effectiveMinThickness
 * 膜外：厚度 < effectiveMinThickness
 *
 * 入膜确认（confirmInCount，默认 50）：慢确认，确保深入膜内
 * 出膜确认（confirmOutCount，默认 10）：快反应，离开膜就触发
 */
import { calcThickness, type ThicknessCalcConfig } from './thickness'

export interface OutOfBoundsDetectorOptions {
  /** 空气 AD 值（用于 calcThickness 计算，非直接判定阈值） */
  airAD: number
  /** 连续确认点数（出膜和入膜共用默认值，默认 10） */
  confirmCount?: number
  /** 出膜连续确认点数（默认使用 confirmCount） */
  confirmOutCount?: number
  /** 入膜连续确认点数（默认 50，比出膜大以深入膜内） */
  confirmInCount?: number
  /** 最小膜厚（μm），低于此值视为出膜（默认 5.0） */
  minThickness?: number
}

export interface OutOfBoundsResult {
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 连续达到 confirmOutCount 个膜厚<effectiveMinThickness 点 → 确认出膜 */
  confirmedOutOfBounds: boolean
  /** 连续达到 confirmInCount 个膜厚≥effectiveMinThickness 点 → 确认回膜 */
  confirmedInMembrane: boolean
  /** 首次确认出膜时的脉冲值 */
  boundaryPulse?: number
  /** 左/右边界（由调用方传入的 motionDirection 判定） */
  boundarySide?: 'left' | 'right'
}

export const outOfBoundsDetector = (options: OutOfBoundsDetectorOptions) => {
  const {
    airAD,
    confirmCount = 10,
    confirmOutCount = confirmCount,
    confirmInCount = 50,
    minThickness = 5.0,
  } = options
  const thicknessConfig: ThicknessCalcConfig = { airAD }

  let outCount = 0
  let inCount = 0
  let boundaryRecorded = false

  let effectiveMinThickness = minThickness

  const next = (
    probeValue: number,
    horizontalPulse: number,
    motionDirection: boolean
  ): OutOfBoundsResult => {
    const thickness = calcThickness(probeValue, thicknessConfig)

    const outOfBounds = thickness < effectiveMinThickness

    if (outOfBounds) {
      if (outCount < confirmOutCount) {
        outCount++
      }
      inCount = 0
    } else {
      inCount = Math.min(inCount + 1, confirmInCount)
      if (inCount >= confirmInCount) {
        // 连续回膜确认 → 重置出膜状态
        outCount = 0
        boundaryRecorded = false
      }
      // 未确认回膜时不重置 outCount
    }

    const confirmedOut = outCount >= confirmOutCount
    const confirmedIn = inCount >= confirmInCount

    const justNowConfirmed = confirmedOut && outCount === confirmOutCount && !boundaryRecorded
    if (justNowConfirmed) {
      boundaryRecorded = true
    }

    return {
      inMembrane: !outOfBounds,
      confirmedOutOfBounds: confirmedOut,
      confirmedInMembrane: confirmedIn,
      boundaryPulse: justNowConfirmed ? horizontalPulse : undefined,
      boundarySide: motionDirection ? 'right' : 'left',
    }
  }

  const reset = () => {
    outCount = 0
    inCount = 0
    boundaryRecorded = false
    effectiveMinThickness = minThickness
  }

  /** 调试：获取检测器内部状态 */
  const getDebugInfo = () => ({
    outCount,
    inCount,
    boundaryRecorded,
    effectiveMinThickness,
  })

  return { next, reset, getDebugInfo }
}
