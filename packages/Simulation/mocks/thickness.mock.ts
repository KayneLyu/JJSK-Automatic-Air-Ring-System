import { ThicknessDevice } from '@jjsk/core'

export type ThicknessMockOptions = {
  /**
   * 行程时长(单程) 默认：3分钟 单位：秒
   * */
  tripDuration?: number
  /**
   * 最大脉冲数，到达限位时的脉冲数 默认：10000
   * */
  maxPulse?: number
  /**
   * 脉冲窗口，即在既定时间内，都能捕捉到这个信号 默认：50毫秒 单位：毫秒
   * */
  PULSE_WINDOW?: number
}
export const mockThickness = ({
  tripDuration = 3 * 60,
  maxPulse = 10000,
  PULSE_WINDOW = 50,
}: ThicknessMockOptions) => {
  // 单程时长 转为毫秒
  const tripDuration_S = tripDuration * 1000 // 毫秒
  // 总周期：往返一次的时间
  const cycleDuration = tripDuration_S * 2 // 毫秒
  // 速度：脉冲/毫秒（假设往返速度相同，也可分开定义）
  const speed = maxPulse / tripDuration_S // 脉冲每毫秒

  let startTime: number | null = null
  const next = (): ThicknessDevice => {
    const now = Date.now()
    if (!startTime) {
      // 初始状态
      startTime = now

      return {
        HorizontalPulse: 0,
        MotionDirection: true,
        ProbeValue: 0,
      }
    }
    const elapsed = now - startTime // 毫秒，从开始经过的时间
    const tInCycle = elapsed % cycleDuration // 在当前周期内的偏移（秒）
    // 是否正在向右扫描
    const direction = tInCycle < tripDuration_S
    // 单程扫描时间
    const tInTrip = direction ? tInCycle : tInCycle - tripDuration_S

    const position = (direction ? tInTrip : tripDuration_S - tInTrip) * speed

    // --- 探头值：模拟厚度，例如以正弦波叠加噪声 ---
    const probeValue =
      100 + 10 * Math.sin(position / 200) + (Math.random() - 0.5) * 2 // 单位 μm
    // --- 限位信号 ---
    const atLeftLimit = tInTrip >= tripDuration_S - PULSE_WINDOW && direction
    const atRightLimit = tInTrip <= PULSE_WINDOW && !direction
    return {
      HorizontalPulse: position,
      LeftLimit: atLeftLimit,
      RightLimit: atRightLimit,
      SwapDirection: atRightLimit || atLeftLimit,
      MotionDirection: direction, // true=向右（扫描），false=向左（回程）
      ProbeValue: parseFloat(probeValue.toFixed(2)),
    }
  }
  return { next }
}
