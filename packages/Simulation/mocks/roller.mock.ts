import { getCircumference, RollerScalar, RollerDevice } from '@jjsk/core'

export type RollerMockOptions = RollerScalar & {
  /**
   * 收卷速度 单位：毫米/秒
   * */
  speed: number
  /**
   * 脉冲窗口，即在既定时间内，都能捕捉到这个信号 默认：50毫秒 单位：毫秒
   * */
  PULSE_WINDOW?: number
}
export const mockRoller = ({
  speed,
  PULSE_WINDOW = 50,
  ...roller
}: RollerMockOptions) => {
  // 周长
  const circumference = getCircumference(roller)
  // 转一圈的时间
  const cycleDuration = circumference / speed
  const PULSE_WINDOW_S = PULSE_WINDOW / 1000 // 秒

  let startTime: number | null = null
  const next = (): RollerDevice => {
    const now = Date.now()
    if (!startTime) {
      // 初始状态
      startTime = now
      return {
        RollSpeedSignal: true,
      }
    }
    const elapsed = (now - startTime) / 1000 // 秒，从开始经过的时间
    const tInCycle = elapsed % cycleDuration // 在当前周期内的偏移（秒）
    if (tInCycle < PULSE_WINDOW_S) {
      return {
        RollSpeedSignal: true,
      }
    }
    return {
      RollSpeedSignal: false,
    }
  }
  return { next }
}
