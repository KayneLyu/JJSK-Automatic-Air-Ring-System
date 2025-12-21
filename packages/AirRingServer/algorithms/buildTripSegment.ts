import { TripSegment, ValidThicknessData } from '../types'
import { RingData } from '../connections/airRing/opcua'
import { ThicknessData } from '../connections/thickness/opcua'
import { WithRequired } from '@jjsk/core'

/**
 * 计算时间间隔
 * */
const estimateSamplingInterval = () => {
  let prev: number | null = null
  const intervals: number[] = []
  const next = (timestamp: number) => {
    if (!prev) return 100 // default 10 Hz
    // 记录所有相邻时间差（单位：秒）
    const dt = timestamp - prev
    prev = timestamp
    if (dt > 0 && dt < 2) intervals.push(timestamp - prev)

    if (intervals.length === 0) return 100

    // 取中位数（抗异常值）
    const sorted = [...intervals].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    // 容忍最多连续丢失 2 个点
    return median * 3
  }
  return { next }
}
const extractSegment = (
  data: WithRequired<ThicknessData, 'timestamp'>[],
  baseInterval: number,
  startTime: number,
  duration: number,
  minPoints: number = 100
) => {
  const valid = data
    .filter((d) => {
      return d.timestamp >= startTime && d.timestamp <= startTime + duration
    })
    .map((d) => {
      return {
        t: d.timestamp - startTime,
        y: d.ProbeValue!,
      }
    })
  if (valid.length < minPoints) return []
  const maxGapSec = Math.min(1000, Math.max(100, baseInterval * 3))
  // Step 3: 提取最长连续段
  let current: ValidThicknessData[] = [valid[0]]
  let bestSegment: ValidThicknessData[] = [valid[0]]
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].t - valid[i - 1].t < maxGapSec) {
      current.push(valid[i])
    } else {
      if (current.length > bestSegment.length) bestSegment = [...current]
      current = [valid[i]]
    }
  }
  if (current.length > bestSegment.length) bestSegment = current
  if (bestSegment.length < minPoints) return []
  return bestSegment
}
/**
 * 生成旋转单程片段数据
 * */
export const buildTripSegment = () => {
  const { next: estimateSamplingIntervalNext } = estimateSamplingInterval()
  const segments: TripSegment[] = []

  let validThickness: WithRequired<ThicknessData, 'timestamp'>[] = []
  let baseInterval = 100
  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }) => {
    if (airRing) {
      if (!airRing.timestamp) return segments

      const currentSignal =
        !!airRing.ForwardRotation && !airRing.ReverseRotation
      if (segments.length > 0) {
        const prevSegment = segments[segments.length - 1]
        prevSegment.duration = airRing.timestamp - prevSegment.startTime
        prevSegment.measurements = extractSegment(
          validThickness,
          baseInterval,
          prevSegment.startTime,
          prevSegment.duration
        )
        if (currentSignal !== prevSegment.isForward) {
          validThickness = []
          segments.push({
            startTime: airRing.timestamp,
            duration: 0,
            isForward: currentSignal,
            measurements: [],
          })
        }
        return segments
      }
      segments.push({
        startTime: airRing.timestamp,
        duration: 0,
        isForward: currentSignal,
        measurements: [],
      })
    }
    if (thickness) {
      if (thickness.timestamp) {
        baseInterval = estimateSamplingIntervalNext(thickness.timestamp)
        if ((thickness.ProbeValue || 0) > 0) {
          validThickness.push(
            thickness as WithRequired<ThicknessData, 'timestamp'>
          )
        }
      }
    }
    return segments
  }
  return { next }
}
