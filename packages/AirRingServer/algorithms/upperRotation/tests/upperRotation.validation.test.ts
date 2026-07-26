import { describe, expect, test } from 'vitest'
import type { TripSegment } from '../../../types'
import { trapezoidalPosition } from '../upperRotation.evaluation'
import {
  estimateThetaMaxWithPhaseCorrection,
  filterPartialSegments,
} from '../upperRotation.estimate'

const makeSegment = (
  duration: number,
  values: readonly number[],
  isForward = true
): TripSegment => ({
  startTime: 0,
  duration,
  isForward,
  measurements: values.map((y, index) => ({
    t: (duration * index) / Math.max(1, values.length - 1),
    y,
    pulse: index * 100,
  })),
})

describe('上旋最大角度输入与边界保护', () => {
  test('恒定厚度信号不应产生伪最大角度', () => {
    const segments = [
      makeSegment(1000, Array(20).fill(100)),
      makeSegment(1000, Array(20).fill(100), false),
    ]

    expect(estimateThetaMaxWithPhaseCorrection(segments)).toBeNull()
  })

  test('梯形位置映射对无效加速比例仍保持有限和单调', () => {
    for (const accelRatio of [0.5, 1, Number.POSITIVE_INFINITY]) {
      const positions = [0, 0.25, 0.5, 0.75, 1].map((progress) =>
        trapezoidalPosition(progress, accelRatio)
      )
      expect(positions.every(Number.isFinite)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
      expect(positions[0]).toBe(0)
      expect(positions.at(-1)).toBe(1)
    }
  })

  test('首尾短片段不会主导完整行程阈值', () => {
    const partialStart = makeSegment(100, Array(10).fill(1))
    const complete = makeSegment(1000, Array(10).fill(2))
    const partialEnd = makeSegment(120, Array(10).fill(3))

    expect(filterPartialSegments([partialStart, complete, partialEnd])).toEqual(
      [complete]
    )
  })

  test('非有限搜索步长会被拒绝', () => {
    const segments = [
      makeSegment(
        1000,
        Array.from({ length: 20 }, (_, i) => i)
      ),
      makeSegment(
        1000,
        Array.from({ length: 20 }, (_, i) => i + 1),
        false
      ),
    ]

    expect(() =>
      estimateThetaMaxWithPhaseCorrection(segments, {
        deltaRange: { step: Number.NaN },
      })
    ).toThrow('角度范围验证失败')
  })
})
