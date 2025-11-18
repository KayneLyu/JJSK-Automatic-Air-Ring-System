import { UpperRotationDevice } from '../types'

export type MockOptions = {
  /**
   * 电机最大频率 默认：30Hz
   * */
  maxMotorFrequency?: number
  /**
   * 最大旋转角度
   * */
  maxAngle: number
  /**
   * 复位旋转角度 默认：行程中间复位
   * */
  resetAngle?: number
  /**
   * 行程时长(单程) 默认：6分钟 单位：秒
   * */
  tripDuration?: number
  /**
   * 加减速时长 默认：20秒 单位：秒
   * */
  decelerationDuration?: number
  /**
   * 脉冲窗口，即在既定时间内，都能捕捉到这个信号 默认：50毫秒 单位：毫秒
   * */
  PULSE_WINDOW?: number
}
/**
 * 模拟上旋系统
 * */
export const mockUpperRotation = ({
  maxMotorFrequency = 30,
  maxAngle,
  resetAngle = maxAngle / 2,
  tripDuration = 6 * 60,
  decelerationDuration = 20,
  PULSE_WINDOW = 50,
}: MockOptions) => {
  // 总周期：往返一次的时间
  const cycleDuration = tripDuration * 2 // 秒
  // 脉冲窗口
  const PULSE_WINDOW_S = PULSE_WINDOW / 1000 // 秒
  // 计算复位点在周期中的两个时间点（秒）
  const tResetForward = (resetAngle / maxAngle) * tripDuration // 正向经过 resetAngle 的时间
  const tResetReverse =
    tripDuration + ((maxAngle - resetAngle) / maxAngle) * tripDuration // 反向经过 resetAngle 的时间

  const data: UpperRotationDevice & {
    timestamp?: number
  } = {}
  let startTime = 0
  const next = (): UpperRotationDevice => {
    const now = Date.now()
    if (!data.timestamp) {
      // 初始状态
      startTime = now

      data.timestamp = now
      data.ForwardRotation = true
      data.MotorFrequency = 0
      return data
    }
    const elapsed = (now - startTime) / 1000 // 秒，从开始经过的时间
    const tInCycle = elapsed % cycleDuration // 在当前周期内的偏移（秒）
    // 是否正在正转
    const isForward = tInCycle < tripDuration
    // 单程转动时间
    const tInTrip = isForward ? tInCycle : tInCycle - tripDuration

    // --- 计算电机频率---
    let motorFrequency = 0
    if (tInTrip < decelerationDuration) {
      motorFrequency = (tInTrip / decelerationDuration) * maxMotorFrequency
    } else if (tInTrip > tripDuration - decelerationDuration) {
      const deceTime = tripDuration - tInTrip
      motorFrequency = (deceTime / decelerationDuration) * maxMotorFrequency
    } else {
      motorFrequency = maxMotorFrequency
    }
    // --- 限位信号 ---
    const atForwardLimit = tInTrip >= tripDuration - PULSE_WINDOW_S && isForward
    const atReverseLimit =
      tInTrip >= tripDuration - PULSE_WINDOW_S && !isForward
    // --- Reset 信号：检查是否接近两个复位时间点 ---
    const nearForwardReset = Math.abs(tInCycle - tResetForward) < PULSE_WINDOW_S
    const nearReverseReset = Math.abs(tInCycle - tResetReverse) < PULSE_WINDOW_S
    const shouldReset = nearForwardReset || nearReverseReset
    return {
      ForwardRotation: isForward,
      ReverseRotation: !isForward,
      ForwardDirectionChange: atForwardLimit,
      ReverseDirectionChange: atReverseLimit,
      Reset: shouldReset,
      MotorFrequency: motorFrequency,
    }
  }
  return {
    next,
  }
}
