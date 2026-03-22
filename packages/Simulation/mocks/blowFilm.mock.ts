import { UpperRotationDevice, RollerDevice, ThicknessDevice } from '@jjsk/core'
import { getCircumference } from '@jjsk/core/utils'

/**
 * 风环系统配置
 */
export type AirRingConfig = {
  /** 风道数量 (默认：12) */
  channelCount?: number

  /** 各风道基础风量/热量值 (默认：全为 20) */
  baseAirFlow?: number[]

  /** 风环安装偏移角度 (度，默认：0，表示 0 号风道在 0 度位置) */
  installationOffset?: number

  /** 风量波动幅度 (默认：0.02 即±2%) */
  flowDeviation?: number

  /** 风量波动周期 (秒，默认：120 秒) */
  flowPeriod?: number
}

/**
 * 膜泡厚度配置
 */
export type BubblePhysics = {
  /** 膜泡标称厚度 (微米，默认：100μm) */
  nominalThickness?: number

  /** 厚度对风量的敏感度 (μm/(m³/h)，默认：-2.0) */
  thicknessSensitivity?: number

  /** 膜泡半径 (毫米，默认：从膜宽反推) */
  bubbleRadius?: number

  /** 膜泡厚度分布的角度分辨率 (度，默认：0.5°，即360个采样点) */
  thicknessResolution?: number
}

/**
 * 上旋系统配置
 */
export type UpperRotationConfig = {
  /** 最大旋转角度 (度，范围 180-360，默认：270°) */
  maxAngle?: number

  /** 单程时间 (秒，默认：6 分钟=360 秒) */
  tripDuration?: number

  /** 加减速时间 (秒，默认：20 秒) */
  accelDecelTime?: number

  /** 复位角度位置 (默认：maxAngle/2) */
  resetAngle?: number

  /** 初始角度 (度，默认：0) */
  initialAngle?: number
}

/**
 * 测厚系统配置
 */
export type ThicknessScannerConfig = {
  /** 压平后的膜宽 (毫米，默认：1200mm，理论上约等于膜泡周长的一半，即 πr) */
  membraneWidth?: number

  /** 单程扫描时间 (秒，默认：30 秒) */
  tripDuration?: number

  /** 加减速时间 (秒，默认：0.5 秒) */
  accelDecelTime?: number

  /** 缓冲脉冲对应的距离 (毫米，默认：50mm) */
  bufferDistance?: number

  /** 单位脉冲位移量 (毫米/脉冲，需要通过标定得到) */
  pulseToDistance: number

  /** 采样间隔 (毫秒，默认：30ms) */
  sampleInterval?: number

  /** 测量噪声标准差 (微米，默认：0.5μm) */
  measurementNoise?: number

  /** 传感器延迟 (毫秒，默认：100ms) */
  sensorDelay?: number
}

/**
 * 牵引系统配置
 */
export type RollerConfig = {
  /** 牵引速度 (毫米/秒，默认：500mm/s) */
  speed?: number

  /** 辊筒参数 */
  roller: { DIAMETER: number } | { RADIUS: number } | { CIRCUMFERENCE: number }

  /** 脉冲窗口 (毫秒，默认：50ms) */
  pulseWindow?: number
}

/**
 * 完整吹膜系统配置
 */
export type BlowFilmSystemConfig = {
  airRing?: AirRingConfig
  bubble?: BubblePhysics
  upperRotation?: UpperRotationConfig
  scanner?: ThicknessScannerConfig
  roller?: RollerConfig

  /** 风环到测厚仪的物理距离 (毫米，默认：2000mm) */
  airRingToScannerDistance?: number

  /** 仿真开始时间戳 (默认：Date.now()) */
  startTime?: number
}

/**
 * 风量调整记录
 */
type AirFlowAdjustment = {
  /** 调整发生的仿真时间 (秒) */
  time: number
  /** 风道索引 */
  channelIndex: number
  /** 新风量值 */
  newValue: number
}

/**
 * 风环系统状态
 */
