import { describe, expect, test } from 'vitest'
import { refineLocalObjectiveWithGoldenSection } from '../upperRotation.goldenRefinement'
import { buildDynamicLocalSearchWindow } from '../upperRotation.localSearchWindow'
import { scanLocalObjective } from '../upperRotation.localObjectiveScan'

const buildWindow = () =>
  buildDynamicLocalSearchWindow({
    featureAngleDeg: 300,
    uncertaintyComponentsDeg: [5],
    minimumRadiusDeg: 1,
    globalMinimumAngleDeg: 180,
    globalMaximumAngleDeg: 360,
    searchStepDeg: 1,
    maximumSearchPoints: 100,
  })

const options = {
  angleToleranceDeg: 0.0001,
  maximumIterations: 50,
  minimumBoundaryDistanceDeg: 0.1,
}

describe('有界黄金分割细化', () => {
  test('将随机凸目标从离散最优细化到连续极小值', () => {
    let state = 0x8f39a2b1
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 0x1_0000_0000
    }
    for (let scenario = 0; scenario < 32; scenario++) {
      const expected = 296 + random() * 8
      const objective = (angle: number) => (angle - expected) ** 2 + 2
      const window = buildWindow()
      const scan = scanLocalObjective(window, objective)
      const result = refineLocalObjectiveWithGoldenSection(
        window,
        scan,
        objective,
        options
      )

      expect(result.accepted).toBe(true)
      expect(result.refinedAngleDeg).toBeCloseTo(expected, 3)
      expect(result.refinedLoss).toBeCloseTo(2, 7)
      expect(result.finalBracketSpanDeg as number).toBeLessThanOrEqual(
        options.angleToleranceDeg
      )
    }
  })

  test('离散最优缺少任一侧有限支撑点时拒绝', () => {
    const window = buildWindow()
    const scan = scanLocalObjective(window, (angle) =>
      angle <= 300 ? Number.NaN : (angle - 301) ** 2
    )
    const result = refineLocalObjectiveWithGoldenSection(
      window,
      scan,
      (angle) => (angle - 301) ** 2,
      options
    )

    expect(scan.accepted).toBe(true)
    expect(result.rejectReason).toBe('missingFiniteBracket')
  })

  test('细化期间目标函数无效时拒绝', () => {
    const window = buildWindow()
    const objective = (angle: number) => (angle - 301.2) ** 2
    const scan = scanLocalObjective(window, objective)
    const result = refineLocalObjectiveWithGoldenSection(
      window,
      scan,
      () => Number.NaN,
      options
    )

    expect(result.rejectReason).toBe('invalidObjective')
  })

  test('迭代预算不足时拒绝并保留最终括区间', () => {
    const window = buildWindow()
    const objective = (angle: number) => (angle - 301.2) ** 2
    const scan = scanLocalObjective(window, objective)
    const result = refineLocalObjectiveWithGoldenSection(
      window,
      scan,
      objective,
      { ...options, maximumIterations: 1, angleToleranceDeg: 1e-12 }
    )

    expect(result.accepted).toBe(false)
    expect(result.finalBracketSpanDeg).toBeGreaterThan(1e-12)
    expect(result.rejectReason).toBe('iterationBudgetExceeded')
  })

  test('显式边界保护距离覆盖细化结果时拒绝', () => {
    const window = buildWindow()
    const objective = (angle: number) => (angle - 296.2) ** 2
    const scan = scanLocalObjective(window, objective)
    const result = refineLocalObjectiveWithGoldenSection(
      window,
      scan,
      objective,
      { ...options, minimumBoundaryDistanceDeg: 2 }
    )

    expect(result.distanceToWindowBoundaryDeg).toBeCloseTo(1.2, 3)
    expect(result.rejectReason).toBe('refinedAtBoundary')
  })

  test('拒绝未接受扫描和非法细化配置', () => {
    const window = buildWindow()
    const boundaryScan = scanLocalObjective(window, (angle) => angle)
    expect(
      refineLocalObjectiveWithGoldenSection(
        window,
        boundaryScan,
        (angle) => angle,
        options
      ).rejectReason
    ).toBe('invalidScan')
    const validScan = scanLocalObjective(window, (angle) => (angle - 301) ** 2)
    expect(
      refineLocalObjectiveWithGoldenSection(
        window,
        validScan,
        (angle) => (angle - 301) ** 2,
        { ...options, angleToleranceDeg: 0 }
      ).rejectReason
    ).toBe('invalidOptions')
  })
})
