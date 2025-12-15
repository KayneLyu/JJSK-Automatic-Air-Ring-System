import { WithRequired } from '@jjsk/core'
import { ThicknessData } from '../connections/thickness/opcua'
import { ValidThicknessData } from '../types'

/**
 * 计算时间间隔
 * */
const estimateSamplingInterval = (
  data: WithRequired<ThicknessData, 'timestamp'>[]
): number => {
  if (data.length < 2) return 100 // default 10 Hz

  // 计算所有相邻时间差（单位：秒）
  const intervals = data
    .slice(1)
    .map((m, i) => m.timestamp - data[i].timestamp)
    .filter((dt) => dt > 0 && dt < 2) // 排除异常大跳变

  if (intervals.length === 0) return 100

  // 取中位数（抗异常值）
  const sorted = [...intervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // 容忍最多连续丢失 2 个点
  return median * 3
}

/**
 * 提取测厚仪数据片段
 * @param data 测厚仪数据
 * @param startTime 开始时间 单位：毫秒
 * @param duration 持续时间 单位：毫秒
 * @param minPoints 最小样本数 默认：100
 * */
export const extractSegment = (
  data: ThicknessData[],
  startTime: number,
  duration: number,
  minPoints: number = 100
) => {
  //过滤没有时间戳的数据
  const tValid = data.filter((d) => !!d.timestamp) as WithRequired<
    ThicknessData,
    'timestamp'
  >[]

  // Step 1: 剔除物理无效点
  const valid = tValid
    .filter((d) => {
      if ((d.ProbeValue || 0) <= 0) return false //过滤无效厚度数据
      if (d.timestamp < startTime) return false //过滤不在时间范围内的数据
      if (d.timestamp > startTime + duration) return false //过滤不在时间范围内的数据
      return true
    })
    .map((d) => {
      return {
        t: d.timestamp - startTime,
        y: d.ProbeValue!,
      }
    })
    .sort((a, b) => a.t - b.t)

  if (valid.length < minPoints) return null
  // Step 2: 自适应 gap 阈值
  const baseInterval = estimateSamplingInterval(tValid)
  const maxGapSec = Math.min(1000, Math.max(100, baseInterval * 3))

  // Step 3: 提取最长连续段
  let bestSegment: ValidThicknessData[] = []
  let current: ValidThicknessData[] = [valid[0]]

  for (let i = 1; i < valid.length; i++) {
    if (valid[i].t - valid[i - 1].t < maxGapSec) {
      current.push(valid[i])
    } else {
      if (current.length > bestSegment.length) bestSegment = [...current]
      current = [valid[i]]
    }
  }
  if (current.length > bestSegment.length) bestSegment = current
  if (bestSegment.length < minPoints) return null
  return bestSegment
}
