import type { PushData } from '@jjsk/adbox-sdk'
import type { IPollingBatchData } from '@/types/ipc'

type ThicknessRealtimePayload = IPollingBatchData | PushData | PushData[]

const hasBatchShape = (
  payload: unknown
): payload is IPollingBatchData => {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const candidate = payload as Partial<IPollingBatchData>
  return (
    Array.isArray(candidate.adValues) &&
    Array.isArray(candidate.pulses) &&
    Array.isArray(candidate.timestamps)
  )
}

const normalizeAdboxFrames = (
  payload: PushData | PushData[]
): IPollingBatchData | null => {
  const frames = Array.isArray(payload) ? payload : [payload]
  if (frames.length === 0) {
    return null
  }

  const nowMs = Date.now()
  const adValues: number[] = []
  const pulses: number[] = []
  const timestamps: number[] = []

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    if (
      !frame ||
      typeof frame.ad0 !== 'number' ||
      typeof frame.pos0 !== 'number'
    ) {
      continue
    }

    adValues.push(frame.ad0)
    pulses.push(frame.pos0)
    timestamps.push(nowMs + index)
  }

  if (adValues.length === 0) {
    return null
  }

  return {
    adValues,
    pulses,
    timestamps,
  }
}

export const normalizeThicknessRealtimePayload = (
  payload: ThicknessRealtimePayload
): IPollingBatchData | null => {
  if (hasBatchShape(payload)) {
    return payload
  }

  if (Array.isArray(payload)) {
    return normalizeAdboxFrames(payload)
  }

  if (payload && typeof payload === 'object') {
    return normalizeAdboxFrames(payload as PushData)
  }

  return null
}

/**
 * 数据更新与去重工具函数
 * @param newData 新轮询到的数据，包含 timestamps 和 adValues 两个数组
 * @param currentData 当前已经存在的图表数据 (二维数组格式)
 * @param maxLength 数据最大长度，默认为 1000
 * @returns 更新后的二维数组 [[time, value], ...]
 */
export const updateChartData = (
  newData: { timestamps: number[]; adValues: number[] },
  currentData: Array<[number, number]>,
  maxLength: number = 1000
): Array<[number, number]> => {
  // 1. 创建一个 Map 用于去重
  // Key: 时间戳 (number), Value: 数值 (number)
  const dataMap = new Map<number, number>()

  // 2. 先将旧数据放入 Map
  currentData.forEach(([time, value]) => {
    dataMap.set(time, value)
  })

  // 3. 将新数据放入 Map (覆盖旧数据)
  newData.timestamps.forEach((time, index) => {
    // 确保 adValues 有对应的值
    if (index < newData.adValues.length) {
      dataMap.set(time, newData.adValues[index])
    }
  })

  // 4. 将 Map 转回二维数组 [[time, value], ...]
  // Map 的 entries() 方法正好返回 [key, value] 的迭代器
  let result = Array.from(dataMap.entries())

  // 5. 按时间戳排序（升序）
  // a 和 b 此时都是 [time, value] 数组，a[0] 是时间戳
  result.sort((a, b) => a[0] - b[0])

  // 6. 维护最大长度
  // 如果超过 1000，截取最后 1000 条（保留最新的数据）
  if (result.length > maxLength) {
    result = result.slice(result.length - maxLength)
  }

  return result
}
export function createThicknessCollector(maxPulse = 7000) {
  const pulseMap = new Map()

  let lastPulse: any = null
  let direction: any = null

  const boundaryHigh = maxPulse * 0.97
  const boundaryLow = maxPulse * 0.03

  function process(pulses: number[], adValues: number[]) {
    let completedData = null

    for (let i = 0; i < pulses.length; i++) {
      const pulse = pulses[i]
      const ad = adValues[i]

      if (pulse < 0 || pulse > maxPulse) continue

      if (lastPulse !== null) {
        const delta = pulse - lastPulse

        let newDirection = direction

        if (delta > 0) newDirection = 1
        else if (delta < 0) newDirection = -1

        if (direction === 1 && pulse > boundaryHigh && newDirection === -1) {
          if (pulseMap.size > 500) {
            completedData = buildFullData()
          }
          pulseMap.clear()
        }

        if (direction === -1 && pulse < boundaryLow && newDirection === 1) {
          if (pulseMap.size > 500) {
            completedData = buildFullData()
          }
          pulseMap.clear()
        }

        direction = newDirection
      }

      pulseMap.set(pulse, ad)
      lastPulse = pulse
    }

    return completedData
  }

  function buildFullData() {
    const result = []
    let lastValue = null

    for (let i = 0; i <= maxPulse; i++) {
      if (pulseMap.has(i)) {
        lastValue = pulseMap.get(i)
      }
      result.push({
        pulse: i,
        ad: lastValue,
      })
    }

    return result
  }

  function getPreviewData() {
    const arr = []
    for (const [pulse, ad] of pulseMap) {
      arr.push([pulse, ad])
    }
    arr.sort((a, b) => a[0] - b[0])
    return arr
  }

  return {
    process,
    getPreviewData,
  }
}

/**
 * X光测厚计算配置
 */
export interface ThicknessConfig {
  /**
   * 空气AD值
   * 例如：50300
   */
  airAD: number

  /**
   * 材料补偿倍率
   * 默认 1.0
   *
   * 举例：
   * PE   -> 1.00
   * PP   -> 1.05
   * EVA  -> 0.96
   */
  gain?: number
}

/**
 * 根据 AD 值计算薄膜厚度（μm）
 *
 * 基于：
 * 1. X光指数吸收模型
 * 2. ln(air/ad)
 * 3. 二次工业拟合
 *
 * 标定样本来源：
 * 0~290μm 实际标定数据
 *
 * 精度：
 * RMS ≈ 0.35μm
 */
export function calcThickness(ad: number, config: ThicknessConfig): number {
  const { airAD, gain = 1.0 } = config

  // 防止异常
  if (ad <= 0) {
    return 0
  }

  // 防止 log 出现负数
  if (ad >= airAD) {
    return 0
  }

  /**
   * 指数吸收转换
   */
  const x = Math.log(airAD / ad)

  /**
   * 二次拟合公式
   *
   * Thickness = A*x² + B*x + C
   */
  const baseThickness = 9.65 * x * x + 243.08 * x - 0.087

  /**
   * 材料倍率补偿
   */
  const finalThickness = baseThickness * gain

  /**
   * 防止负值
   */
  return Math.max(0, finalThickness)
}

/**
 * 根据实际厚度与当前显示厚度
 * 自动计算材料倍率
 */
export function calcGain(
  actualThickness: number,
  displayedThickness: number
): number {
  if (displayedThickness <= 0) {
    return 1
  }

  return actualThickness / displayedThickness
}
