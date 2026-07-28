import { describe, expect, test } from 'vitest'
import {
  refineFeatureAngleWithLocalObjective,
  type LocalObjectiveRefinementOptions,
} from '../upperRotation.localRefinement'

const options: LocalObjectiveRefinementOptions = {
  featureAngleDeg: 300,
  uncertaintyComponentsDeg: [3, 2],
  minimumRadiusDeg: 1,
  globalMinimumAngleDeg: 180,
  globalMaximumAngleDeg: 360,
  searchStepDeg: 0.5,
  maximumSearchPoints: 100,
  goldenRefinement: {
    angleToleranceDeg: 0.0001,
    maximumIterations: 50,
    minimumBoundaryDistanceDeg: 0.1,
  },
  maximumFeatureObjectiveShiftDeg: 3,
}

describe('离线通用局部精调管线', () => {
  test('串联窗口、扫描和黄金分割并输出双证据诊断', () => {
    const result = refineFeatureAngleWithLocalObjective(
      options,
      (angle) => (angle - 301.25) ** 2 + 4
    )

    expect(result.accepted).toBe(true)
    expect(result.refinedAngleDeg).toBeCloseTo(301.25, 3)
    expect(result.featureObjectiveShiftDeg).toBeCloseTo(1.25, 3)
    expect(result.finalLoss).toBeCloseTo(4, 7)
    expect(result.totalUncertaintyDeg).toBe(5)
    expect(result.evidenceSources).toEqual([
      'featureCandidate',
      'genericObjective',
    ])
    expect(result.window?.accepted).toBe(true)
    expect(result.scan?.accepted).toBe(true)
    expect(result.refinement?.accepted).toBe(true)
  })

  test('动态窗口失败时停止后续阶段', () => {
    const result = refineFeatureAngleWithLocalObjective(
      { ...options, maximumSearchPoints: 2 },
      () => 0
    )

    expect(result.rejectStage).toBe('window')
    expect(result.rejectReason).toBe('searchBudgetExceeded')
    expect(result.scan).toBeNull()
    expect(result.refinement).toBeNull()
  })

  test('离散扫描边界最优时停止黄金分割', () => {
    const result = refineFeatureAngleWithLocalObjective(
      options,
      (angle) => angle
    )

    expect(result.rejectStage).toBe('scan')
    expect(result.rejectReason).toBe('bestAtBoundary')
    expect(result.scan?.bestAtBoundary).toBe(true)
    expect(result.refinement).toBeNull()
  })

  test('黄金分割配置无效时传播细化拒绝', () => {
    const result = refineFeatureAngleWithLocalObjective(
      {
        ...options,
        goldenRefinement: {
          ...options.goldenRefinement,
          angleToleranceDeg: 0,
        },
      },
      (angle) => (angle - 301) ** 2
    )

    expect(result.rejectStage).toBe('refinement')
    expect(result.rejectReason).toBe('invalidOptions')
  })

  test('特征角度与目标函数结果偏移超限时双方都不被选择', () => {
    const result = refineFeatureAngleWithLocalObjective(
      { ...options, maximumFeatureObjectiveShiftDeg: 2 },
      (angle) => (angle - 304) ** 2
    )

    expect(result.accepted).toBe(false)
    expect(result.refinedAngleDeg).toBeCloseTo(304, 3)
    expect(result.featureObjectiveShiftDeg).toBeCloseTo(4, 3)
    expect(result.rejectStage).toBe('consistency')
    expect(result.rejectReason).toBe('featureObjectiveConflict')
  })

  test('拒绝非法的特征/目标偏移上限', () => {
    const result = refineFeatureAngleWithLocalObjective(
      { ...options, maximumFeatureObjectiveShiftDeg: -1 },
      () => 0
    )

    expect(result.rejectStage).toBe('configuration')
    expect(result.window).toBeNull()
    expect(result.rejectReason).toBe('invalidFeatureObjectiveShiftLimit')
  })
})
