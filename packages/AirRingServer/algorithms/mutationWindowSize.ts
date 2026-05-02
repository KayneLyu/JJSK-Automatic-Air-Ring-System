import type { ThicknessData } from '../connections/thickness/opcua'
import type { RingData } from '../connections/airRing/opcua'

export type CalibrateMutationWindowSizeOptions = {
  /**
   * 风道数量
   * */
  CHANNEL_COUNT: number
  /**
   * 窗口时间系数 默认：1.5
   * */
  alpha?: number
}
export type CalibrateMutationWindowSize = {
  /**
   * 快速窗口大小（点数），用于快速响应突变检测，通常比size大
   * */
  fastSize?: number
  /**
   * 窗口大小（点数）
   * */
  size?: number
}
/**
 * 标定突变检测窗口大小（点数）
 */
export const calibrateMutationWindowSize = ({
  CHANNEL_COUNT,
  alpha = 1.5,
}: CalibrateMutationWindowSizeOptions) => {
  let preSignal: boolean | null = null
  let preFastSignal: boolean | null = null
  const thicknessCount: number[] = []
  const fastThicknessCount: number[] = []
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }): CalibrateMutationWindowSize => {
    if (thickness) {
      const currentFastSignal = !!thickness.MotionDirection
      if (currentFastSignal != preFastSignal) {
        /* 快速换向之后 */
        fastThicknessCount.push(0)
        preFastSignal = currentFastSignal
      }
      if (fastThicknessCount.length > 0) {
        fastThicknessCount[fastThicknessCount.length - 1] += 1
      }
      if (thicknessCount.length > 0) {
        thicknessCount[thicknessCount.length - 1] += 1
      }
      let size: number | undefined
      let fastSize: number | undefined
      if (thicknessCount.length > 1) {
        const sum = thicknessCount
          .slice(0, -1)
          .reduce((acc, curr) => acc + curr, 0)
        size = Math.round(
          (sum / (thicknessCount.length - 1) / CHANNEL_COUNT) * alpha
        )
      }
      if (fastThicknessCount.length > 1) {
        const sum = fastThicknessCount
          .slice(0, -1)
          .reduce((acc, curr) => acc + curr, 0)
        fastSize = Math.round(sum / (fastThicknessCount.length - 1))
      }
      return {
        size,
        fastSize,
      }
    }
    if (airRing) {
      const currentSignal =
        !!airRing.ForwardRotation && !airRing.ReverseRotation
      if (currentSignal != preSignal) {
        /* 换向之后 */
        thicknessCount.push(0)
        preSignal = currentSignal
      }
    }
    return {}
  }
  return { next }
}
