import { describe, expect, test } from 'vitest'
import { adaptTripCandidatesToFeatureRefinement } from '../upperRotation.featureCandidateAdapter'
import { buildDynamicLocalSearchWindow } from '../upperRotation.localSearchWindow'
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
  maximumAngleDeg: number,
  tripConfidence: TripConfidenceEvidenceAggregate | null = confidence
): UpperRotationTripAngleCandidate => ({
  accepted: true,
  direction,
  maximumAngleDeg,
  constantAngularSpeedDegPerSecond: 1,
  acceptedObservationCount: 5,
  relativeVelocityMad: 0.01,
  confidence: tripConfidence,
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

describe('Stage 6 特征粗估输入适配器', () => {
  test('输出具名最坏情况不确定度分量和置信诊断', () => {
    const result = adaptTripCandidatesToFeatureRefinement(
      aggregation,
      candidates,
      0.5
    )

    expect(result.accepted).toBe(true)
    expect(result.refinementInput?.featureAngleDeg).toBe(300)
    expect(
      result.refinementInput?.uncertaintyComponentsDeg.slice(0, 2)
    ).toEqual([1, 1])
    expect(result.refinementInput?.uncertaintyComponentsDeg[2]).toBeCloseTo(
      0.6,
      12
    )
    expect(result.refinementInput?.uncertaintyComponentsDeg[3]).toBe(0.5)
    expect(result.uncertainty?.observedTrendSpanDeg).toBeCloseTo(0.6, 12)
    expect(result.confidenceEvidenceCount).toBe(20)
    expect(result.minimumCorrelation).toBe(0.8)
    expect(result.minimumOverlapRatio).toBe(0.75)

    const window = buildDynamicLocalSearchWindow({
      ...result.refinementInput!,
      minimumRadiusDeg: 0,
      globalMinimumAngleDeg: 180,
      globalMaximumAngleDeg: 360,
      searchStepDeg: 0.5,
      maximumSearchPoints: 20,
    })
    expect(window.accepted).toBe(true)
    expect(window.totalUncertaintyDeg).toBeCloseTo(3.1, 12)
  })

  test('候选顺序不改变粗估输入', () => {
    const forward = adaptTripCandidatesToFeatureRefinement(
      aggregation,
      candidates,
      0.5
    )
    const reversed = adaptTripCandidatesToFeatureRefinement(
      aggregation,
      [...candidates].reverse(),
      0.5
    )

    expect(reversed).toEqual(forward)
  })

  test('传播聚合拒绝并校验聚合诊断', () => {
    expect(
      adaptTripCandidatesToFeatureRefinement(
        { ...aggregation, accepted: false, rejectReason: 'trendDrift' },
        candidates,
        0.5
      ).rejectReason
    ).toBe('aggregationRejected')
    expect(
      adaptTripCandidatesToFeatureRefinement(
        { ...aggregation, medianAngleDeg: null },
        candidates,
        0.5
      ).rejectReason
    ).toBe('invalidAggregationDiagnostics')
  })

  test('拒绝候选数量不一致和缺失置信证据', () => {
    expect(
      adaptTripCandidatesToFeatureRefinement(
        aggregation,
        candidates.slice(1),
        0.5
      ).rejectReason
    ).toBe('candidateCountMismatch')
    expect(
      adaptTripCandidatesToFeatureRefinement(
        aggregation,
        [candidate('positive', 299, null), ...candidates.slice(1)],
        0.5
      ).rejectReason
    ).toBe('missingTripConfidence')
  })

  test('拒绝非法端部时间角度不确定度', () => {
    expect(
      adaptTripCandidatesToFeatureRefinement(aggregation, candidates, -1)
        .rejectReason
    ).toBe('invalidEndpointTimingUncertainty')
  })
})
