import { describe, expect, test } from 'vitest'
import { evaluateExpanded } from '../upperRotation.evaluation'
import { createExpandedObjective } from '../upperRotation.expandedObjective'
import { refineFeatureAngleWithLocalObjective } from '../upperRotation.localRefinement'

const makeSegments = () => [
  {
    duration: 100,
    accelRatio: 0.1,
    data: Array.from({ length: 201 }, (_, index) => ({
      t: index / 2,
      y: index % 31 === 0 ? NaN : Math.sin(index / 7) * 5 + index / 20,
      offsetDeg: (index % 11) - 5,
    })),
  },
]

const makeOptions = () => ({
  segments: makeSegments(),
  numberOfBins: 12,
  minimumValidSegmentCount: 1,
  minimumFinitePointCount: 100,
})

describe('evaluateExpanded 只读目标适配器', () => {
  test('目标值与直接调用一致且不修改输入', () => {
    const options = makeOptions()
    const before = structuredClone(options.segments)
    const result = createExpandedObjective(options)

    expect(result.accepted).toBe(true)
    expect(result.finitePointCount).toBe(194)
    expect(result.missingThicknessPointCount).toBe(7)
    for (const angle of [280, 300, 320]) {
      expect(result.objective?.(angle)).toBe(
        evaluateExpanded(options.segments, angle, options.numberOfBins)
      )
    }
    expect(options.segments).toEqual(before)
    expect(result.objective?.(NaN)).toBe(Infinity)
  })

  test('拒绝非法行程物理参数', () => {
    const result = createExpandedObjective({
      ...makeOptions(),
      segments: [{ ...makeSegments()[0], accelRatio: 0.5 }],
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('invalidSegment')
  })

  test('拒绝非法点且报告数量', () => {
    const segment = makeSegments()[0]
    const result = createExpandedObjective({
      ...makeOptions(),
      segments: [
        {
          ...segment,
          data: [...segment.data, { t: 101, y: 1, offsetDeg: 0 }],
        },
      ],
    })

    expect(result.accepted).toBe(false)
    expect(result.invalidPointCount).toBe(1)
    expect(result.rejectReason).toBe('invalidPoint')
  })

  test('拒绝非法配置和有限厚度证据不足', () => {
    expect(
      createExpandedObjective({ ...makeOptions(), numberOfBins: 1 })
        .rejectReason
    ).toBe('invalidOptions')
    expect(
      createExpandedObjective({
        ...makeOptions(),
        minimumFinitePointCount: 195,
      }).rejectReason
    ).toBe('insufficientFinitePoints')
  })

  test('适配后的目标回调可直接供局部精调管线消费', () => {
    const adapter = createExpandedObjective(makeOptions())
    expect(adapter.objective).not.toBeNull()

    const result = refineFeatureAngleWithLocalObjective(
      {
        featureAngleDeg: 300,
        uncertaintyComponentsDeg: [10],
        minimumRadiusDeg: 5,
        globalMinimumAngleDeg: 180,
        globalMaximumAngleDeg: 360,
        searchStepDeg: 1,
        maximumSearchPoints: 30,
        goldenRefinement: {
          angleToleranceDeg: 0.01,
          maximumIterations: 30,
          minimumBoundaryDistanceDeg: 0.1,
        },
        maximumFeatureObjectiveShiftDeg: 10,
      },
      adapter.objective!
    )

    expect(result.window).not.toBeNull()
    expect(result.scan).not.toBeNull()
    expect(result.rejectReason).not.toBe('noFiniteObjective')
  })
})
