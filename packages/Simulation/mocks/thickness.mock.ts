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
  maxSpeed?: number
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
  const maxPulseSpeed = maxSpeed / THICKNESS_UNIT_PULSE_DIS // pulse/ms
  const inMembraneTime = membraneWidth / maxSpeed // 膜内时间
  const inMembranePulses = membraneWidth / THICKNESS_UNIT_PULSE_DIS // 膜内总脉冲量
  const bufferTime = bufferPulse / maxPulseSpeed
  // 加减速段脉冲位移（匀变速）
  const accelPulse = 0.5 * maxPulseSpeed * accelTime // s = ½·v·t
  const decelPulse = 0.5 * maxPulseSpeed * decelTime
  // 启动阶段脉冲总量
  const startPulse = getStartPulse(
    START_TIME,
    accelTime,
    maxPulseSpeed,
    accelPulse
  )

  // 膜外总脉冲
  const outMembranePulses = decelPulse + bufferPulse
  // 最大速度脉冲总量
  const maxSpeedPulse = (inMembraneTime + bufferTime) * maxPulseSpeed
  // 最大脉冲量
  const maxPulse = startPulse + maxSpeedPulse + decelPulse
  // 最小脉冲量
  const minPulse = maxPulse - outMembranePulses * 2 - inMembranePulses
  // 单程周期
  const tripDuration =
    inMembraneTime + (bufferTime + decelTime) * 2 + PULSE_WINDOW
  // 总周期：往返一次的时间
  const cycleDuration = tripDuration * 2
  // 最大速度持续时间
  const maxSpeedDuration = tripDuration - accelTime - decelTime - PULSE_WINDOW

  const inCycleTime: number | null =
    START_TIME + inMembraneTime + bufferTime + decelTime // 进入循环时间，即首次换向时间

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
    // === 启动阶段 ===
    if (elapsed <= START_TIME) {
      const pulse = getStartPulse(elapsed, accelTime, maxPulseSpeed, accelPulse)
      return {
        HorizontalPulse: pulse,
        MotionDirection: true,
        ProbeValue: 0,
      }
    }
    if (elapsed <= inCycleTime) {
      /* 未完成首次换向 */
      if (elapsed <= START_TIME + inMembraneTime) {
        const probeValue = getProbeValue(
          deviation,
          period,
          elapsed,
          PULSE_WINDOW,
          mutationT
        )
        const pulse = startPulse + (elapsed - START_TIME) * maxPulseSpeed
        return {
          HorizontalPulse: pulse,
          MotionDirection: true,
          ProbeValue: probeValue,
          ResetSignal: false,
        }
      }
      const maxSpeedTime = inMembraneTime + bufferTime
      if (elapsed <= START_TIME + maxSpeedTime) {
        const pulse = startPulse + (elapsed - START_TIME) * maxPulseSpeed
        return {
          HorizontalPulse: pulse,
          MotionDirection: true,
          ProbeValue: 0,
        }
      }

      const pulse =
        startPulse +
        maxSpeedPulse +
        (elapsed - START_TIME - maxSpeedTime) * maxPulseSpeed * 0.5
      return {
        HorizontalPulse: pulse,
        MotionDirection: true,
        ProbeValue: 0,
      }
    }

    const tInCycle = (elapsed - inCycleTime) % cycleDuration // 在当前周期内的偏移（秒）
    // 是否正在向左扫描
    const direction = tInCycle < tripDuration
    // 单程扫描时间
    const tInTrip = direction ? tInCycle : tInCycle - tripDuration

    const probeValue = getProbeValue(
      deviation,
      period,
      elapsed,
      PULSE_WINDOW,
      mutationT
    )

    return getDataInCycle(
      direction,
      tInTrip,
      PULSE_WINDOW,
      maxPulse,
      accelTime,
      maxPulseSpeed,
      maxSpeedDuration,
      accelPulse,
      outMembranePulses,
      probeValue,
      inMembranePulses,
      minPulse
    )
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

