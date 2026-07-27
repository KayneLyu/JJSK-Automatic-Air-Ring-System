import { describe, expect, test } from 'vitest'
import type { AngularVelocityAggregate } from '../upperRotation.angularVelocity'
import { buildSingleTripAngleCandidate } from '../upperRotation.singleTripCandidate'
import type { TripConfidenceEvidenceAggregate } from '../upperRotation.tripConfidence'
import type { DebouncedCompleteTrip } from '../upperRotation.tripSegmentation'

const trip: DebouncedCompleteTrip = {
  accepted: true,
  direction: 'positive',
  startTime: 1000,
  endTime: 321_000,
  durationMs: 320_000,
  rejectReason: null,
}

const velocityAggregate: AngularVelocityAggregate = {
  accepted: true,
  direction: 'positive',
  inputCount: 10,
  acceptedCount: 8,
  rejectedCount: 2,
  medianAngularVelocityDegPerSecond: 1,
  medianSpeedMagnitudeDegPerSecond: 1,
  medianAbsoluteDeviationDegPerSecond: 0.01,
  relativeMedianAbsoluteDeviation: 0.01,
  maximumAbsoluteDeviationDegPerSecond: 0.03,
  rejectReason: null,
}

const confidenceAggregate: TripConfidenceEvidenceAggregate = {
  accepted: true,
  inputObservationCount: 10,
  acceptedObservationCount: 8,
  evidenceCount: 8,
  missingEvidenceCount: 0,
  invalidEvidenceCount: 0,
  noCompetingPeakCount: 2,
  fisherUnavailableCount: 0,
  boundaryPeakCount: 0,
  equivalentPeakObservationCount: 0,
  correlation: { count: 8, median: 0.9, minimum: 0.8 },
  overlapRatio: { count: 8, median: 0.85, minimum: 0.8 },
  peakProminence: { count: 6, median: 0.2, minimum: 0.1 },
  fisherPeakSeparation: { count: 6, median: 3, minimum: 2 },
  rejectReason: null,
}

const options = {
  trip,
  velocityAggregate,
  confidenceAggregate,
  endpointTiming: {
    source: 'deviceConfiguration' as const,
    provenanceId: 'plc-recipe:upper-v1',
    accelerationDurationMs: 20_000,
    decelerationDurationMs: 20_000,
  },
  minimumAngleDeg: 180,
  maximumAngleDeg: 360,
}

describe('单行程最大角度候选', () => {
  test('组合完整行程、稳健速度和可信端部时间', () => {
    const result = buildSingleTripAngleCandidate(options)

    expect(result).toMatchObject({
      accepted: true,
      direction: 'positive',
      maximumAngleDeg: 300,
      constantAngularSpeedDegPerSecond: 1,
      acceptedObservationCount: 8,
      relativeVelocityMad: 0.01,
      confidence: confidenceAggregate,
      tripDurationMs: 320_000,
      endpointTimingSource: 'deviceConfiguration',
      endpointTimingProvenanceId: 'plc-recipe:upper-v1',
      rejectReason: null,
    })
  })

  test('拒绝上游已拒绝的行程和速度聚合', () => {
    expect(
      buildSingleTripAngleCandidate({
        ...options,
        trip: { ...trip, accepted: false, rejectReason: 'tripTooShort' },
      })
    ).toMatchObject({
      accepted: false,
      rejectReason: 'invalidTrip',
      detailRejectReason: 'tripTooShort',
    })
    expect(
      buildSingleTripAngleCandidate({
        ...options,
        velocityAggregate: {
          ...velocityAggregate,
          accepted: false,
          rejectReason: 'insufficientObservations',
        },
      })
    ).toMatchObject({
      accepted: false,
      rejectReason: 'invalidVelocityAggregate',
      detailRejectReason: 'insufficientObservations',
    })
  })

  test('拒绝行程方向与速度方向冲突', () => {
    const result = buildSingleTripAngleCandidate({
      ...options,
      velocityAggregate: {
        ...velocityAggregate,
        direction: 'negative',
        medianAngularVelocityDegPerSecond: -1,
      },
    })

    expect(result.rejectReason).toBe('directionConflict')
    expect(result.detailRejectReason).toBe('negative')
  })

  test('拒绝证据数量不足的行程置信度聚合', () => {
    const result = buildSingleTripAngleCandidate({
      ...options,
      confidenceAggregate: {
        ...confidenceAggregate,
        accepted: false,
        rejectReason: 'insufficientEvidence',
      },
    })

    expect(result.rejectReason).toBe('invalidConfidenceAggregate')
    expect(result.detailRejectReason).toBe('insufficientEvidence')
  })

  test('仿真端部时间不能进入单行程候选', () => {
    const result = buildSingleTripAngleCandidate({
      ...options,
      endpointTiming: {
        ...options.endpointTiming,
        source: 'simulation',
      },
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('untrustedEndpointTiming')
    expect(result.detailRejectReason).toBe('untrustedSource')
  })

  test('端部模型无匀速区或角度越界时传播拒绝原因', () => {
    expect(
      buildSingleTripAngleCandidate({
        ...options,
        endpointTiming: {
          ...options.endpointTiming,
          accelerationDurationMs: 160_000,
          decelerationDurationMs: 160_000,
        },
      })
    ).toMatchObject({
      rejectReason: 'endpointCompensationRejected',
      detailRejectReason: 'noConstantSpeedInterval',
    })
    expect(
      buildSingleTripAngleCandidate({
        ...options,
        maximumAngleDeg: 290,
      })
    ).toMatchObject({
      rejectReason: 'endpointCompensationRejected',
      detailRejectReason: 'angleOutOfRange',
    })
  })
})
