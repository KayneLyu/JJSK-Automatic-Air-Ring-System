import type { PushData } from '@jjsk/adbox-sdk'
export { calcGain, calcThickness } from '@jjsk/air-ring-server/algorithms/thickness'
export type { ThicknessCalcConfig as ThicknessConfig } from '@jjsk/air-ring-server/algorithms/thickness'
export { createThicknessCollector } from '@jjsk/air-ring-server/algorithms/thicknessCollector'
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
