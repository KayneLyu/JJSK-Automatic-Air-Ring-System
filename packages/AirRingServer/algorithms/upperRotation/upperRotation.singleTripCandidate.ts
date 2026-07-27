import type { AngularVelocityAggregate } from './upperRotation.angularVelocity'
import {
  calculateLinearEndpointCompensatedAngle,
  resolveTrustedEndpointTiming,
  type EndpointTimingEvidence,
} from './upperRotation.endpointCompensation'
import type { UpperRotationTripAngleCandidate } from './upperRotation.tripCandidates'
import type { TripConfidenceEvidenceAggregate } from './upperRotation.tripConfidence'
import type { DebouncedCompleteTrip } from './upperRotation.tripSegmentation'

export type BuildSingleTripAngleCandidateOptions = {
  trip: DebouncedCompleteTrip
  velocityAggregate: AngularVelocityAggregate
  confidenceAggregate: TripConfidenceEvidenceAggregate
  endpointTiming: EndpointTimingEvidence
  minimumAngleDeg: number
  maximumAngleDeg: number
}

export type SingleTripAngleCandidateResult = UpperRotationTripAngleCandidate & {
  tripStartTime: number
  tripEndTime: number
  tripDurationMs: number
  endpointTimingSource: EndpointTimingEvidence['source'] | null
  endpointTimingProvenanceId: string | null
  rejectReason:
    | 'invalidTrip'
    | 'invalidVelocityAggregate'
    | 'invalidConfidenceAggregate'
    | 'directionConflict'
    | 'untrustedEndpointTiming'
    | 'endpointCompensationRejected'
    | null
  detailRejectReason: string | null
}

/**
 * 将一个完整行程的稳健速度与可信端部时间组合为最大角度候选。
 * 上游任何一层拒绝都会被传播，不使用默认值补齐缺失证据。
 */
export const buildSingleTripAngleCandidate = ({
  trip,
  velocityAggregate,
  confidenceAggregate,
  endpointTiming,
  minimumAngleDeg,
  maximumAngleDeg,
}: BuildSingleTripAngleCandidateOptions): SingleTripAngleCandidateResult => {
  const rejected = (
    rejectReason: Exclude<SingleTripAngleCandidateResult['rejectReason'], null>,
    detailRejectReason: string | null,
    endpointTimingSource: EndpointTimingEvidence['source'] | null = null,
    endpointTimingProvenanceId: string | null = null
  ): SingleTripAngleCandidateResult => ({
    accepted: false,
    direction: trip.direction,
    maximumAngleDeg: null,
    constantAngularSpeedDegPerSecond:
      velocityAggregate.accepted &&
      velocityAggregate.medianSpeedMagnitudeDegPerSecond !== null &&
      Number.isFinite(velocityAggregate.medianSpeedMagnitudeDegPerSecond)
        ? velocityAggregate.medianSpeedMagnitudeDegPerSecond
        : null,
    acceptedObservationCount: velocityAggregate.acceptedCount,
    relativeVelocityMad:
      velocityAggregate.relativeMedianAbsoluteDeviation !== null &&
      Number.isFinite(velocityAggregate.relativeMedianAbsoluteDeviation)
        ? velocityAggregate.relativeMedianAbsoluteDeviation
        : null,
    confidence: null,
    tripStartTime: trip.startTime,
    tripEndTime: trip.endTime,
    tripDurationMs: trip.durationMs,
    endpointTimingSource,
    endpointTimingProvenanceId,
    rejectReason,
    detailRejectReason,
  })

  if (!trip.accepted) {
    return rejected('invalidTrip', trip.rejectReason)
  }
  if (
    !velocityAggregate.accepted ||
    velocityAggregate.direction === null ||
    velocityAggregate.medianSpeedMagnitudeDegPerSecond === null ||
    !Number.isFinite(velocityAggregate.medianSpeedMagnitudeDegPerSecond) ||
    velocityAggregate.medianSpeedMagnitudeDegPerSecond <= 0
  ) {
    return rejected('invalidVelocityAggregate', velocityAggregate.rejectReason)
  }
  if (velocityAggregate.direction !== trip.direction) {
    return rejected('directionConflict', velocityAggregate.direction)
  }
  if (!confidenceAggregate.accepted) {
    return rejected(
      'invalidConfidenceAggregate',
      confidenceAggregate.rejectReason
    )
  }

  const trustedTiming = resolveTrustedEndpointTiming(endpointTiming)
  if (
    !trustedTiming.accepted ||
    trustedTiming.accelerationDurationMs === null ||
    trustedTiming.decelerationDurationMs === null
  ) {
    return rejected(
      'untrustedEndpointTiming',
      trustedTiming.rejectReason,
      trustedTiming.source,
      trustedTiming.provenanceId
    )
  }
  const compensation = calculateLinearEndpointCompensatedAngle({
    constantAngularSpeedDegPerSecond:
      velocityAggregate.medianSpeedMagnitudeDegPerSecond,
    halfTripDurationMs: trip.durationMs,
    accelerationDurationMs: trustedTiming.accelerationDurationMs,
    decelerationDurationMs: trustedTiming.decelerationDurationMs,
    minimumAngleDeg,
    maximumAngleDeg,
  })
  if (!compensation.accepted || compensation.maximumAngleDeg === null) {
    return rejected(
      'endpointCompensationRejected',
      compensation.rejectReason,
      trustedTiming.source,
      trustedTiming.provenanceId
    )
  }

  return {
    accepted: true,
    direction: trip.direction,
    maximumAngleDeg: compensation.maximumAngleDeg,
    constantAngularSpeedDegPerSecond:
      velocityAggregate.medianSpeedMagnitudeDegPerSecond,
    acceptedObservationCount: velocityAggregate.acceptedCount,
    relativeVelocityMad: velocityAggregate.relativeMedianAbsoluteDeviation,
    confidence: confidenceAggregate,
    tripStartTime: trip.startTime,
    tripEndTime: trip.endTime,
    tripDurationMs: trip.durationMs,
    endpointTimingSource: trustedTiming.source,
    endpointTimingProvenanceId: trustedTiming.provenanceId,
    rejectReason: null,
    detailRejectReason: null,
  }
}
