import type { TripSegment } from '../../types'
import type { UpperRotationOffsetMode } from './upperRotation.config'
import { upperRotationRuntimeLimits } from './upperRotation.config'
import type { ExpandedPoint } from './upperRotation.evaluation'
import { filterPartialSegments } from './upperRotation.estimate'
import { expandWithScannerOffset } from './upperRotation.offset'

export interface UpperRotationNativeSegment {
  data: ExpandedPoint[]
  duration: number
  accelRatio: number
}

export interface UpperRotationNativeDto {
  times: Float64Array
  values: Float64Array
  offsetDegrees: Float64Array
  segmentOffsets: Uint32Array
  durations: Float64Array
  accelRatios: Float64Array
}

export type PrepareUpperRotationNativeOptions = {
  offsetMode?: UpperRotationOffsetMode
  accelDecelMs?: number
  filterPartial?: boolean
}

const downsample = (data: ExpandedPoint[], maxPoints: number) => {
  if (data.length <= maxPoints || maxPoints < 2) return data
  const result: ExpandedPoint[] = []
  const step = (data.length - 1) / (maxPoints - 1)
  for (let index = 0; index < maxPoints; index += 1) {
    result.push(data[Math.round(index * step)])
  }
  return result
}

const resolveAccelRatio = (duration: number, accelDecelMs?: number) => {
  const effectiveMs = accelDecelMs ?? Math.min(20_000, duration * 0.45)
  return Number.isFinite(effectiveMs)
    ? Math.max(0, Math.min(0.49, effectiveMs / duration))
    : 0
}

export const normalizeUpperRotationNativeSegments = (
  tripSegments: TripSegment[],
  options: PrepareUpperRotationNativeOptions = {}
): UpperRotationNativeSegment[] => {
  const completeSegments = tripSegments.filter(
    (segment) => segment.duration > 0
  )
  const sourceSegments =
    options.filterPartial === false
      ? completeSegments
      : filterPartialSegments(completeSegments)
  const normalized: UpperRotationNativeSegment[] = []

  for (const segment of sourceSegments) {
    if (segment.measurements.length === 0) continue
    const measurements = segment.isForward
      ? segment.measurements
      : segment.measurements.map((point) => ({
          ...point,
          t: segment.duration - point.t,
        }))
    const expanded = expandWithScannerOffset(
      measurements,
      options.offsetMode ?? 'auto',
      segment.isForward
    )
    if (expanded.length === 0) continue
    normalized.push({
      data: expanded,
      duration: segment.duration,
      accelRatio: resolveAccelRatio(segment.duration, options.accelDecelMs),
    })
  }

  const totalPoints = normalized.reduce(
    (sum, segment) => sum + segment.data.length,
    0
  )
  if (totalPoints <= upperRotationRuntimeLimits.SEARCH_MAX_POINTS) {
    return normalized
  }

  return normalized.map((segment) => ({
    ...segment,
    data: downsample(
      segment.data,
      Math.max(
        2,
        Math.round(
          (segment.data.length / totalPoints) *
            upperRotationRuntimeLimits.SEARCH_MAX_POINTS
        )
      )
    ),
  }))
}

export const buildUpperRotationNativeDto = (
  segments: readonly UpperRotationNativeSegment[]
): UpperRotationNativeDto => {
  const totalPoints = segments.reduce(
    (sum, segment) => sum + segment.data.length,
    0
  )
  const times = new Float64Array(totalPoints)
  const values = new Float64Array(totalPoints)
  const offsetDegrees = new Float64Array(totalPoints)
  const segmentOffsets = new Uint32Array(segments.length + 1)
  const durations = new Float64Array(segments.length)
  const accelRatios = new Float64Array(segments.length)

  let pointIndex = 0
  for (
    let segmentIndex = 0;
    segmentIndex < segments.length;
    segmentIndex += 1
  ) {
    const segment = segments[segmentIndex]
    segmentOffsets[segmentIndex] = pointIndex
    durations[segmentIndex] = segment.duration
    accelRatios[segmentIndex] = segment.accelRatio
    for (const point of segment.data) {
      times[pointIndex] = point.t
      values[pointIndex] = point.y
      offsetDegrees[pointIndex] = point.offsetDeg
      pointIndex += 1
    }
  }
  segmentOffsets[segments.length] = pointIndex

  return {
    times,
    values,
    offsetDegrees,
    segmentOffsets,
    durations,
    accelRatios,
  }
}
