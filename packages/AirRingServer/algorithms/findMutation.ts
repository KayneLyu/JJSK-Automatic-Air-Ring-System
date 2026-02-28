import { WithRequired } from '@jjsk/core'
import { ThicknessData } from '../connections/thickness/opcua'

/**
 * 改进的突变检测算法，考虑膜泡对称性
 */
export const findMutation = (config?: {
  /**
   * 最大差值
   * */
  deviation?: number
  /**
   * 是否考虑膜泡对称性
   * */
  symmetryAware?: boolean
  /**
   * 窗口大小
   * */
  historyWindowSize?: number
}) => {
  const {
    deviation = 0.05,
    symmetryAware = true,
    historyWindowSize = 20,
  } = config || {}

  let windowSize: number | null = null
  const queue: number[] = []
  const angleHistory: { angle: number; thickness: number }[] = []

  const next = (
    data: ThicknessData,
    currentAngle?: number
  ): WithRequired<ThicknessData, 'timestamp'> | null => {
    if (!data.timestamp || !data.ProbeValue) return null

    const value = data.ProbeValue

    // 更新队列
    queue.push(value)
    if (currentAngle !== undefined) {
      angleHistory.push({ angle: currentAngle, thickness: value })
      // 保持历史窗口大小
      if (angleHistory.length > historyWindowSize) {
        angleHistory.shift()
      }
    }

    if (windowSize === null) return null

    // 出队（如果超出窗口）
    if (queue.length > windowSize) {
      queue.shift()
    }

    if (queue.length < windowSize) {
      return null
    }

    const avg = queue.reduce((a, c) => a + c, 0) / windowSize

    // 标准突变检测
    const isBasicMutation =
      value < avg * (1 - deviation) || value > avg * (1 + deviation)

    if (!symmetryAware || !currentAngle) {
      return isBasicMutation
        ? (data as WithRequired<ThicknessData, 'timestamp'>)
        : null
    }

    // 对称性感知的突变检测
    const symmetricAngle = (currentAngle + Math.PI) % (2 * Math.PI)
    const symmetricPoint = angleHistory.find(
      (d) => Math.abs(d.angle - symmetricAngle) < (2 * Math.PI) / 36 // 10度容差
    )

    if (symmetricPoint) {
      // 检查对称点是否存在相反的变化趋势
      const symmetricAvg = symmetricPoint.thickness
      const isSymmetricOpposite =
        (value > avg * (1 + deviation) &&
          symmetricPoint.thickness < symmetricAvg * (1 - deviation)) ||
        (value < avg * (1 - deviation) &&
          symmetricPoint.thickness > symmetricAvg * (1 + deviation))

      // 如果存在对称相反变化，这更可能是真实的突变
      if (isSymmetricOpposite) {
        return data as WithRequired<ThicknessData, 'timestamp'>
      }
    }

    return isBasicMutation
      ? (data as WithRequired<ThicknessData, 'timestamp'>)
      : null
  }

  const setWindowSize = (val: number) => {
    if (val <= 0) throw new Error('windowSize must be positive')
    windowSize = val
    if (queue.length > val) {
      queue.splice(0, queue.length - val)
    }
  }

  return { next, setWindowSize }
}