export type AirRingState = {
  /** 各风道当前风量值 */
  airFlows: number[]

  /** 膜泡圆周厚度分布 (沿圆周 N 个点的厚度值) */
  thicknessProfile: number[]

  /** 膜泡实际半径分布 */
  radiusProfile: number[]
}

/**
 * 上旋系统状态
 */
export type UpperRotationState = {
  /** 当前角度 (度) */
  angle: number

  /** 角速度 (度/秒) */
  angularVelocity: number

  /** 是否正在正向扫描 */
  isForward: boolean

  /** 正换向信号 */
  forwardDirectionChange: boolean

  /** 反换向信号 */
  reverseDirectionChange: boolean

  /** 复位信号 */
  reset: boolean

  /** 电机频率 (Hz) */
  motorFrequency: number
}

/**
 * 测厚系统状态
 */
export type ScannerState = {
  /** 横向脉冲计数 */
  pulse: number

  /** 横向位置 (毫米，0 点为中心) */
  position: number

  /** 运动方向 (true=向右) */
  direction: boolean

  /** 测量的厚度值 (双层厚度，微米) */
  measuredThickness: number | null

  /** 左限位信号 */
  leftLimit: boolean

  /** 右限位信号 */
  rightLimit: boolean

  /** 换向信号 */
  swapDirection: boolean

  /** 归零信号 */
  resetSignal: boolean

  /** 是否在有效测量区域 */
  inMeasurementZone: boolean
}

/**
 * 牵引系统状态
 */
export type RollerState = {
  /** 转过的总角度 (度) */
  totalAngle: number

  /** 辊速信号 */
  rollSpeedSignal: boolean

  /** 累计收卷长度 (毫米) */
  accumulatedLength: number
}

/**
 * 吹膜系统完整状态
 */
export type BlowFilmSystemState = {
  /** 仿真时间 (秒) */
  simulationTime: number

  /** 风环系统状态 */
  airRing: AirRingState

  /** 上旋系统状态 */
  upperRotation: UpperRotationState

  /** 测厚系统状态 */
  scanner: ScannerState

  /** 牵引系统状态 */
  roller: RollerState

  /** 原始膜泡在测厚仪位置的厚度 */
  bubbleThicknessAtScanner: number | null

  /** 测厚仪 OPC UA 数据 */
  thicknessDevice: ThicknessDevice

  /** 上旋 OPC UA 数据 */
  upperRotationDevice: UpperRotationDevice

  /** 牵引辊 OPC UA 数据 */
  rollerDevice: RollerDevice
}

/**
 * 从圆周分布数据中插值指定角度的值
 * @param angle 角度 (0-360度)
 * @param values 圆周均匀分布的数值数组
 * @param sampleCount 数组中的采样点数量（可选，默认为数组长度）
 */
const interpolateAirFlow = (
  angle: number,
  values: number[],
  sampleCount?: number
): number => {
  const count = sampleCount ?? values.length
  const normalizedAngle = ((angle % 360) + 360) % 360 // 确保角度在 [0, 360)
  const anglePerSample = 360 / count

  // 找到相邻的两个采样点
  const leftIndex = Math.floor(normalizedAngle / anglePerSample) % count
  const rightIndex = (leftIndex + 1) % count

  // 计算插值权重
  const angleInSample = normalizedAngle % anglePerSample
  const weight = angleInSample / anglePerSample

  // 线性插值
  return values[leftIndex] * (1 - weight) + values[rightIndex] * weight
}

/**
 * 根据风量和物理模型计算膜泡厚度
 * @param airFlow 局部风量
 * @param baseThickness 标称厚度
 * @param sensitivity 厚度对风量的敏感度
 * @param baseAirFlow 标称风量
 */
const calculateThicknessFromAirFlow = (
  airFlow: number,
  baseThickness: number,
  sensitivity: number,
  baseAirFlow: number
): number => {
  const deltaFlow = airFlow - baseAirFlow
  return baseThickness + sensitivity * deltaFlow
}

/**
 * 生成平滑的运动曲线 (梯形速度曲线)
 * @param progress 进度 [0, 1]
 * @param accelRatio 加速段占比
 * @param decelRatio 减速段占比
 */
