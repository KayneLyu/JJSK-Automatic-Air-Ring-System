import { describe, expect, test } from 'vitest'
import {
  aggregateTripAngleCandidates,
  type UpperRotationTripAngleCandidate,
} from '../upperRotation.tripCandidates'

const candidate = (
  maximumAngleDeg: number | null,
  direction: 'positive' | 'negative',
  accepted = true
): UpperRotationTripAngleCandidate => ({
  accepted,
  direction,
  maximumAngleDeg,
  constantAngularSpeedDegPerSecond: accepted ? 0.8 : null,
  acceptedObservationCount: accepted ? 8 : 0,
  relativeVelocityMad: accepted ? 0.01 : null,
  confidence: null,
})

describe('多行程角度候选聚合', () => {
  test('中位数对单个极端候选保持稳健并输出双向诊断', () => {
    const result = aggregateTripAngleCandidates(
      [
        candidate(300, 'positive'),
        candidate(301, 'negative'),
        candidate(299, 'positive'),
        candidate(300, 'negative'),
        candidate(900, 'positive'),
      ],
      { minimumAcceptedTrips: 4, maximumAbsoluteTrendDegPerTrip: 100 }
    )

    expect(result.accepted).toBe(true)
    expect(result.medianAngleDeg).toBe(300)
    expect(result.angleMadDeg).toBe(1)
    expect(result.positiveMedianAngleDeg).toBe(300)
    expect(result.negativeMedianAngleDeg).toBe(300.5)
    expect(result.bidirectionalMedianDifferenceDeg).toBe(0.5)
  })

  test('忽略上游拒绝和无效角度并检查最少有效行程', () => {
    const result = aggregateTripAngleCandidates(
      [
        candidate(300, 'positive'),
        candidate(301, 'negative'),
        candidate(900, 'positive', false),
        candidate(Number.NaN, 'negative'),
      ],
      { minimumAcceptedTrips: 3, maximumAbsoluteTrendDegPerTrip: 10 }
    )

    expect(result.accepted).toBe(false)
    expect(result.acceptedTripCount).toBe(2)
    expect(result.rejectedTripCount).toBe(2)
    expect(result.rejectReason).toBe('insufficientAcceptedTrips')
  })

  test('有效候选必须同时包含正向和反向行程', () => {
    const result = aggregateTripAngleCandidates(
      [candidate(300, 'positive'), candidate(301, 'positive')],
      { minimumAcceptedTrips: 2, maximumAbsoluteTrendDegPerTrip: 10 }
    )

    expect(result.accepted).toBe(false)
    expect(result.positiveTripCount).toBe(2)
    expect(result.negativeTripCount).toBe(0)
    expect(result.rejectReason).toBe('missingBidirectionalTrips')
  })

  test('趋势超过调用方上限时拒绝并保留聚合诊断', () => {
    const result = aggregateTripAngleCandidates(
      [
        candidate(280, 'positive'),
        candidate(290, 'negative'),
        candidate(300, 'positive'),
        candidate(310, 'negative'),
      ],
      { minimumAcceptedTrips: 4, maximumAbsoluteTrendDegPerTrip: 5 }
    )

    expect(result.accepted).toBe(false)
    expect(result.trendDegPerTrip).toBeCloseTo(10, 12)
    expect(result.medianAngleDeg).toBe(295)
    expect(result.rejectReason).toBe('trendDrift')
  })

  test('拒绝非法的最少行程数和趋势上限', () => {
    const candidates = [candidate(300, 'positive'), candidate(300, 'negative')]

    expect(
      aggregateTripAngleCandidates(candidates, {
        minimumAcceptedTrips: 1,
        maximumAbsoluteTrendDegPerTrip: 1,
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      aggregateTripAngleCandidates(candidates, {
        minimumAcceptedTrips: 2,
        maximumAbsoluteTrendDegPerTrip: -1,
      }).rejectReason
    ).toBe('invalidOptions')
  })
})
