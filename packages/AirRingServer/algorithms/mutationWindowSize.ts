import { ThicknessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'

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
/**
 * 标定突变检测窗口大小（点数）
 */
export const calibrateMutationWindowSize = ({
  CHANNEL_COUNT,
  alpha = 1.5,
}: CalibrateMutationWindowSizeOptions) => {
  let preSignal: boolean | null = null
  const thicknessCount: number[] = []
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }): number | null => {
    if (thickness) {
      if (thicknessCount.length > 0) {
        thicknessCount[thicknessCount.length - 1] += 1
      }
      if (thicknessCount.length > 1) {
        const sum = thicknessCount
          .slice(0, -1)
          .reduce((acc, curr) => acc + curr, 0)
        return Math.round(
          (sum / (thicknessCount.length - 1) / CHANNEL_COUNT) * alpha
        )
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
    return null
  }
  return { next }
}
