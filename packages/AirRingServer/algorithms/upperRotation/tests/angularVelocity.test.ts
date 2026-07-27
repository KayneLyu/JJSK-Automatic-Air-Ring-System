import { describe, expect, test } from 'vitest'
import {
  aggregateAngularVelocityObservations,
  calculateAngularVelocityObservation,
  evaluateBidirectionalVelocityConsistency,
  evaluateAngularVelocityStability,
  selectSteadyStateAngularVelocityObservations,
  type AngularVelocityAggregate,
  type AngularVelocityObservation,
  type TimedAngularVelocityObservation,
} from '../upperRotation.angularVelocity'
import { trackProfileShift } from '../upperRotation.featureTracking'

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('角速度观测', () => {
  test('随机时间间隔和双向位移使用真实时间戳计算有符号角速度', () => {
    const random = createRandom(0x8c31a74d)
    for (let scenario = 0; scenario < 64; scenario++) {
      const length = 96
      const direction = random() < 0.5 ? -1 : 1
      const shift = direction * (1 + Math.floor(random() * 6))
      const elapsedMs = 500 + random() * 4500
      const degreesPerSample = 0.25 + random() * 1.75
      const maxShift = Math.abs(shift) + 1
      const reference = Array.from({ length }, () => random() * 2 - 1)
      const candidate = new Array<number>(length).fill(Number.NaN)
      for (let index = 0; index < length; index++) {
        const shiftedIndex = index + shift
        if (shiftedIndex >= 0 && shiftedIndex < length) {
          candidate[shiftedIndex] = reference[index] * 1.3 + 2
        }
      }
      const tracking = trackProfileShift(reference, candidate, {
        referenceTimestampMs: 20_000,
        candidateTimestampMs: 20_000 + elapsedMs,
        maxAngularSpeedDegPerSecond:
          (maxShift * degreesPerSample * 1000) / elapsedMs,
        degreesPerSample,
        minOverlapRatio: 0.7,
      })
      const observation = calculateAngularVelocityObservation(
        tracking,
        direction > 0 ? 'positive' : 'negative'
      )
      const expectedVelocity =
        ((tracking.angleDeltaDeg as number) * 1000) / elapsedMs

      expect(observation.accepted).toBe(true)
      expect(observation.angularVelocityDegPerSecond).toBeCloseTo(
        expectedVelocity,
        12
      )
      expect(observation.speedMagnitudeDegPerSecond).toBeCloseTo(
        Math.abs(expectedVelocity),
        12
      )
    }
  })

  test('换向方向冲突时拒绝但不篡改原始速度符号', () => {
    const tracking = trackProfileShift(
      [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8],
      [Number.NaN, 3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5],
      {
        referenceTimestampMs: 0,
        candidateTimestampMs: 2000,
        maxAngularSpeedDegPerSecond: 1.5,
        degreesPerSample: 1,
        minOverlapRatio: 0.5,
      }
    )
    const observation = calculateAngularVelocityObservation(
      tracking,
      'negative'
    )

    expect(tracking.accepted).toBe(true)
    expect(observation.accepted).toBe(false)
    expect(observation.rejectReason).toBe('directionConflict')
    expect(observation.angularVelocityDegPerSecond).toBeGreaterThan(0)
  })

  test('上游特征追踪拒绝原因向角速度观测传播', () => {
    const profile = [1, 2, 3, 4]
    const tracking = trackProfileShift(profile, profile, {
      referenceTimestampMs: 1000,
      candidateTimestampMs: 1000,
      maxAngularSpeedDegPerSecond: 1,
      degreesPerSample: 1,
      minOverlapRatio: 0.5,
    })
    const observation = calculateAngularVelocityObservation(
      tracking,
      'positive'
    )

    expect(observation.accepted).toBe(false)
    expect(observation.rejectReason).toBe('trackingRejected')
    expect(observation.trackingRejectReason).toBe('invalidTiming')
  })

  test('显式置信度策略拒绝低重叠观测且默认行为不变', () => {
    const tracking = trackProfileShift(
      [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8],
      [Number.NaN, 3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5],
      {
        referenceTimestampMs: 0,
        candidateTimestampMs: 2000,
        maxAngularSpeedDegPerSecond: 1.5,
        degreesPerSample: 1,
        minOverlapRatio: 0.5,
      }
    )
    const withoutPolicy = calculateAngularVelocityObservation(
      tracking,
      'positive'
    )
    const withPolicy = calculateAngularVelocityObservation(
      tracking,
      'positive',
      {
        minimumCorrelation: 0.9,
        minimumOverlapRatio: 1,
      }
    )

    expect(withoutPolicy.accepted).toBe(true)
    expect(withPolicy.accepted).toBe(false)
    expect(withPolicy.rejectReason).toBe('lowConfidence')
    expect(withPolicy.confidenceViolations).toEqual(['overlapRatio'])
    expect(withPolicy.angularVelocityDegPerSecond).toBeNull()
  })

  test('中位数聚合对单个极端错误保持稳健并输出 MAD', () => {
    const createObservation = (
      velocity: number,
      expectedDirection: 'positive' | 'negative' = 'positive'
    ): AngularVelocityObservation => ({
      accepted: true,
      expectedDirection,
      elapsedMs: 1000,
      angleDeltaDeg: velocity,
      angularVelocityDegPerSecond: velocity,
      speedMagnitudeDegPerSecond: Math.abs(velocity),
      confidenceEvidence: null,
      confidenceViolations: [],
      trackingRejectReason: null,
      rejectReason: null,
    })
    const random = createRandom(0x4e72b19a)
    for (let scenario = 0; scenario < 64; scenario++) {
      const center = 0.25 + random() * 2
      const spread = 0.001 + random() * 0.02
      const normal = [-2, -1, 0, 1, 2].map((offset) =>
        createObservation(center + offset * spread)
      )
      const baseline = aggregateAngularVelocityObservations(normal, {
        minimumAcceptedObservations: normal.length,
      })
      const contaminated = aggregateAngularVelocityObservations(
        [...normal, createObservation(center * (10 + random() * 90))],
        { minimumAcceptedObservations: normal.length }
      )

      expect(baseline.medianAngularVelocityDegPerSecond).toBeCloseTo(center, 12)
      expect(
        Math.abs(
          (contaminated.medianAngularVelocityDegPerSecond as number) - center
        )
      ).toBeLessThanOrEqual(spread)
      expect(contaminated.medianAbsoluteDeviationDegPerSecond).toBeGreaterThan(
        0
      )
      expect(contaminated.maximumAbsoluteDeviationDegPerSecond).toBeGreaterThan(
        contaminated.medianAbsoluteDeviationDegPerSecond as number
      )
    }
  })

  test('聚合要求调用方提供最少观测数并拒绝混合方向', () => {
    const observation = (direction: 'positive' | 'negative') =>
      ({
        accepted: true,
        expectedDirection: direction,
        angularVelocityDegPerSecond: direction === 'positive' ? 1 : -1,
      }) as AngularVelocityObservation

    expect(
      aggregateAngularVelocityObservations([observation('positive')], {
        minimumAcceptedObservations: 0,
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      aggregateAngularVelocityObservations([observation('positive')], {
        minimumAcceptedObservations: 2,
      }).rejectReason
    ).toBe('insufficientObservations')
    expect(
      aggregateAngularVelocityObservations(
        [observation('positive'), observation('negative')],
        { minimumAcceptedObservations: 2 }
      ).rejectReason
    ).toBe('mixedDirections')
  })

  test('仅保留完整位于调用方指定稳态时间窗内的观测', () => {
    const observation = {
      accepted: true,
      expectedDirection: 'positive',
      angularVelocityDegPerSecond: 1,
    } as AngularVelocityObservation
    const timed = (
      referenceTimestampMs: number,
      candidateTimestampMs: number
    ): TimedAngularVelocityObservation => ({
      referenceTimestampMs,
      candidateTimestampMs,
      observation,
    })
    const result = selectSteadyStateAngularVelocityObservations(
      [
        timed(0, 12_000),
        timed(12_000, 42_000),
        timed(42_000, 72_000),
        timed(72_000, 100_000),
        timed(-10_000, 5_000),
        timed(50_000, 49_000),
      ],
      {
        tripStartTimestampMs: 0,
        tripEndTimestampMs: 100_000,
        startExclusionMs: 12_000,
        endExclusionMs: 28_000,
      }
    )

    expect(result.accepted).toBe(true)
    expect(result.steadyStartTimestampMs).toBe(12_000)
    expect(result.steadyEndTimestampMs).toBe(72_000)
    expect(result.selectedCount).toBe(2)
    expect(result.excludedNearReversalCount).toBe(2)
    expect(result.excludedOutsideTripCount).toBe(1)
    expect(result.excludedInvalidTimingCount).toBe(1)
    expect(result.observations).toEqual([observation, observation])
  })

  test('随机行程仅接受完整落在稳态窗口内的扫描对', () => {
    const random = createRandom(0x91af20c4)
    const observation = {} as AngularVelocityObservation
    for (let scenario = 0; scenario < 64; scenario++) {
      const tripStartTimestampMs = random() * 10_000
      const tripDurationMs = 240_000 + random() * 240_000
      const tripEndTimestampMs = tripStartTimestampMs + tripDurationMs
      const startExclusionMs = 5_000 + random() * 20_000
      const endExclusionMs = 5_000 + random() * 20_000
      const steadyStart = tripStartTimestampMs + startExclusionMs
      const steadyEnd = tripEndTimestampMs - endExclusionMs
      const insideStart = steadyStart + random() * (steadyEnd - steadyStart - 1)
      const insideEnd = insideStart + random() * (steadyEnd - insideStart)
      const result = selectSteadyStateAngularVelocityObservations(
        [
          {
            referenceTimestampMs: insideStart,
            candidateTimestampMs: insideEnd,
            observation,
          },
          {
            referenceTimestampMs: tripStartTimestampMs,
            candidateTimestampMs: steadyStart + 1,
            observation,
          },
          {
            referenceTimestampMs: steadyEnd - 1,
            candidateTimestampMs: tripEndTimestampMs,
            observation,
          },
        ],
        {
          tripStartTimestampMs,
          tripEndTimestampMs,
          startExclusionMs,
          endExclusionMs,
        }
      )

      expect(result.selectedCount).toBe(1)
      expect(result.excludedNearReversalCount).toBe(2)
    }
  })

  test('拒绝非法端部时间和不存在的稳态窗口', () => {
    const options = {
      tripStartTimestampMs: 0,
      tripEndTimestampMs: 1000,
      startExclusionMs: -1,
      endExclusionMs: 0,
    }
    expect(
      selectSteadyStateAngularVelocityObservations([], options).rejectReason
    ).toBe('invalidOptions')
    expect(
      selectSteadyStateAngularVelocityObservations([], {
        ...options,
        startExclusionMs: 500,
        endExclusionMs: 500,
      }).rejectReason
    ).toBe('emptySteadyWindow')
  })

  test('调用方显式容差内的角速度聚合被接受', () => {
    const aggregate = aggregateAngularVelocityObservations(
      [0.98, 1, 1.01, 1.02, 1.03].map(
        (velocity) =>
          ({
            accepted: true,
            expectedDirection: 'positive',
            angularVelocityDegPerSecond: velocity,
          }) as AngularVelocityObservation
      ),
      { minimumAcceptedObservations: 5 }
    )
    const evaluation = evaluateAngularVelocityStability(aggregate, {
      maximumRelativeMedianAbsoluteDeviation: 0.02,
      maximumAbsoluteDeviationDegPerSecond: 0.04,
    })

    expect(evaluation.accepted).toBe(true)
    expect(evaluation.violations).toEqual([])
    expect(evaluation.rejectReason).toBeNull()
  })

  test('分别暴露相对离散度和最大绝对偏差越界', () => {
    const aggregate = {
      accepted: true,
      relativeMedianAbsoluteDeviation: 0.04,
      maximumAbsoluteDeviationDegPerSecond: 0.2,
    } as AngularVelocityAggregate

    expect(
      evaluateAngularVelocityStability(aggregate, {
        maximumRelativeMedianAbsoluteDeviation: 0.03,
        maximumAbsoluteDeviationDegPerSecond: 0.3,
      }).violations
    ).toEqual(['relativeMedianAbsoluteDeviation'])
    expect(
      evaluateAngularVelocityStability(aggregate, {
        maximumRelativeMedianAbsoluteDeviation: 0.05,
        maximumAbsoluteDeviationDegPerSecond: 0.1,
      }).violations
    ).toEqual(['maximumAbsoluteDeviationDegPerSecond'])
    expect(
      evaluateAngularVelocityStability(aggregate, {
        maximumRelativeMedianAbsoluteDeviation: 0.03,
        maximumAbsoluteDeviationDegPerSecond: 0.1,
      })
    ).toMatchObject({
      accepted: false,
      violations: [
        'relativeMedianAbsoluteDeviation',
        'maximumAbsoluteDeviationDegPerSecond',
      ],
      rejectReason: 'unstableVelocity',
    })
  })

  test('拒绝无效聚合结果和非法稳定性限值', () => {
    const validAggregate = {
      accepted: true,
      relativeMedianAbsoluteDeviation: 0.01,
      maximumAbsoluteDeviationDegPerSecond: 0.02,
    } as AngularVelocityAggregate
    expect(
      evaluateAngularVelocityStability(
        { ...validAggregate, accepted: false },
        {
          maximumRelativeMedianAbsoluteDeviation: 0.1,
          maximumAbsoluteDeviationDegPerSecond: 0.1,
        }
      ).rejectReason
    ).toBe('invalidAggregate')
    expect(
      evaluateAngularVelocityStability(validAggregate, {
        maximumRelativeMedianAbsoluteDeviation: -1,
        maximumAbsoluteDeviationDegPerSecond: 0.1,
      }).rejectReason
    ).toBe('invalidLimits')
  })

  test('正反向速度比较对输入顺序不敏感且在容差内接受', () => {
    const aggregate = (direction: 'positive' | 'negative', magnitude: number) =>
      ({
        accepted: true,
        direction,
        medianSpeedMagnitudeDegPerSecond: magnitude,
      }) as AngularVelocityAggregate
    const positive = aggregate('positive', 0.82)
    const negative = aggregate('negative', 0.8)
    const limits = {
      maximumAbsoluteDifferenceDegPerSecond: 0.03,
      maximumRelativeDifference: 0.03,
    }
    const forwardOrder = evaluateBidirectionalVelocityConsistency(
      positive,
      negative,
      limits
    )
    const reverseOrder = evaluateBidirectionalVelocityConsistency(
      negative,
      positive,
      limits
    )

    expect(forwardOrder.accepted).toBe(true)
    expect(forwardOrder).toEqual(reverseOrder)
    expect(forwardOrder.absoluteDifferenceDegPerSecond).toBeCloseTo(0.02, 12)
    expect(forwardOrder.relativeDifference).toBeCloseTo(0.02 / 0.81, 12)
  })

  test('分别暴露正反向速度绝对差和相对差越界', () => {
    const positive = {
      accepted: true,
      direction: 'positive',
      medianSpeedMagnitudeDegPerSecond: 1.2,
    } as AngularVelocityAggregate
    const negative = {
      accepted: true,
      direction: 'negative',
      medianSpeedMagnitudeDegPerSecond: 1,
    } as AngularVelocityAggregate

    expect(
      evaluateBidirectionalVelocityConsistency(positive, negative, {
        maximumAbsoluteDifferenceDegPerSecond: 0.1,
        maximumRelativeDifference: 0.2,
      }).violations
    ).toEqual(['absoluteDifferenceDegPerSecond'])
    expect(
      evaluateBidirectionalVelocityConsistency(positive, negative, {
        maximumAbsoluteDifferenceDegPerSecond: 0.3,
        maximumRelativeDifference: 0.1,
      }).violations
    ).toEqual(['relativeDifference'])
    expect(
      evaluateBidirectionalVelocityConsistency(positive, negative, {
        maximumAbsoluteDifferenceDegPerSecond: 0.1,
        maximumRelativeDifference: 0.1,
      })
    ).toMatchObject({
      accepted: false,
      violations: ['absoluteDifferenceDegPerSecond', 'relativeDifference'],
      rejectReason: 'inconsistentVelocity',
    })
  })

  test('拒绝无效聚合、同向聚合和非法双向容差', () => {
    const positive = {
      accepted: true,
      direction: 'positive',
      medianSpeedMagnitudeDegPerSecond: 1,
    } as AngularVelocityAggregate
    const negative = {
      accepted: true,
      direction: 'negative',
      medianSpeedMagnitudeDegPerSecond: 1,
    } as AngularVelocityAggregate
    const limits = {
      maximumAbsoluteDifferenceDegPerSecond: 0.1,
      maximumRelativeDifference: 0.1,
    }

    expect(
      evaluateBidirectionalVelocityConsistency(
        { ...positive, accepted: false },
        negative,
        limits
      ).rejectReason
    ).toBe('invalidAggregate')
    expect(
      evaluateBidirectionalVelocityConsistency(
        positive,
        { ...negative, direction: 'positive' },
        limits
      ).rejectReason
    ).toBe('sameDirection')
    expect(
      evaluateBidirectionalVelocityConsistency(positive, negative, {
        ...limits,
        maximumRelativeDifference: -1,
      }).rejectReason
    ).toBe('invalidLimits')
  })
})
