import type { TripSegment } from '../../types'

type SegmentQualitySnapshot = {
  segment: TripSegment
  validRatio: number
  pulseSpan: number
  pointCount: number
}

type FilterThresholds = {
  minCandidatePoints: number
  strictMinValidRatioFloor: number
  strictMinValidRatioFactor: number
  strictMinPointCountFloor: number
  strictMinPointCountFactor: number
  strictMinPulseSpanRatio: number
  strictMinPulseVsMedian: number
  strictMinKeepRatio: number
  relaxedMinValidRatioFloor: number
  relaxedMinValidRatioFactor: number
  relaxedMinPointCountFloor: number
  relaxedMinPointCountFactor: number
  relaxedMinPulseSpanRatio: number
}

const DEFAULT_THRESHOLDS: FilterThresholds = {
  minCandidatePoints: 10,
  strictMinValidRatioFloor: 0.85,
  strictMinValidRatioFactor: 0.8,
  strictMinPointCountFloor: 100,
  strictMinPointCountFactor: 0.5,
  strictMinPulseSpanRatio: 0.7,
  strictMinPulseVsMedian: 0.85,
  strictMinKeepRatio: 0.6,
  relaxedMinValidRatioFloor: 0.7,
  relaxedMinValidRatioFactor: 0.6,
  relaxedMinPointCountFloor: 50,
  relaxedMinPointCountFactor: 0.35,
  relaxedMinPulseSpanRatio: 0.55,
}

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const inspectSegmentQuality = (
  segment: TripSegment
): SegmentQualitySnapshot => {
  const pointCount = segment.measurements.length
  if (pointCount === 0) {
    return {
      segment,
      validRatio: 0,
      pulseSpan: 0,
      pointCount,
    }
  }

  let validCount = 0
  let hasPulse = false
  let pulseMin = Infinity
  let pulseMax = -Infinity

  for (const point of segment.measurements) {
    if (isNaN(point.y)) continue

    validCount += 1
    const pulse = point.pulse
    if (pulse === undefined || !isFinite(pulse)) continue

    hasPulse = true
    if (pulse < pulseMin) pulseMin = pulse
    if (pulse > pulseMax) pulseMax = pulse
  }

  const pulseSpan = hasPulse ? pulseMax - pulseMin : 0
  return {
    segment,
    validRatio: validCount / pointCount,
    pulseSpan: isFinite(pulseSpan) && pulseSpan > 0 ? pulseSpan : 0,
    pointCount,
  }
}

export const filterLowQualityTripSegments = (
  segments: TripSegment[],
  thresholds: FilterThresholds = DEFAULT_THRESHOLDS
) => {
  if (segments.length <= 2) return segments

  const candidates: SegmentQualitySnapshot[] = []
  const validRatios: number[] = []
  const pulseSpans: number[] = []
  const pointCounts: number[] = []

  for (const segment of segments) {
    if (
      segment.duration <= 0 ||
      segment.measurements.length < thresholds.minCandidatePoints
    ) {
      continue
    }

    const snapshot = inspectSegmentQuality(segment)
    candidates.push(snapshot)
    validRatios.push(snapshot.validRatio)
    pulseSpans.push(snapshot.pulseSpan)
    pointCounts.push(snapshot.pointCount)
  }

  if (candidates.length <= 2) {
    return candidates.length > 0
      ? candidates.map((item) => item.segment)
      : segments
  }

  const medianValidRatio = getMedian(validRatios)
  const medianPulseSpan = getMedian(pulseSpans)
  const medianPointCount = getMedian(pointCounts)
  let maxPulseSpan = 0
  for (const pulseSpan of pulseSpans) {
    if (pulseSpan > maxPulseSpan) maxPulseSpan = pulseSpan
  }

  const strictFiltered = candidates
    .filter((item) => {
      const pulseSpanRatio =
        maxPulseSpan > 0 ? item.pulseSpan / maxPulseSpan : 1
      const pulseVsMedian =
        medianPulseSpan > 0 ? item.pulseSpan / medianPulseSpan : 1

      return (
        item.validRatio >=
          Math.min(
            thresholds.strictMinValidRatioFloor,
            medianValidRatio * thresholds.strictMinValidRatioFactor
          ) &&
        item.pointCount >=
          Math.max(
            thresholds.strictMinPointCountFloor,
            medianPointCount * thresholds.strictMinPointCountFactor
          ) &&
        (pulseSpanRatio >= thresholds.strictMinPulseSpanRatio ||
          pulseVsMedian >= thresholds.strictMinPulseVsMedian)
      )
    })
    .map((item) => item.segment)

  if (
    strictFiltered.length >=
    Math.max(2, Math.ceil(candidates.length * thresholds.strictMinKeepRatio))
  ) {
    return strictFiltered
  }

  const relaxedFiltered = candidates
    .filter((item) => {
      const pulseSpanRatio =
        maxPulseSpan > 0 ? item.pulseSpan / maxPulseSpan : 1
      return (
        item.validRatio >=
          Math.min(
            thresholds.relaxedMinValidRatioFloor,
            medianValidRatio * thresholds.relaxedMinValidRatioFactor
          ) &&
        item.pointCount >=
          Math.max(
            thresholds.relaxedMinPointCountFloor,
            medianPointCount * thresholds.relaxedMinPointCountFactor
          ) &&
        pulseSpanRatio >= thresholds.relaxedMinPulseSpanRatio
      )
    })
    .map((item) => item.segment)

  return relaxedFiltered.length >= 2
    ? relaxedFiltered
    : candidates.map((item) => item.segment)
}
