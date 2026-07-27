import type { UpperRotationTripDirection } from './upperRotation.tripCandidates'

export type UpperRotationDirectionSample = {
  timestamp: number
  forwardRotation: boolean
  reverseRotation: boolean
}

export type DebouncedTripSegmentationOptions = {
  minimumStableSamples: number
  minimumTripDurationMs: number
  maximumTripDurationMs: number
}

export type DebouncedCompleteTrip = {
  accepted: boolean
  direction: UpperRotationTripDirection
  startTime: number
  endTime: number
  durationMs: number
  rejectReason: 'tripTooShort' | 'tripTooLong' | null
}

export type DebouncedTripSegmentationResult = {
  accepted: boolean
  inputSampleCount: number
  validDirectionSampleCount: number
  invalidDirectionSampleCount: number
  confirmedTransitionCount: number
  completeTripCount: number
  acceptedTripCount: number
  rejectedTripCount: number
  trips: DebouncedCompleteTrip[]
  rejectReason:
    | 'invalidOptions'
    | 'invalidTimestampOrder'
    | 'insufficientConfirmedTransitions'
    | 'noAcceptedCompleteTrips'
    | null
}

const sampleDirection = (
  sample: UpperRotationDirectionSample
): UpperRotationTripDirection | null => {
  if (sample.forwardRotation === sample.reverseRotation) return null
  return sample.forwardRotation ? 'positive' : 'negative'
}

/**
 * 从按时间排序的互斥方向信号中提取完整行程。
 * 首个和末个开放片段不完整，只有两个已确认换向边界之间的片段会被输出。
 */
export const segmentDebouncedCompleteTrips = (
  samples: UpperRotationDirectionSample[],
  options: DebouncedTripSegmentationOptions
): DebouncedTripSegmentationResult => {
  const rejected = (
    rejectReason: Exclude<
      DebouncedTripSegmentationResult['rejectReason'],
      null
    >,
    diagnostics?: Partial<DebouncedTripSegmentationResult>
  ): DebouncedTripSegmentationResult => ({
    accepted: false,
    inputSampleCount: samples.length,
    validDirectionSampleCount: 0,
    invalidDirectionSampleCount: 0,
    confirmedTransitionCount: 0,
    completeTripCount: 0,
    acceptedTripCount: 0,
    rejectedTripCount: 0,
    trips: [],
    ...diagnostics,
    rejectReason,
  })
  if (
    !Number.isInteger(options.minimumStableSamples) ||
    options.minimumStableSamples < 1 ||
    !Number.isFinite(options.minimumTripDurationMs) ||
    options.minimumTripDurationMs <= 0 ||
    !Number.isFinite(options.maximumTripDurationMs) ||
    options.maximumTripDurationMs < options.minimumTripDurationMs
  ) {
    return rejected('invalidOptions')
  }
  for (let index = 0; index < samples.length; index++) {
    if (
      !Number.isFinite(samples[index].timestamp) ||
      (index > 0 && samples[index].timestamp <= samples[index - 1].timestamp)
    ) {
      return rejected('invalidTimestampOrder')
    }
  }

  let validDirectionSampleCount = 0
  let invalidDirectionSampleCount = 0
  let stableDirection: UpperRotationTripDirection | null = null
  let pendingDirection: UpperRotationTripDirection | null = null
  let pendingStartTime = 0
  let pendingCount = 0
  const transitions: Array<{
    timestamp: number
    direction: UpperRotationTripDirection
  }> = []

  for (const sample of samples) {
    const direction = sampleDirection(sample)
    if (direction === null) {
      invalidDirectionSampleCount++
      pendingDirection = null
      pendingCount = 0
      continue
    }
    validDirectionSampleCount++
    if (direction === stableDirection) {
      pendingDirection = null
      pendingCount = 0
      continue
    }
    if (direction !== pendingDirection) {
      pendingDirection = direction
      pendingStartTime = sample.timestamp
      pendingCount = 1
    } else {
      pendingCount++
    }
    if (pendingCount < options.minimumStableSamples) continue

    if (stableDirection !== null) {
      transitions.push({ timestamp: pendingStartTime, direction })
    }
    stableDirection = direction
    pendingDirection = null
    pendingCount = 0
  }

  if (transitions.length < 2) {
    return rejected('insufficientConfirmedTransitions', {
      validDirectionSampleCount,
      invalidDirectionSampleCount,
      confirmedTransitionCount: transitions.length,
    })
  }

  const trips: DebouncedCompleteTrip[] = []
  for (let index = 1; index < transitions.length; index++) {
    const start = transitions[index - 1]
    const end = transitions[index]
    const durationMs = end.timestamp - start.timestamp
    const rejectReason =
      durationMs < options.minimumTripDurationMs
        ? 'tripTooShort'
        : durationMs > options.maximumTripDurationMs
          ? 'tripTooLong'
          : null
    trips.push({
      accepted: rejectReason === null,
      direction: start.direction,
      startTime: start.timestamp,
      endTime: end.timestamp,
      durationMs,
      rejectReason,
    })
  }
  const acceptedTripCount = trips.filter((trip) => trip.accepted).length
  const diagnostics = {
    inputSampleCount: samples.length,
    validDirectionSampleCount,
    invalidDirectionSampleCount,
    confirmedTransitionCount: transitions.length,
    completeTripCount: trips.length,
    acceptedTripCount,
    rejectedTripCount: trips.length - acceptedTripCount,
    trips,
  }
  if (acceptedTripCount === 0) {
    return {
      accepted: false,
      ...diagnostics,
      rejectReason: 'noAcceptedCompleteTrips',
    }
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
