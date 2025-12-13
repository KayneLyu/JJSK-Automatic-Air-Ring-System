import { ThicknessData } from '../connections/thickness/opcua'

/**
 * 标定牵引速度，平滑算法
 * @param Circumference 辊周长，单位：mm
 * @param numCycles 最少使用 N 圈计算平均速度
 * @param maxIntervalMs 最大允许脉冲间隔（防停机误判，默认 10_000 ms = 10秒）
 * @returns 速度（mm/s），若无法计算则返回 null
 * */
export const calibrateTractionSpeedSmooth = (
  Circumference: number,
  numCycles: number = 10, // 最少使用 N 圈计算平均速度
  maxIntervalMs: number = 10_000
) => {
  const risingEdgeTimes: number[] = []
  let prevSignal: boolean | null = null
  const next = (data: ThicknessData) => {
    if (!data.timestamp) return null
    const currentSignal = !!data.RollSpeedSignal // 容错：转为布尔

    if (prevSignal === false && currentSignal) {
      // 上升沿：记录当前时间戳作为一圈的开始
      risingEdgeTimes.push(data.timestamp)
    }

    prevSignal = currentSignal
    // 检查是否有足够圈数（需要 N+1 个边沿才能算 N 圈）
    if (risingEdgeTimes.length < numCycles + 1) {
      return null
    }
    const numActualCycles = risingEdgeTimes.length - 1

    const totalTime_ms =
      risingEdgeTimes[risingEdgeTimes.length - 1] - risingEdgeTimes[0]
    const totalDistance = Circumference * numActualCycles
    if (totalTime_ms <= 0 || totalTime_ms > maxIntervalMs * numActualCycles) {
      return null
    }

    return (totalDistance * 1000) / totalTime_ms // mm/s
  }

  return { next }
}
