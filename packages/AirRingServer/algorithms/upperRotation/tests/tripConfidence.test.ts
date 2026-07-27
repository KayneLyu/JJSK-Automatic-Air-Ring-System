import { describe, expect, test } from 'vitest'
import type { AngularVelocityObservation } from '../upperRotation.angularVelocity'
import { aggregateTripConfidenceEvidence } from '../upperRotation.tripConfidence'

const observation = (
  correlation: number,
  overlapRatio: number,
  peakProminence: number | null,
  fisherPeakSeparation: number | null
): AngularVelocityObservation => ({
  accepted: true,
  expectedDirection: 'positive',
  elapsedMs: 30_000,
  angleDeltaDeg: 24,
  angularVelocityDegPerSecond: 0.8,
  speedMagnitudeDegPerSecond: 0.8,
  confidenceEvidence: {
    correlation,
    overlapRatio,
    peakProminence,
    fisherPeakSeparation,
    peakAtSearchBoundary: false,
    equivalentPeakCount: 1,
  },
  confidenceViolations: [],
  trackingRejectReason: null,
  rejectReason: null,
})

describe('行程级置信度证据聚合', () => {
  test('逐维输出中位数和最小值而不合成加权分数', () => {
    const result = aggregateTripConfidenceEvidence(
      [
        observation(0.8, 0.7, 0.1, 2),
        observation(0.9, 0.8, 0.2, 3),
        observation(0.95, 0.9, 0.3, 4),
      ],
      3
    )

    expect(result.accepted).toBe(true)
    expect(result.correlation).toEqual({ count: 3, median: 0.9, minimum: 0.8 })
    expect(result.overlapRatio).toEqual({
      count: 3,
      median: 0.8,
      minimum: 0.7,
    })
    expect(result.peakProminence).toEqual({
      count: 3,
      median: 0.2,
      minimum: 0.1,
    })
    expect(result.fisherPeakSeparation).toEqual({
      count: 3,
      median: 3,
      minimum: 2,
    })
    expect('score' in result).toBe(false)
  })

  test('区分无竞争峰与存在竞争峰但 Fisher 证据不可用', () => {
    const result = aggregateTripConfidenceEvidence(
      [observation(0.9, 0.8, null, null), observation(0.85, 0.8, 0.1, null)],
      2
    )

    expect(result.accepted).toBe(true)
    expect(result.noCompetingPeakCount).toBe(1)
    expect(result.fisherUnavailableCount).toBe(1)
    expect(result.peakProminence.count).toBe(1)
    expect(result.fisherPeakSeparation.count).toBe(0)
  })

  test('忽略上游拒绝观测并统计缺失与非法证据', () => {
    const rejectedObservation = {
      ...observation(0.9, 0.8, 0.2, 3),
      accepted: false,
      rejectReason: 'lowConfidence' as const,
    }
    const missingEvidence = {
      ...observation(0.9, 0.8, 0.2, 3),
      confidenceEvidence: null,
    }
    const invalidEvidence = observation(2, 0.8, 0.2, 3)
    const result = aggregateTripConfidenceEvidence(
      [
        observation(0.9, 0.8, 0.2, 3),
        rejectedObservation,
        missingEvidence,
        invalidEvidence,
      ],
      2
    )

    expect(result.accepted).toBe(false)
    expect(result.acceptedObservationCount).toBe(3)
    expect(result.evidenceCount).toBe(1)
    expect(result.missingEvidenceCount).toBe(1)
    expect(result.invalidEvidenceCount).toBe(1)
    expect(result.rejectReason).toBe('insufficientEvidence')
  })

  test('保留边界峰和等价峰异常计数', () => {
    const boundary = observation(0.9, 0.8, 0.2, 3)
    boundary.confidenceEvidence!.peakAtSearchBoundary = true
    const equivalent = observation(0.9, 0.8, 0.2, 3)
    equivalent.confidenceEvidence!.equivalentPeakCount = 2
    const result = aggregateTripConfidenceEvidence([boundary, equivalent], 2)

    expect(result.boundaryPeakCount).toBe(1)
    expect(result.equivalentPeakObservationCount).toBe(1)
  })

  test('拒绝非法的最少证据数', () => {
    expect(aggregateTripConfidenceEvidence([], 0).rejectReason).toBe(
      'invalidOptions'
    )
  })
})