const getProbeValue = (
  deviation: number,
  period: number,
  elapsed: number,
  PULSE_WINDOW: number,
  mutationT?: number
) => {
  // --- 探头值：模拟厚度，例如以正弦波叠加噪声 ---
  const baseValue = 100 // μm
  const maxDeviation = baseValue * deviation // 5% → 5 μm

  // 正弦部分：占 80% 幅度（4 μm）
  const sineAmplitude = maxDeviation * 0.8
  const periodMs = period * 1000
  const time = elapsed % periodMs
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
  return probeValue
}

const getDataInCycle = (
  direction: boolean,
  tInTrip: number,
  PULSE_WINDOW: number,
  maxPulse: number,
  accelTime: number,
  maxPulseSpeed: number,
  maxSpeedDuration: number,
  accelPulse: number,
  outMembranePulses: number,
  probeValue: number,
  inMembranePulses: number,
  minPulse: number
) => {
  /* 从左到右 */
  if (direction) {
    /* 换向阶段 */
    if (tInTrip <= PULSE_WINDOW) {
      return {
        HorizontalPulse: maxPulse,
        MotionDirection: !direction,
        ProbeValue: 0,
        SwapDirection: true,
      }
    }
    /* 加速阶段 */
    if (tInTrip <= PULSE_WINDOW + accelTime) {
      return {
        HorizontalPulse:
          maxPulse - (tInTrip - PULSE_WINDOW) * maxPulseSpeed * 0.5,
        MotionDirection: !direction,
        ProbeValue: 0,
      }
    }
    /* 最大速度阶段 */
    if (tInTrip <= PULSE_WINDOW + accelTime + maxSpeedDuration) {
      const pulse =
        maxPulse -
        accelPulse -
        (tInTrip - PULSE_WINDOW - accelTime) * maxPulseSpeed
      if (
        pulse > outMembranePulses &&
        pulse < outMembranePulses + inMembranePulses
      ) {
        /* 进入膜内 */
        return {
          HorizontalPulse: pulse,
          MotionDirection: !direction,
          ProbeValue: probeValue,
        }
      }
      return {
        HorizontalPulse: pulse,
        MotionDirection: !direction,
        ProbeValue: 0,
      }
    }
    /* 减速阶段 */
    const pulse =
      maxPulse -
      outMembranePulses -
      inMembranePulses -
      (tInTrip - PULSE_WINDOW - accelTime - maxSpeedDuration) *
        maxPulseSpeed *
        0.5
    return {
      HorizontalPulse: pulse,
      MotionDirection: !direction,
      ProbeValue: 0,
    }
  }
  /* 从右到左 */
  /* 换向阶段 */
  if (tInTrip <= PULSE_WINDOW) {
    return {
      HorizontalPulse: minPulse,
      MotionDirection: !direction,
      ProbeValue: 0,
      SwapDirection: true,
    }
  }
  /* 加速阶段 */
  if (tInTrip <= PULSE_WINDOW + accelTime) {
    return {
      HorizontalPulse:
        minPulse + (tInTrip - PULSE_WINDOW) * maxPulseSpeed * 0.5,
      MotionDirection: !direction,
      ProbeValue: 0,
    }
  }
  /* 最大速度阶段 */
  if (tInTrip <= PULSE_WINDOW + accelTime + maxSpeedDuration) {
    const pulse =
      minPulse +
      accelPulse +
      (tInTrip - PULSE_WINDOW - accelTime) * maxPulseSpeed
    if (
      pulse > outMembranePulses &&
      pulse < outMembranePulses + inMembranePulses
    ) {
      /* 进入膜内 */
      return {
        HorizontalPulse: pulse,
        MotionDirection: !direction,
        ProbeValue: probeValue,
      }
    }
    return {
      HorizontalPulse: pulse,
      MotionDirection: !direction,
      ProbeValue: 0,
    }
  }
  /* 减速阶段 */
  const pulse =
    minPulse +
    outMembranePulses +
    inMembranePulses +
    (tInTrip - PULSE_WINDOW - accelTime - maxSpeedDuration) *
      maxPulseSpeed *
      0.5
  return {
    HorizontalPulse: pulse,
    MotionDirection: !direction,
    ProbeValue: 0,
  }
}
