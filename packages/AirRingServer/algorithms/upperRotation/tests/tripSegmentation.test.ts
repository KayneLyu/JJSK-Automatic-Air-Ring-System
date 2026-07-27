import { describe, expect, test } from 'vitest'
import {
  segmentDebouncedCompleteTrips,
  type UpperRotationDirectionSample,
} from '../upperRotation.tripSegmentation'

const samples = (
  directions: Array<'positive' | 'negative' | 'invalid'>,
  intervalMs = 1000
): UpperRotationDirectionSample[] =>
  directions.map((direction, index) => ({
    timestamp: index * intervalMs,
    forwardRotation: direction === 'positive',
    reverseRotation: direction === 'negative',
  }))

const options = {
  minimumStableSamples: 3,
  minimumTripDurationMs: 2000,
  maximumTripDurationMs: 10_000,
}

describe('换向去抖与完整行程验证', () => {
  test('只输出两个确认换向边界之间的完整行程', () => {
    const result = segmentDebouncedCompleteTrips(
      samples([
        'positive',
        'positive',
        'positive',
        'negative',
        'negative',
        'negative',
        'negative',
        'positive',
        'positive',
        'positive',
        'positive',
        'negative',
        'negative',
        'negative',
      ]),
      options
    )

    expect(result.accepted).toBe(true)
    expect(result.confirmedTransitionCount).toBe(3)
    expect(result.trips).toEqual([
      {
        accepted: true,
        direction: 'negative',
        startTime: 3000,
        endTime: 7000,
        durationMs: 4000,
        rejectReason: null,
      },
      {
        accepted: true,
        direction: 'positive',
        startTime: 7000,
        endTime: 11_000,
        durationMs: 4000,
        rejectReason: null,
      },
    ])
  })

  test('短暂方向毛刺不足稳定样本数时不触发换向', () => {
    const result = segmentDebouncedCompleteTrips(
      samples([
        'positive',
        'positive',
        'positive',
        'negative',
        'positive',
        'positive',
        'negative',
        'negative',
        'negative',
        'positive',
        'positive',
        'positive',
      ]),
      options
    )

    expect(result.confirmedTransitionCount).toBe(2)
    expect(result.completeTripCount).toBe(1)
    expect(result.trips[0].startTime).toBe(6000)
  })

  test('双真或双假信号打断连续稳定计数且保留诊断', () => {
    const result = segmentDebouncedCompleteTrips(
      samples([
        'positive',
        'positive',
        'positive',
        'negative',
        'invalid',
        'negative',
        'negative',
        'negative',
        'positive',
        'positive',
        'positive',
      ]),
      options
    )

    expect(result.invalidDirectionSampleCount).toBe(1)
    expect(result.trips[0]).toMatchObject({
      direction: 'negative',
      startTime: 5000,
      endTime: 8000,
    })
  })

  test('过短和过长完整行程不会成为已接受候选', () => {
    const shortResult = segmentDebouncedCompleteTrips(
      samples(['positive', 'negative', 'positive', 'negative', 'negative']),
      {
        minimumStableSamples: 1,
        minimumTripDurationMs: 1500,
        maximumTripDurationMs: 2500,
      }
    )

    expect(shortResult.accepted).toBe(false)
    expect(shortResult.trips.map((trip) => trip.rejectReason)).toEqual([
      'tripTooShort',
      'tripTooShort',
    ])
    expect(shortResult.rejectReason).toBe('noAcceptedCompleteTrips')

    const longResult = segmentDebouncedCompleteTrips(
      [
        { timestamp: 0, forwardRotation: true, reverseRotation: false },
        { timestamp: 1000, forwardRotation: false, reverseRotation: true },
        { timestamp: 5000, forwardRotation: true, reverseRotation: false },
      ],
      {
        minimumStableSamples: 1,
        minimumTripDurationMs: 1000,
        maximumTripDurationMs: 3000,
      }
    )
    expect(longResult.trips[0].rejectReason).toBe('tripTooLong')
  })

  test('拒绝非法配置、非递增时间戳和不足的确认换向', () => {
    const validSamples = samples(['positive', 'positive', 'negative'])
    expect(
      segmentDebouncedCompleteTrips(validSamples, {
        ...options,
        minimumStableSamples: 0,
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      segmentDebouncedCompleteTrips(
        [validSamples[0], { ...validSamples[1], timestamp: 0 }],
        options
      ).rejectReason
    ).toBe('invalidTimestampOrder')
    expect(
      segmentDebouncedCompleteTrips(validSamples, options).rejectReason
    ).toBe('insufficientConfirmedTransitions')
  })
})
