import type { TripConfidenceEvidenceAggregate } from './upperRotation.tripConfidence'

export type UpperRotationTripDirection = 'positive' | 'negative'

export type UpperRotationTripAngleCandidate = {
  accepted: boolean
  direction: UpperRotationTripDirection
  maximumAngleDeg: number | null
  constantAngularSpeedDegPerSecond: number | null
  acceptedObservationCount: number
  relativeVelocityMad: number | null
  confidence: TripConfidenceEvidenceAggregate | null
}

export type AggregateTripAngleCandidatesOptions = {
  minimumAcceptedTrips: number
  maximumAbsoluteTrendDegPerTrip: number
}

export type TripAngleCandidateAggregation = {
  accepted: boolean
  inputTripCount: number
  acceptedTripCount: number
  rejectedTripCount: number
  positiveTripCount: number
  negativeTripCount: number
  medianAngleDeg: number | null
  angleMadDeg: number | null
  angleStandardDeviationDeg: number | null
  positiveMedianAngleDeg: number | null
  negativeMedianAngleDeg: number | null
  bidirectionalMedianDifferenceDeg: number | null
  trendDegPerTrip: number | null
  rejectReason:
    | 'invalidOptions'
    | 'insufficientAcceptedTrips'
    | 'missingBidirectionalTrips'
    | 'trendDrift'
    | null
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const calculateTrend = (values: number[]): number => {
  if (values.length < 2) return 0
  const pairwiseSlopes: number[] = []
  for (let left = 0; left < values.length - 1; left++) {
    for (let right = left + 1; right < values.length; right++) {
      pairwiseSlopes.push((values[right] - values[left]) / (right - left))
    }
  }
  return median(pairwiseSlopes)
}

/**
 * 聚合按时间顺序排列的完整行程角度候选。
 * 本层不替上游推断行程完整性，也不提供设备漂移容差默认值。
 */
export const aggregateTripAngleCandidates = (
  candidates: UpperRotationTripAngleCandidate[],
  options: AggregateTripAngleCandidatesOptions
): TripAngleCandidateAggregation => {
  const base = {
    inputTripCount: candidates.length,
    acceptedTripCount: 0,
    rejectedTripCount: candidates.length,
    positiveTripCount: 0,
    negativeTripCount: 0,
    medianAngleDeg: null,
    angleMadDeg: null,
    angleStandardDeviationDeg: null,
    positiveMedianAngleDeg: null,
    negativeMedianAngleDeg: null,
    bidirectionalMedianDifferenceDeg: null,
    trendDegPerTrip: null,
  }
  if (
    !Number.isInteger(options.minimumAcceptedTrips) ||
    options.minimumAcceptedTrips < 2 ||
    !Number.isFinite(options.maximumAbsoluteTrendDegPerTrip) ||
    options.maximumAbsoluteTrendDegPerTrip < 0
  ) {
    return { accepted: false, ...base, rejectReason: 'invalidOptions' }
  }

  const acceptedCandidates = candidates.filter(
    (candidate) =>
      candidate.accepted &&
      candidate.maximumAngleDeg !== null &&
      Number.isFinite(candidate.maximumAngleDeg)
  )
  if (acceptedCandidates.length < options.minimumAcceptedTrips) {
    return {
      accepted: false,
      ...base,
      acceptedTripCount: acceptedCandidates.length,
      rejectedTripCount: candidates.length - acceptedCandidates.length,
      rejectReason: 'insufficientAcceptedTrips',
    }
  }

  const positiveAngles = acceptedCandidates
    .filter((candidate) => candidate.direction === 'positive')
    .map((candidate) => candidate.maximumAngleDeg as number)
  const negativeAngles = acceptedCandidates
    .filter((candidate) => candidate.direction === 'negative')
    .map((candidate) => candidate.maximumAngleDeg as number)
  if (positiveAngles.length === 0 || negativeAngles.length === 0) {
    return {
      accepted: false,
      ...base,
      acceptedTripCount: acceptedCandidates.length,
      rejectedTripCount: candidates.length - acceptedCandidates.length,
      positiveTripCount: positiveAngles.length,
      negativeTripCount: negativeAngles.length,
      rejectReason: 'missingBidirectionalTrips',
    }
  }

  const angles = acceptedCandidates.map(
    (candidate) => candidate.maximumAngleDeg as number
  )
  const medianAngleDeg = median(angles)
  const angleMadDeg = median(
    angles.map((angle) => Math.abs(angle - medianAngleDeg))
  )
  const meanAngleDeg =
    angles.reduce((sum, angle) => sum + angle, 0) / angles.length
  const angleStandardDeviationDeg = Math.sqrt(
    angles.reduce((sum, angle) => sum + (angle - meanAngleDeg) ** 2, 0) /
      (angles.length - 1)
  )
  const positiveMedianAngleDeg = median(positiveAngles)
  const negativeMedianAngleDeg = median(negativeAngles)
  const trendDegPerTrip = calculateTrend(angles)
  const diagnostics = {
    inputTripCount: candidates.length,
    acceptedTripCount: acceptedCandidates.length,
    rejectedTripCount: candidates.length - acceptedCandidates.length,
    positiveTripCount: positiveAngles.length,
    negativeTripCount: negativeAngles.length,
    medianAngleDeg,
    angleMadDeg,
    angleStandardDeviationDeg,
    positiveMedianAngleDeg,
    negativeMedianAngleDeg,
    bidirectionalMedianDifferenceDeg: Math.abs(
      positiveMedianAngleDeg - negativeMedianAngleDeg
    ),
    trendDegPerTrip,
  }
  if (Math.abs(trendDegPerTrip) > options.maximumAbsoluteTrendDegPerTrip) {
    return { accepted: false, ...diagnostics, rejectReason: 'trendDrift' }
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
