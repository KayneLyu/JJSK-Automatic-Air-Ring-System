import { describe, expect, test } from 'vitest'
import {
  evaluateDirect as evaluateDirectNative,
  evaluateExpanded as evaluateExpandedNative,
  searchBestExpanded,
} from '../../../AirRingNative'
import {
  evaluateDirect,
  evaluateExpanded,
  type ExpandedPoint,
} from '../upperRotation/upperRotation.evaluation'
import {
  buildNativeDto,
  loadTripSegments,
  normalizeTripSegments,
  searchBestExpandedReference,
  type NormalizedSegment,
} from './upperRotationNativeFixtures'

const expectClose = (actual: number, expected: number) => {
  const tolerance = 1e-12 + Math.abs(expected) * 1e-10
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

const invokeNativeExpanded = (
  dto: ReturnType<typeof buildNativeDto>,
  theta: number,
  numBins: number
) =>
  evaluateExpandedNative(
    dto.times,
    dto.values,
    dto.offsetDegrees,
    dto.segmentOffsets,
    dto.durations,
    dto.accelRatios,
    theta,
    numBins
  )

const makeSyntheticSegments = (): NormalizedSegment[] => {
  const createSegment = (
    duration: number,
    phase: number
  ): NormalizedSegment => {
    const data: ExpandedPoint[] = []
    for (let index = 0; index < 2_000; index += 1) {
      const progress = index / 1_999
      data.push({
        t: progress * duration,
        y:
          index % 197 === 0
            ? Number.NaN
            : 50 + Math.sin(progress * Math.PI * 8 + phase) * 4,
        offsetDeg: (progress - 0.5) * 180,
      })
    }
    return { data, duration, accelRatio: 0.08 }
  }
  return [createSegment(420_000, 0), createSegment(430_000, 0.7)]
}

describe.sequential('上旋 Rust Node-API 数值等价', () => {
  test('合成输入的 direct/expanded loss 与 TypeScript 等价', () => {
    const segments = makeSyntheticSegments()
    const dto = buildNativeDto(segments)
    for (const theta of [180, 245.5, 319.2, 359]) {
      const directTs = evaluateDirect(segments, theta, 36)
      const directNative = evaluateDirectNative(
        dto.times,
        dto.values,
        dto.offsetDegrees,
        dto.segmentOffsets,
        dto.durations,
        dto.accelRatios,
        theta,
        36
      )
      expectClose(directNative, directTs)
      expectClose(
        invokeNativeExpanded(dto, theta, 36),
        evaluateExpanded(segments, theta, 36)
      )
    }
  })

  test('非法 TypedArray DTO 返回错误', () => {
    const segments = makeSyntheticSegments()
    const dto = buildNativeDto(segments)
    expect(() =>
      evaluateExpandedNative(
        dto.times.subarray(1),
        dto.values,
        dto.offsetDegrees,
        dto.segmentOffsets,
        dto.durations,
        dto.accelRatios,
        320,
        36
      )
    ).toThrow(/长度必须一致/)
    expect(() =>
      evaluateExpandedNative(
        dto.times,
        dto.values,
        dto.offsetDegrees,
        new Uint32Array([1, dto.times.length]),
        new Float64Array([420_000]),
        new Float64Array([0.1]),
        320,
        36
      )
    ).toThrow(/必须从 0 开始/)
  })

  for (const dataset of ['01', '02', '03', '04', '05'] as const) {
    test(`DS${dataset} loss 与搜索结果等价`, () => {
      const segments = normalizeTripSegments(loadTripSegments(dataset))
      const dto = buildNativeDto(segments)
      for (const theta of [240, 300, 320, 340]) {
        expectClose(
          invokeNativeExpanded(dto, theta, 36),
          evaluateExpanded(segments, theta, 36)
        )
      }

      const reference = searchBestExpandedReference(segments)
      const native = searchBestExpanded(
        dto.times,
        dto.values,
        dto.offsetDegrees,
        dto.segmentOffsets,
        dto.durations,
        dto.accelRatios,
        180,
        360,
        1,
        36
      )
      expect(native.theta).toBeCloseTo(reference.theta, 10)
      expectClose(native.loss, reference.loss)
      expect(native.evaluations).toBe(reference.evaluations)
      expect(native.sampleThetas).toEqual(reference.sampleThetas)
      expect(native.sampleLosses).toHaveLength(reference.sampleLosses.length)
      native.sampleLosses.forEach((loss, index) => {
        expectClose(loss, reference.sampleLosses[index])
      })
    })
  }
})
