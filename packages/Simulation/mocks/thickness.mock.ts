import { ThicknessDevice } from '@jjsk/core'

export type ThicknessMockOptions = {
  /**
   * 扫描频率 默认：30ms/次 单位：ms/次
   * */
  SAMPLE_INTERVAL?: number
  /**
   * 膜宽 默认：1200mm 单位：毫米
   * */
  membraneWidth?: number
  /**
   * 最大速度 默认：4米/分钟 单位：mm/ms
   * */
  maxSpeed: number
  /**
   * 缓冲脉冲量 默认：100pulse 单位：脉冲量
   * 到膜的边缘之后 缓冲一段距离之后开始换向
   * */
  bufferPulse?: number
  /**
   * 加速时间 默认：400ms 单位：毫秒
   * */
  accelTime?: number
  /**
   * 减速时间 默认：500ms 单位：毫秒
   * */
  decelTime?: number
  /**
   * 突变时间 单位：秒
   * 不传则不产生突变
   * */
  mutationT?: number
  /**
   * 厚度变化周期 默认：6分钟 单位：秒
   * */
  period?: number
  /**
   * 最大差值 默认：5%
   * */
  deviation?: number
  /**
   * 测厚仪单位脉冲位移量 单位：毫米/每脉冲
   * */
  THICKNESS_UNIT_PULSE_DIS: number
  /**
   * 脉冲窗口，即在既定时间内，都能捕捉到这个信号 默认：50毫秒 单位：毫秒
   * */
  PULSE_WINDOW?: number
  /**
   * 启动时间 默认：1秒 单位：毫秒
   * */
  START_TIME?: number
}
export const mockThickness = ({
  membraneWidth = 1200,
  bufferPulse = 100,
  maxSpeed = (4 * 1000) / (60 * 1000),
  accelTime = 400,
  decelTime = 500,
  mutationT,
  period = 6 * 60,
  deviation = 0.05,
  THICKNESS_UNIT_PULSE_DIS,
  PULSE_WINDOW = 50,
  START_TIME = 1000,
}: ThicknessMockOptions) => {
  // === 脉冲域参数 ===
  const membranePulses = membraneWidth / THICKNESS_UNIT_PULSE_DIS
  const maxPulseSpeed = maxSpeed / THICKNESS_UNIT_PULSE_DIS // pulse/ms
  const totalScanPulses = membranePulses + 2 * bufferPulse

  // 加减速段脉冲位移（匀变速）
  const accelPulse = 0.5 * maxPulseSpeed * accelTime // s = ½·v·t
  const decelPulses = 0.5 * maxPulseSpeed * decelTime

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
        ResetSignal: true,
      }
    }
    const elapsed = now - startTime // 毫秒，从开始经过的时间
    if (elapsed <= START_TIME) {
      return {
        HorizontalPulse: elapsed * maxPulseSpeed,
        MotionDirection: true,
        ProbeValue: 0,
        ResetSignal: false,
      }
    }
    // 剔除启动时间
    const tInCycle = (elapsed - START_TIME) % cycleDuration // 在当前周期内的偏移（秒）
    // 是否正在向右扫描
    const direction = tInCycle < tripDuration_S
    // 单程扫描时间
    const tInTrip = direction ? tInCycle : tInCycle - tripDuration_S

    const position = (direction ? tInTrip : tripDuration_S - tInTrip) * speed

    // --- 探头值：模拟厚度，例如以正弦波叠加噪声 ---
    const baseValue = 100 // μm
    const maxDeviation = baseValue * deviation // 5% → 5 μm

    // 正弦部分：占 80% 幅度（4 μm）
    const sineAmplitude = maxDeviation * 0.8
    const periodMs = period * 1000
    const time = (elapsed - PULSE_WINDOW) % periodMs
    const sine = sineAmplitude * Math.sin((2 * Math.PI * time) / periodMs)

    // 随机噪声：占 20% 幅度（±1 μm），确保总和不超过 ±5 μm
    const noiseAmplitude = maxDeviation * 0.2
    const noise = (Math.random() - 0.5) * noiseAmplitude * 2 // 范围 [-1, +1]

    let probeValue = baseValue + sine + noise // 范围 [-1, +1] μm

    // 如果存在突变时间
    if (mutationT) {
      const mutationTMs = mutationT * 1000
      if (elapsed >= mutationTMs && elapsed <= mutationTMs + PULSE_WINDOW) {
        probeValue = baseValue - maxDeviation * 1.2
      }
    }
    // --- 限位信号 ---
    const atLeftLimit = tInTrip >= tripDuration_S - PULSE_WINDOW && direction
    const atRightLimit = tInTrip <= PULSE_WINDOW && !direction
    return {
      HorizontalPulse: position,
      // LeftLimit: atLeftLimit,
      // RightLimit: atRightLimit,
      SwapDirection: atRightLimit || atLeftLimit,
      MotionDirection: direction, // true=向右（扫描），false=向左（回程）
      ProbeValue: parseFloat(probeValue.toFixed(2)),
    }
  }
  return { next }
}

/**
 * 获取启动阶段的脉冲量
 * @param elapsed 从开始经过的时间 单位：毫秒
 * @param accelTime 加速时间
 * @param maxPulseSpeed 最大脉冲速度
 * @param accelPulse 加速脉冲总量
 * */
const getStartPulse = (
  elapsed: number,
  accelTime: number,
  maxPulseSpeed: number,
  accelPulse: number
) => {
  // === 启动阶段：加速 + 匀速 ===
  if (elapsed <= accelTime) {
    return accelPulse * (elapsed / accelTime)
  } else {
    return accelPulse + maxPulseSpeed * (elapsed - accelTime)
  }
}
