import { describe, expect, test } from 'vitest'
import { trapezoidalPosition } from '../upperRotation.evaluation'
import { refineUpperRotationAngleOffline } from '../upperRotation.offlineRefinement'
import type {
  TripAngleCandidateAggregation,
  UpperRotationTripAngleCandidate,
} from '../upperRotation.tripCandidates'
import type { TripConfidenceEvidenceAggregate } from '../upperRotation.tripConfidence'

const confidence: TripConfidenceEvidenceAggregate = {
  accepted: true,
  inputObservationCount: 6,
  acceptedObservationCount: 5,
  evidenceCount: 5,
  missingEvidenceCount: 0,
  invalidEvidenceCount: 0,
  noCompetingPeakCount: 1,
  fisherUnavailableCount: 0,
  boundaryPeakCount: 0,
  equivalentPeakObservationCount: 0,
  correlation: { count: 5, median: 0.9, minimum: 0.8 },
  overlapRatio: { count: 5, median: 0.85, minimum: 0.75 },
  peakProminence: { count: 4, median: 0.2, minimum: 0.1 },
  fisherPeakSeparation: { count: 4, median: 3, minimum: 2 },
  rejectReason: null,
}

const candidate = (
  direction: 'positive' | 'negative',
  maximumAngleDeg: number
): UpperRotationTripAngleCandidate => ({
  accepted: true,
  direction,
  maximumAngleDeg,
  constantAngularSpeedDegPerSecond: 1,
  acceptedObservationCount: 5,
  relativeVelocityMad: 0.01,
  confidence,
})

const aggregation: TripAngleCandidateAggregation = {
  accepted: true,
  inputTripCount: 4,
  acceptedTripCount: 4,
  rejectedTripCount: 0,
  positiveTripCount: 2,
  negativeTripCount: 2,
  medianAngleDeg: 300,
  angleMadDeg: 1,
  angleStandardDeviationDeg: 1.2,
  positiveMedianAngleDeg: 299.5,
  negativeMedianAngleDeg: 300.5,
  bidirectionalMedianDifferenceDeg: 1,
  trendDegPerTrip: 0.2,
  rejectReason: null,
}

const candidates = [
  candidate('positive', 299),
  candidate('negative', 300),
  candidate('positive', 300),
  candidate('negative', 301),
]

const duration = 100
const accelRatio = 0.1
const trueAngleDeg = 302
const expandedSegments = [
  {
    duration,
    accelRatio,
    data: Array.from({ length: 1809 }, (_, index) => {
      const t = Math.floor(index / 9) / 2
      const offsetDeg = ((index % 9) - 4) * 20
      const phase =
        trapezoidalPosition(t / duration, accelRatio) *
          ((trueAngleDeg * Math.PI) / 180) +
        (offsetDeg * Math.PI) / 180
      return {
        t,
        y: Math.sin(phase * 3) * 8 + Math.cos(phase * 5) * 2,
        offsetDeg,
      }
    }),
  },
]

const options = () => ({
  aggregation,
  candidates,
  endpointTimingUncertaintyDeg: 0.5,
  expandedObjective: {
    segments: expandedSegments,
    numberOfBins: 48,
    minimumValidSegmentCount: 1,
    minimumFinitePointCount: 500,
  },
  localRefinement: {
    minimumRadiusDeg: 0,
    globalMinimumAngleDeg: 180,
    globalMaximumAngleDeg: 360,
    searchStepDeg: 0.25,
    maximumSearchPoints: 40,
    goldenRefinement: {
      angleToleranceDeg: 0.001,
      maximumIterations: 40,
      minimumBoundaryDistanceDeg: 0.05,
    },
    maximumFeatureObjectiveShiftDeg: 3,
  },
})

describe('通用角度离线精调编排', () => {
  test('串联三层并返回最终角度与完整诊断且不修改输入', () => {
    const input = options()
    const before = structuredClone(input)
    const result = refineUpperRotationAngleOffline(input)

    expect(result.accepted).toBe(true)
    expect(result.finalAngleDeg).toBeCloseTo(trueAngleDeg, 0)
    expect(result.finalLoss).not.toBeNull()
    expect(result.featureCandidate.accepted).toBe(true)
    expect(result.expandedObjective?.accepted).toBe(true)
    expect(result.localRefinement?.accepted).toBe(true)
    expect(result.rejectStage).toBeNull()
    expect(input).toEqual(before)
  })

  test('特征候选适配失败时停止后续阶段', () => {
    const result = refineUpperRotationAngleOffline({
      ...options(),
      aggregation: {
        ...aggregation,
        accepted: false,
        rejectReason: 'trendDrift',
      },
    })

    expect(result.rejectStage).toBe('featureCandidate')
    expect(result.rejectReason).toBe('aggregationRejected')
    expect(result.expandedObjective).toBeNull()
    expect(result.localRefinement).toBeNull()
  })

  test('expanded 目标适配失败时不进入局部精调', () => {
    const result = refineUpperRotationAngleOffline({
      ...options(),
      expandedObjective: { ...options().expandedObjective, numberOfBins: 1 },
    })

    expect(result.rejectStage).toBe('expandedObjective')
    expect(result.rejectReason).toBe('invalidOptions')
    expect(result.localRefinement).toBeNull()
  })

  test('局部精调失败时传播阶段和底层原因', () => {
    const result = refineUpperRotationAngleOffline({
      ...options(),
      localRefinement: { ...options().localRefinement, maximumSearchPoints: 2 },
    })

    expect(result.rejectStage).toBe('localRefinement')
    expect(result.rejectReason).toBe('searchBudgetExceeded')
    expect(result.localRefinement?.rejectStage).toBe('window')
  })
})
