/**
 * 出膜检测器
 *
 * 基于 calcThickness 计算的膜厚（μm）检测测厚仪是否运动出膜。
 * 膜内：厚度 ≥ minThickness → 探头在薄膜覆盖范围内
 * 膜外：厚度 < minThickness → 探头跑出膜外（仅空气，无薄膜衰减）
 *
 * 检测策略：连续 N 个点厚度 < minThickness 判定为出膜。
 */
import { calcThickness, type ThicknessCalcConfig } from './thickness'

export interface OutOfBoundsDetectorOptions {
  /** 空气 AD 值（用于 calcThickness 计算，非直接判定阈值） */
  airAD: number
  /** 连续确认点数（默认 3） */
  confirmCount?: number
  /** 最小膜厚（μm），低于此值视为出膜（默认 1.0） */
  minThickness?: number
}

export interface OutOfBoundsResult {
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 连续达到 confirmCount 个膜厚<minThickness 点 → 确认出膜 */
  confirmedOutOfBounds: boolean
  /** 连续达到 confirmCount 个膜厚≥minThickness 点 → 确认回膜 */
  confirmedInMembrane: boolean
  /** 首次确认出膜时的脉冲值（仅 confirmedOutOfBounds 且 outCount===confirmCount 时返回） */
  boundaryPulse?: number
  /** 左/右边界（由调用方传入的 motionDirection 判定） */
  boundarySide?: 'left' | 'right'
}

export const outOfBoundsDetector = (options: OutOfBoundsDetectorOptions) => {
  const { airAD, confirmCount = 10, minThickness = 1.0 } = options
  const thicknessConfig: ThicknessCalcConfig = { airAD }

  let outCount = 0
  let inCount = 0
  let boundaryRecorded = false

  const next = (
    probeValue: number,
    horizontalPulse: number,
    motionDirection: boolean
  ): OutOfBoundsResult => {
    const thickness = calcThickness(probeValue, thicknessConfig)
    // 基于膜厚判定出膜（厚度低于最小阈值 = 探头在空气区）
    const outOfBounds = thickness < minThickness

    if (outOfBounds) {
      if (outCount < confirmCount) {
        outCount++
      }
      inCount = 0
    } else {
      inCount = Math.min(inCount + 1, confirmCount)
      if (inCount >= confirmCount) {
        // 连续回膜确认 → 重置出膜状态，允许下次重新记录 boundaryPulse
        outCount = 0
        boundaryRecorded = false
      }
      // 未确认回膜时不重置 outCount，防止膜边缘厚度振荡导致出膜判定失败
    }

    const confirmedOut = outCount >= confirmCount
    const confirmedIn = inCount >= confirmCount

    // 仅在首次确认出界时记录 pulse（transition 0→1 时刻）
    const justNowConfirmed = confirmedOut && outCount === confirmCount && !boundaryRecorded
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
  }

  /** 调试：获取检测器内部状态 */
  const getDebugInfo = () => ({
    outCount,
    inCount,
    boundaryRecorded,
  })

  return { next, reset, getDebugInfo }
}