const trapezoidalVelocityProfile = (
  progress: number,
  accelRatio: number,
  decelRatio: number
): number => {
  // 归一化系数：确保 progress=1 时输出恰好为 1
  const normFactor = 1 / (1 - 0.5 * accelRatio - 0.5 * decelRatio)

  let raw: number
  if (progress < accelRatio) {
    // 加速段：二次曲线（速度从 0 线性增加到 v_max）
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - decelRatio) {
    // 减速段（速度从 v_max 线性降到 0）
    const decelStart = 1 - decelRatio
    const localProgress = (progress - decelStart) / decelRatio
    raw =
      0.5 * accelRatio +
      (1 - accelRatio - decelRatio) +
      (localProgress - 0.5 * localProgress ** 2) * decelRatio
  } else {
    // 匀速段
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }

  return raw * normFactor
}

/**
 * 当测厚仪超出测量范围时的哨兵值
 * 根据 AirRingServer 的规范，出界应该归一到 NaN
 * */
const outOfBoundsProbeValue = Number.NaN

/**
 * 创建吹膜机物理仿真系统
 *
 * 这是一个**基于物理因果关系的耦合系统**：
 * 1. 风环风量 → 决定膜泡厚度分布
 * 2. 上旋位置 → 决定测厚仪测量位置
 * 3. 膜泡厚度 + 上旋位置 → 测厚仪读数
 * 4. 牵引速度 → 决定生产节奏
 *
 * 所有数据流遵循真实物理过程，可用于：
 * - 控制算法验证
 * - 参数优化仿真
 * - 故障诊断测试
 *
 * @param config 系统配置参数
 * @returns 仿真器对象
 *
 * @example
 * const simulator = createBlowFilmSimulator({
 *   airRing: {
 *     channelCount: 12,
 *     baseAirFlow: [20, 21, 20, 19, 20, 21, 20, 19, 20, 21, 20, 19],
 *     installationOffset: 0
 *   },
 *   bubble: {
 *     nominalThickness: 100,
 *     thicknessSensitivity: -2.0,
 *     bubbleRadius: 382.2, // mm，可选，默认从膜宽反推 (membraneWidth / π)
 *     thicknessResolution: 0.5 // 度，默认0.5°（720个采样点），确保测厚仪能采样到足够细节
 *   },
 *   upperRotation: {
 *     maxAngle: 270,
 *     tripDuration: 360, // 6 分钟
 *   },
 *   scanner: {
 *     membraneWidth: 1200, // mm，约等于 πr（膜泡周长的一半）
 *     tripDuration: 30, // 30 秒
 *     pulseToDistance: 0.1
 *   },
 *   roller: {
 *     speed: 500,
 *     roller: { DIAMETER: 200 }
 *   },
 *   airRingToScannerDistance: 2000 // mm，风环到测厚仪的距离，影响厚度变化的延迟时间
 * })
 *
 * // 实时仿真
 * setInterval(() => {
 * const state = simulator.next()
 *
 * // 调整某个风道的风量
 * if (state.simulationTime > 100) {
 * simulator.adjustAirFlow(3, 25) // 增加 3 号风道风量
 * }
 *
 * console.log('测厚仪读数:', state.scanner.measuredThickness)
 * }, 100)
 */
