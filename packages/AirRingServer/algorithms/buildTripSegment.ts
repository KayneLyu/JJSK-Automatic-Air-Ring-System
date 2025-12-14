import { BaseTripSegment } from '../types'
import { RingData } from '../connections/airRing/opcua'

/**
 * 生成旋转单程片段数据
 * */
export const buildTripSegment = () => {
  const segments: BaseTripSegment[] = []

  const next = (data: RingData) => {
    if (!data.timestamp) return segments

    const currentSignal = !!data.ForwardRotation && !data.ReverseRotation
    if (segments.length > 0) {
      const prevSegment = segments[segments.length - 1]
      prevSegment.duration = data.timestamp - prevSegment.startTime
      if (currentSignal !== prevSegment.isForward) {
        segments.push({
          startTime: data.timestamp,
          duration: 0,
          isForward: currentSignal,
        })
      }
      return segments
    }
    segments.push({
      startTime: data.timestamp,
      duration: 0,
      isForward: currentSignal,
    })
    return segments
  }
  return { next }
}
