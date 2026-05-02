import { WithRequired } from '@jjsk/core'
import type { ThicknessData } from '../connections/thickness/opcua'

/**
 * 查找厚度突变处
 * @param deviation 最大差值
 * */
export const findMutation = (deviation: number = 0.05) => {
  let windowSize: number | null
  const queue: number[] = []
  const next = (
    data: ThicknessData
  ): WithRequired<ThicknessData, 'timestamp'> | null => {
    if (!data.timestamp || !data.ProbeValue) return null

    const value = data.ProbeValue
    // 入队
    queue.push(value)

    if (!windowSize) return null

    // 出队（如果超出窗口）
    if (queue.length > windowSize) {
      queue.shift() // 移除最老的（队首）元素
    }
    // 数据不足，不检测
    if (queue.length < windowSize) {
      return null
    }
    const avg = queue.reduce((a, c) => a + c, 0) / windowSize
    if (value < avg * (1 - deviation) || value > avg * (1 + deviation)) {
      return data as WithRequired<ThicknessData, 'timestamp'>
    }
    return null
  }
  const setWindowSize = (val: number) => {
    if (val <= 0) throw new Error('windowSize must be positive')
    windowSize = val
    if (queue.length > val) {
      queue.splice(0, queue.length - val) // 保留最新的 val 个
    }
  }
  return { next, setWindowSize }
}
