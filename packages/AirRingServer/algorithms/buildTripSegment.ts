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
    if (dt > 0 && dt < 2) intervals.push(dt)
    prev = timestamp
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
  const min = valid.reduce((acc, cur) => {
    if (cur.y < acc) {
      return cur.y
    }
    return acc
  }, Infinity)
  const max = Math.trunc(min / 1000 + 2) * 1000
  return valid.filter((d) => {
    return d.y <= max
  })
}
/**
 * 生成旋转单程片段数据
 * */
export const buildTripSegment = () => {
  const segments: TripSegment[] = []

  let validThickness: WithRequired<
    ThicknessData,
    'timestamp' | 'ProbeValue'
  >[] = []
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

        if (currentSignal !== prevSegment.isForward) {
          prevSegment.measurements = extractSegment(
            validThickness,
            prevSegment.startTime,
            prevSegment.duration
          )
          validThickness = []
          segments.push({
            startTime: airRing.timestamp,
            duration: 0,
            isForward: currentSignal,
            measurements: [],
          })
        }
      } else {
        segments.push({
          startTime: airRing.timestamp,
          duration: 0,
          isForward: currentSignal,
          measurements: [],
        })
      }
    }
    if (thickness) {
      if (thickness.timestamp) {
        if ((thickness.ProbeValue || 0) > 0) {
          validThickness.push(
            thickness as WithRequired<ThicknessData, 'timestamp' | 'ProbeValue'>
          )
        }
      }
    }
    return segments
  }
  return { next }
}

export type ScanGroup = {
  data: number[]
  /**
   * 特征值
   * */
  features: number
  /**
   * 中点时间
   * */
  t: number
}
export const groupScans = (data: ThicknessData[]): ScanGroup[] => {
  const groups: ThicknessData[][] = []
  const min = data.reduce((acc, cur) => {
    if (cur.ProbeValue! < acc) {
      return cur.ProbeValue!
    }
    return acc
  }, Infinity)
  const max = min + 2000
  let current: ThicknessData[] = []
  let preSignal: boolean | null = null
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    if (d.timestamp && d.ProbeValue) {
      const currentSignal = d.ProbeValue! <= max
      if (currentSignal !== preSignal && currentSignal) {
        groups.push(current)
        current = []
      }
      if (currentSignal) {
        current.push(d)
      }
      preSignal = currentSignal
    }
  }
  console.log(
    groups
      .filter((d) => d.length > 10)
      .map((d) => {
        return d.map((d) => {
          return {
            t: d.timestamp!,
            y: d.ProbeValue!,
          }
        })
      })
  )
  return groups
    .filter((d) => d.length > 10)
    .map((d) => {
      const mean = d.reduce((a, b) => a + b.ProbeValue!, 0) / d.length
      const variance =
        d.reduce((a, b) => a + (b.ProbeValue! - mean) ** 2, 0) / d.length

      return {
        data: d.map((d) => d.ProbeValue!),
        features: Math.sqrt(variance), // 标准差
        t: d[Math.floor(d.length / 2)].timestamp!,
      }
    })
}

export const filterScans = (data: ThicknessData[]): ValidThicknessData[] => {
  const min = data.reduce((acc, cur) => {
    if (cur.ProbeValue! < acc) {
      return cur.ProbeValue!
    }
    return acc
  }, Infinity)
  const max = min + 2000
  const list: ValidThicknessData[] = []
  for (let i = 0; i < data.length; i++) {
    const d = data[i]
    if (d.timestamp && d.ProbeValue) {
      if (d.ProbeValue! <= max) {
        list.push({
          t: d.timestamp!,
          y: d.ProbeValue!,
        })
      } else {
        list.push({
          t: d.timestamp!,
          y: NaN,
        })
      }
    }
  }
  return list
}
