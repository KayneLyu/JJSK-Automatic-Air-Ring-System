/**
 * 出膜检测器
 *
 * 基于 calcThickness 计算的膜厚（μm）检测测厚仪是否运动出膜。
 * 膜内：厚度 ≥ effectiveMinThickness → 探头在薄膜覆盖范围内
 * 膜外：厚度 < effectiveMinThickness → 探头跑出膜外（仅空气，无薄膜衰减）
 *
 * 检测策略：连续 N 个点厚度 < effectiveMinThickness 判定为出膜。
 *
 * 自动标定：初始阶段收集膜厚数据，取 P95×3 作为自动阈值，
 * 与配置的 minThickness 取较大值。膜厚跃升到 >20μm 时停止标定。
 */
import { calcThickness, type ThicknessCalcConfig } from './thickness'

export interface OutOfBoundsDetectorOptions {
  /** 空气 AD 值（用于 calcThickness 计算，非直接判定阈值） */
  airAD: number
  /** 连续确认点数（默认 10） */
  confirmCount?: number
  /** 最小膜厚（μm），低于此值视为出膜（默认 5.0，与自动标定值取较大者） */
  minThickness?: number
}

export interface OutOfBoundsResult {
  /** 当前点是否在膜内 */
  inMembrane: boolean
  /** 连续达到 confirmCount 个膜厚<effectiveMinThickness 点 → 确认出膜 */
  confirmedOutOfBounds: boolean
  /** 连续达到 confirmCount 个膜厚≥effectiveMinThickness 点 → 确认回膜 */
  confirmedInMembrane: boolean
  /** 首次确认出膜时的脉冲值（仅 confirmedOutOfBounds 且 outCount===confirmCount 时返回） */
  boundaryPulse?: number
  /** 左/右边界（由调用方传入的 motionDirection 判定） */
  boundarySide?: 'left' | 'right'
}

export const outOfBoundsDetector = (options: OutOfBoundsDetectorOptions) => {
  const { airAD, confirmCount = 10, minThickness = 5.0 } = options
  const thicknessConfig: ThicknessCalcConfig = { airAD }

  let outCount = 0
  let inCount = 0
  let boundaryRecorded = false

  // ── 自动标定：前 N 个采样点收集膜厚，计算实际空气噪声水平 ──
  let effectiveMinThickness = minThickness
  let calibrationSamples: number[] = []
  const CALIBRATION_MAX = 200
  const CALIBRATION_MIN_AIR = 30
  const FILM_JUMP_THRESHOLD = 20.0 // 膜厚超过此值认为已进入膜内

  const finishCalibration = (): void => {
    // 仅保留空气区样本（膜厚 < 跳变阈值）
    const airSamples = calibrationSamples.filter((t) => t < FILM_JUMP_THRESHOLD)
    if (airSamples.length >= CALIBRATION_MIN_AIR) {
      const sorted = [...airSamples].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]
      // 自动阈值 = P95 × 3，限制在 2.0 ~ 20.0 μm
      const auto = Math.min(Math.max(p95 * 3, 2.0), 20.0)
      effectiveMinThickness = Math.max(auto, minThickness)
    }
    calibrationSamples = []
  }

  const next = (
    probeValue: number,
    horizontalPulse: number,
    motionDirection: boolean
  ): OutOfBoundsResult => {
    const thickness = calcThickness(probeValue, thicknessConfig)

    // ── 自动标定阶段 ──
    if (calibrationSamples.length < CALIBRATION_MAX) {
      calibrationSamples.push(thickness)
      if (thickness > FILM_JUMP_THRESHOLD || calibrationSamples.length >= CALIBRATION_MAX) {
        finishCalibration()
      }
    }

    // 基于膜厚判定出膜（厚度低于有效阈值 = 探头在空气区）
    const outOfBounds = thickness < effectiveMinThickness

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
    calibrationSamples = []
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