export const createBlowFilmSimulator = (config: BlowFilmSystemConfig = {}) => {
  // ========== 初始化配置 ==========
  const {
    airRing: airRingConfig = {} as AirRingConfig,
    bubble: bubbleConfig = {} as BubblePhysics,
    upperRotation: upperRotationConfig = {} as UpperRotationConfig,
    scanner: scannerConfig = {} as ThicknessScannerConfig,
    roller: rollerConfig = {} as RollerConfig,
    airRingToScannerDistance: configAirRingDistance,
    startTime: configStartTime,
  } = config

  // 风环参数
  const channelCount = airRingConfig.channelCount ?? 12
  const baseAirFlows =
    airRingConfig.baseAirFlow?.length === channelCount
      ? airRingConfig.baseAirFlow
      : Array(channelCount).fill(20)
  const installationOffset = airRingConfig.installationOffset ?? 0 // 安装偏移角度
  const flowDeviation = airRingConfig.flowDeviation ?? 0.02
  const flowPeriod = airRingConfig.flowPeriod ?? 120 // 秒

  // 膜泡物理参数
  const nominalThickness = bubbleConfig.nominalThickness ?? 100 // μm
  const thicknessSensitivity = bubbleConfig.thicknessSensitivity ?? -2.0 // μm/(m³/h)
  const thicknessResolution = bubbleConfig.thicknessResolution ?? 0.5 // 度

  // 测厚仪参数
  const membraneWidth = scannerConfig.membraneWidth ?? 1200 // mm
  const scannerTripDuration = scannerConfig.tripDuration ?? 30 // 秒
  const scannerAccelDecelTime = scannerConfig.accelDecelTime ?? 0.5 // 秒
  const bufferDistance = scannerConfig.bufferDistance ?? 50 // mm
  const pulseToDistance = scannerConfig.pulseToDistance
  const measurementNoise = scannerConfig.measurementNoise ?? 0.5 // μm
  const sensorDelay = scannerConfig.sensorDelay ?? 100 // ms

  // 膜泡半径计算（用于文档说明，实际使用 membraneWidth）
  // 物理关系：压平后膜宽 ≈ 膜泡周长的一半 = πr
  // 因此：r = 膜宽 / π
  // const bubbleRadius = bubbleConfig.bubbleRadius ?? membraneWidth / Math.PI // mm

  // 上旋参数
  const maxAngle = upperRotationConfig.maxAngle ?? 270 // 度
  const tripDuration = upperRotationConfig.tripDuration ?? 360 // 秒
  const accelDecelTime = upperRotationConfig.accelDecelTime ?? 20 // 秒
  const resetAngle = upperRotationConfig.resetAngle ?? maxAngle / 2
  let upperAngle = upperRotationConfig.initialAngle ?? 0

  // 牵引辊参数
  const rollerSpeed = rollerConfig.speed ?? 500 // mm/s
  const rollerCircumference = getCircumference(
    rollerConfig.roller ?? { DIAMETER: 200 }
  )
  const rollerPulseWindow = (rollerConfig.pulseWindow ?? 50) / 1000 // 秒

  // 物料传输延迟参数
  const airRingToScannerDistance = configAirRingDistance ?? 2000 // mm
  const materialTransportDelay = airRingToScannerDistance / rollerSpeed // 秒

  // ========== 运行时状态 ==========
  const startTime = configStartTime ?? Date.now()

  // 风量调整历史记录
  const airFlowAdjustmentHistory: AirFlowAdjustment[] = []

  // 缓存上一次的厚度测量值 (用于传感器延迟模拟)
  const thicknessBuffer: Array<{ time: number; value: number }> = []

  // 缓存膜泡厚度分布历史 (用于物料传输延迟模拟)
  // 存储格式：{ time: 仿真时间, profile: 厚度分布数组, upperAngle: 上旋角度 }
  const thicknessProfileHistory: Array<{
    time: number
    profile: number[]
    upperAngle: number
  }> = []

  /**
   * 根据指定时刻应用所有生效的风量调整
   * @param targetTime 目标仿真时间 (秒)
   * @returns 该时刻应该使用的风量数组
   */
  const getAirFlowsAtTime = (targetTime: number): number[] => {
    const airFlows = [...baseAirFlows]

    // 应用所有在目标时间之前发生的调整
    for (const adjustment of airFlowAdjustmentHistory) {
      if (adjustment.time <= targetTime) {
        airFlows[adjustment.channelIndex] = adjustment.newValue
      }
    }

    return airFlows
  }

  /**
   * 调整指定风道的风量
   * @param channelIndex 风道索引 (0 ~ channelCount-1)
   * @param newAirFlow 新的风量值
   */
  const adjustAirFlow = (channelIndex: number, newAirFlow: number) => {
    if (channelIndex >= 0 && channelIndex < channelCount) {
      const now = Date.now()
      const simulationTime = (now - startTime) / 1000

      // 记录调整事件
      airFlowAdjustmentHistory.push({
        time: simulationTime,
        channelIndex,
        newValue: newAirFlow,
      })

      // 更新基准值（用于未来的调整）
      baseAirFlows[channelIndex] = newAirFlow

      // 清理过期的调整记录（保留比延迟时间多一些的数据）
      const maxHistoryTime = materialTransportDelay + 10
      while (
        airFlowAdjustmentHistory.length > 1 &&
        airFlowAdjustmentHistory[0].time < simulationTime - maxHistoryTime
      ) {
        airFlowAdjustmentHistory.shift()
      }
    }
  }

  /**
   * 批量调整风环风量
   * @param airFlows 新的风量数组
   */
  const adjustAllAirFlows = (airFlows: number[]) => {
    if (airFlows.length === channelCount) {
      const now = Date.now()
      const simulationTime = (now - startTime) / 1000

      for (let i = 0; i < channelCount; i++) {
        airFlowAdjustmentHistory.push({
          time: simulationTime,
          channelIndex: i,
          newValue: airFlows[i],
        })
        baseAirFlows[i] = airFlows[i]
      }

      // 清理过期记录
      const maxHistoryTime = materialTransportDelay + 10
      while (
        airFlowAdjustmentHistory.length > 1 &&
        airFlowAdjustmentHistory[0].time < simulationTime - maxHistoryTime
      ) {
        airFlowAdjustmentHistory.shift()
      }
    }
  }

  /**
   * 仿真步进函数
   * 每次调用返回系统在指定时刻的完整状态
   */
  const next = (): BlowFilmSystemState => {
    const now = Date.now()
    const simulationTime = (now - startTime) / 1000 // 秒

    // ========== 1. 风环系统仿真 ==========
    // 获取当前时刻应该使用的风量基准值
    const effectiveBaseAirFlows = getAirFlowsAtTime(simulationTime)

    // 计算各风道的瞬时风量 (叠加波动)
    const airFlows = effectiveBaseAirFlows.map((baseFlow, i) => {
      const phaseShift = (i * 2 * Math.PI) / channelCount // 相位差
      const fluctuation =
        baseFlow *
        flowDeviation *
        Math.sin((2 * Math.PI * simulationTime) / flowPeriod + phaseShift)
      const noise = (Math.random() - 0.5) * baseFlow * flowDeviation * 0.5
      return baseFlow + fluctuation + noise
    })

    // 计算膜泡圆周厚度分布
    // 使用高分辨率采样点，确保测厚仪能够捕捉到足够细节
    const thicknessProfile: number[] = []
    const numSamples = Math.ceil(360 / thicknessResolution) // 采样点数量
    const angleStep = 360 / numSamples // 实际角度步长

    for (let i = 0; i < numSamples; i++) {
      // 当前采样点对应的膜泡角度位置 (考虑安装偏移)
      const bubbleAngle = (i * angleStep + installationOffset) % 360

      // 从风环各风道插值得到该位置的等效风量
      const localAirFlow = interpolateAirFlow(
        bubbleAngle,
        airFlows,
        channelCount
      )

      // 计算该位置的厚度 (由风量决定)
      const avgBaseFlow =
        effectiveBaseAirFlows.reduce((a, b) => a + b, 0) / channelCount
      const thickness = calculateThicknessFromAirFlow(
        localAirFlow,
        nominalThickness,
        thicknessSensitivity,
        avgBaseFlow
      )

      thicknessProfile.push(thickness)
    }

    const airRingState: AirRingState = {
      airFlows,
      thicknessProfile,
      radiusProfile: [], // 已移除半径分布计算
    }

    // ========== 2. 上旋系统仿真 ==========
    const cycleDuration = tripDuration * 2 // 往返周期
    const tInCycle = simulationTime % cycleDuration
    const isForward = tInCycle < tripDuration
    const tInTrip = isForward ? tInCycle : cycleDuration - tInCycle

    // 梯形速度曲线参数
    const accelRatio = accelDecelTime / tripDuration
    const decelRatio = accelDecelTime / tripDuration

    // 计算当前位置
    const progress = tInTrip / tripDuration
    const normalizedPosition = trapezoidalVelocityProfile(
      progress,
      accelRatio,
      decelRatio
    )

    upperAngle = normalizedPosition * maxAngle

    // 计算角速度（考虑归一化系数）
    const normFactor = 1 / (1 - 0.5 * accelRatio - 0.5 * decelRatio)
    const peakAngularVelocity = (maxAngle / tripDuration) * normFactor
    let angularVelocity = 0
    if (progress < accelRatio) {
      angularVelocity = peakAngularVelocity * (progress / accelRatio)
    } else if (progress > 1 - decelRatio) {
      angularVelocity = peakAngularVelocity * ((1 - progress) / decelRatio)
    } else {
      angularVelocity = peakAngularVelocity
    }

    // 如果不反向，保持正向角速度
    if (!isForward) {
      angularVelocity = -angularVelocity
    }

    // 换向信号
    // 正向行程结束时 tInTrip 接近 tripDuration；反向行程结束时 tInTrip 接近 0
    const atForwardLimit = isForward && tInTrip > tripDuration - accelDecelTime
    const atReverseLimit = !isForward && tInTrip < accelDecelTime

    // 复位信号
    const nearReset = Math.abs(upperAngle - resetAngle) < 1 // 1 度容差

    // 电机频率估算
    const maxMotorFrequency = 30 // Hz (假设)
    const motorFrequency =
      (Math.abs(angularVelocity) / peakAngularVelocity) * maxMotorFrequency

    const upperRotationState: UpperRotationState = {
      angle: upperAngle,
      angularVelocity,
      isForward,
      forwardDirectionChange: atForwardLimit,
      reverseDirectionChange: atReverseLimit,
      reset: nearReset,
      motorFrequency,
    }

    // 保存当前时刻的膜泡厚度分布与上旋角度到历史缓存
    thicknessProfileHistory.push({
      time: simulationTime,
      profile: [...thicknessProfile], // 复制数组，避免引用问题
      upperAngle,
    })

    // 清理过期的历史数据（保留比延迟时间多一些的数据）
    const maxHistoryTime = materialTransportDelay + 10 // 秒
    while (
      thicknessProfileHistory.length > 1 &&
      thicknessProfileHistory[0].time < simulationTime - maxHistoryTime
    ) {
      thicknessProfileHistory.shift()
    }

    // ========== 3. 测厚系统仿真 ==========
    const scannerCycleDuration = scannerTripDuration * 2
    const scannerTInCycle = simulationTime % scannerCycleDuration
    const scannerIsForward = scannerTInCycle < scannerTripDuration
    // 反向行程也需要 0→tripDuration 的单调时间轴，
    // 否则会把位移曲线“倒着喂给”分段公式，导致扫描范围被压缩。
    const scannerTInTrip = scannerIsForward
      ? scannerTInCycle
      : scannerTInCycle - scannerTripDuration

    // 测厚仪横向运动模型
    const scannerMaxSpeed =
      membraneWidth / (scannerTripDuration - scannerAccelDecelTime) // mm/s
    const scannerAccelDistance = 0.5 * scannerMaxSpeed * scannerAccelDecelTime

    let scannerPosition = 0 // 相对于中心的偏移
    let scannerDirection = true // true=向右

    if (scannerIsForward) {
      // 从左到右
      if (scannerTInTrip < scannerAccelDecelTime) {
        // 加速段
        scannerPosition =
          -membraneWidth / 2 -
          bufferDistance +
          0.5 * (scannerMaxSpeed / scannerAccelDecelTime) * scannerTInTrip ** 2
      } else if (scannerTInTrip < scannerTripDuration - scannerAccelDecelTime) {
        // 匀速段
        scannerPosition =
          -membraneWidth / 2 -
          bufferDistance +
          scannerAccelDistance +
          scannerMaxSpeed * (scannerTInTrip - scannerAccelDecelTime)
      } else {
        // 减速段
        const decelTime =
          scannerTInTrip - (scannerTripDuration - scannerAccelDecelTime)
        scannerPosition =
          membraneWidth / 2 +
          bufferDistance -
          0.5 * (scannerMaxSpeed / scannerAccelDecelTime) * decelTime ** 2
      }
      scannerDirection = true
    } else {
      // 从右到左
      if (scannerTInTrip < scannerAccelDecelTime) {
        scannerPosition =
          membraneWidth / 2 +
          bufferDistance -
          0.5 * (scannerMaxSpeed / scannerAccelDecelTime) * scannerTInTrip ** 2
      } else if (scannerTInTrip < scannerTripDuration - scannerAccelDecelTime) {
        scannerPosition =
          membraneWidth / 2 +
          bufferDistance -
          scannerAccelDistance -
          scannerMaxSpeed * (scannerTInTrip - scannerAccelDecelTime)
      } else {
        const decelTime =
          scannerTInTrip - (scannerTripDuration - scannerAccelDecelTime)
        scannerPosition =
          -membraneWidth / 2 -
          bufferDistance +
          0.5 * (scannerMaxSpeed / scannerAccelDecelTime) * decelTime ** 2
      }
      scannerDirection = false
    }

    // 计算脉冲数
    const scannerPulse = scannerPosition / pulseToDistance

    // 判断是否在测量区域
    const inMeasurementZone = Math.abs(scannerPosition) <= membraneWidth / 2

    // 限位信号
    const leftLimit = scannerPosition <= -membraneWidth / 2 - bufferDistance + 5
    const rightLimit = scannerPosition >= membraneWidth / 2 + bufferDistance - 5

    // 换向信号
    const swapDirection =
      scannerTInTrip < 0.1 || scannerTInTrip > scannerTripDuration - 0.1

    // 归零信号 (假设在中心位置)
    const resetSignal = Math.abs(scannerPosition) < 5 && !scannerIsForward

    // ========== 关键：计算测厚仪读数 ==========
    // 考虑物料传输延迟：从风环到测厚仪需要时间
    // 计算应该使用多久之前的膜泡厚度分布
    const delayedTime = simulationTime - materialTransportDelay

    // 从历史缓存中查找对应时刻的厚度分布
    let delayedThicknessProfile: number[] | null = null
    let delayedUpperAngle = upperAngle
    let originalThickness: number | null = null

    if (delayedTime > 0 && thicknessProfileHistory.length > 0) {
      // 查找最接近延迟时间的历史记录
      let closestIndex = 0
      let minTimeDiff = Math.abs(thicknessProfileHistory[0].time - delayedTime)

      for (let i = 1; i < thicknessProfileHistory.length; i++) {
        const timeDiff = Math.abs(thicknessProfileHistory[i].time - delayedTime)
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff
          closestIndex = i
        } else {
          // 由于历史记录是按时间排序的，一旦时间差开始变大就可以停止
          break
        }
      }

      delayedThicknessProfile = thicknessProfileHistory[closestIndex].profile
      delayedUpperAngle = thicknessProfileHistory[closestIndex].upperAngle

      // 将测厚仪位置映射到膜泡圆周位置
      // 物理关系：
      //   - 膜泡周长 = 2πr
      //   - 压平后膜宽 ≈ πr（周长的一半）
      //   - 测厚仪横向位移 x 对应的膜泡弧长 = x（压平是近似展开）
      //   - 膜泡弧长对应的角度 = 弧长 / 半径 = x / r（弧度）
      //   - 转换为角度：θ = (x / r) * (180 / π)
      // 由于膜宽 ≈ πr，所以：θ = (x / (membraneWidth / π)) * (180 / π) = x * 180 / membraneWidth
      // 这与原来的公式一致，但现在我们有了明确的物理依据
      const scannerAngleOffset = (scannerPosition / membraneWidth) * 180 // 线性映射（基于展开近似）

      // 使用延迟时刻的上旋角度，保持与延迟厚度分布同一物料时刻
      const bubblePositionAngle =
        (delayedUpperAngle + scannerAngleOffset + 180) % 360
      const oppositeAngle = (bubblePositionAngle + 180) % 360

      // 从延迟后的膜泡厚度分布中插值得到原始厚度
      // 测厚仪测量的是双层薄膜（压平后上下两层），对应膜泡上相隔 180° 的两个位置
      const thickness1 = interpolateAirFlow(
        bubblePositionAngle,
        delayedThicknessProfile
      )
      const thickness2 = interpolateAirFlow(
        oppositeAngle,
        delayedThicknessProfile
      )
      originalThickness = thickness1 + thickness2
    }
    // 如果 delayedTime <= 0，说明仿真刚开始，物料还没有到达测厚仪
    // originalThickness 保持为 null

    // 考虑传感器延迟
    let measuredThickness: number | null = null

    if (originalThickness !== null) {
      thicknessBuffer.push({ time: simulationTime, value: originalThickness })

      // 移除过期的缓存
      while (
        thicknessBuffer.length > 0 &&
        thicknessBuffer[0].time < simulationTime - sensorDelay / 1000
      ) {
        thicknessBuffer.shift()
      }

      // 获取延迟后的厚度值
      const delayedThickness =
        thicknessBuffer.length > 0
          ? thicknessBuffer[0].value
          : originalThickness

      // 双层厚度已在 originalThickness 中计算（两个 180° 位置之和），添加 2% 工艺变形
      const doubleThickness = delayedThickness * 1.02

      // 添加测量噪声
      const noise = (Math.random() - 0.5) * 2 * measurementNoise
      measuredThickness = inMeasurementZone ? doubleThickness + noise : null
    }
    // 如果 originalThickness 为 null，measuredThickness 保持为 null

    const scannerState: ScannerState = {
      pulse: scannerPulse,
      position: scannerPosition,
      direction: scannerDirection,
      measuredThickness,
      leftLimit,
      rightLimit,
      swapDirection,
      resetSignal,
      inMeasurementZone,
    }

    // ========== 4. 牵引系统仿真 ==========
    const rollerCycleDuration = rollerCircumference / rollerSpeed
    const rollerTInCycle = simulationTime % rollerCycleDuration
    const rollerTotalAngle = (rollerTInCycle / rollerCycleDuration) * 360
    const accumulatedLength = rollerSpeed * simulationTime

    const rollSpeedSignal = rollerTInCycle < rollerPulseWindow

    const rollerState: RollerState = {
      totalAngle: rollerTotalAngle,
      rollSpeedSignal,
      accumulatedLength,
    }

    // ========== 生成 OPC UA 数据 ==========
    // 厚度 OPC UA 数据
    const thicknessDevice: ThicknessDevice = {
      HorizontalPulse: Math.round(scannerPulse),
      MotionDirection: scannerDirection,
      ProbeValue:
        measuredThickness !== null
          ? parseFloat(measuredThickness.toFixed(2))
          : outOfBoundsProbeValue,
      LeftLimit: leftLimit,
      RightLimit: rightLimit,
      ResetSignal: resetSignal,
      SwapDirection: swapDirection,
    }

    // 上旋 OPC UA 数据
    const upperRotationDevice: UpperRotationDevice = {
      ForwardRotation: isForward,
      ReverseRotation: !isForward,
      ForwardDirectionChange: atForwardLimit,
      ReverseDirectionChange: atReverseLimit,
      Reset: nearReset,
      MotorFrequency: parseFloat(motorFrequency.toFixed(2)),
    }

    // 牵引辊 OPC UA 数据
    const rollerDevice: RollerDevice = {
      RollSpeedSignal: rollSpeedSignal,
    }

    return {
      simulationTime,
      airRing: airRingState,
      upperRotation: upperRotationState,
      scanner: scannerState,
      roller: rollerState,
      bubbleThicknessAtScanner: originalThickness,
      thicknessDevice,
      upperRotationDevice,
      rollerDevice,
    }
  }

  return {
    next,
    adjustAirFlow,
    adjustAllAirFlows,
  }
}

export default createBlowFilmSimulator
