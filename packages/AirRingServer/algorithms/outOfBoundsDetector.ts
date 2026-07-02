/**
 * 出膜检测器
 *
 * 基于 ProbeValue（光通量 AD 值）检测测厚仪是否运动出膜。
 * 膜内：AD 值 < airAD → 厚度 > 0
 * 膜外：AD 值 ≥ airAD → 厚度 = 0（物理铁律）
 *
 * 检测策略：纯硬判定 — 连续 N 个点 calcThickness === 0 判定为出膜。
 */
import { calcThickness, type ThicknessCalcConfig } from './thickness'

export interface OutOfBoundsDetectorOptions {
  /** 空气 AD 值 */
  airAD: number
  /** 连续确认点数（默认 3） */
  confirmCount?: number
}

export interface OutOfBoundsResult {
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 连续达到 confirmCount 个厚度=0 点 → 确认出膜 */
  confirmedOutOfBounds: boolean
  /** 连续达到 confirmCount 个厚度>0 点 → 确认回膜 */
  confirmedInMembrane: boolean
  /** 首次确认出膜时的脉冲值（仅 confirmedOutOfBounds 且 outCount===confirmCount 时返回） */
  boundaryPulse?: number
  /** 左/右边界（由调用方传入的 motionDirection 判定） */
  boundarySide?: 'left' | 'right'
}

export const outOfBoundsDetector = (options: OutOfBoundsDetectorOptions) => {
  const { airAD, confirmCount = 3 } = options
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
    const outOfBounds = thickness === 0

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
      } else {
        outCount = 0
      }
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

  return { next, reset }
}
