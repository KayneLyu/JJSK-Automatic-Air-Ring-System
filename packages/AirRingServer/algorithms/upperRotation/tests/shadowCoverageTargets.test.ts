import { describe, expect, test } from 'vitest'
import type {
  ShadowConditionCoverageGap,
  ShadowConditionCrossCoverageGap,
} from '../upperRotation.shadowConditionStatistics'
import {
  buildShadowCoverageCollectionTargets,
  buildShadowCoverageReadinessSummary,
  createUnevaluatedShadowCoverageReadinessSummary,
} from '../upperRotation.shadowCoverageTargets'

const conditionGap = (
  dimension: ShadowConditionCoverageGap['dimension'],
  binIndex: number,
  coverageStatus: ShadowConditionCoverageGap['coverageStatus'],
  recordCountDeficit: number
): ShadowConditionCoverageGap => ({
  dimension,
  binIndex,
  minimumInclusive: binIndex * 10,
  maximum: (binIndex + 1) * 10,
  maximumInclusive: false,
  recordCount: coverageStatus === 'empty' ? 0 : 1,
  minimumRequiredRecordCount:
    (coverageStatus === 'empty' ? 0 : 1) + recordCountDeficit,
  recordCountDeficit,
  coverageStatus,
})

const crossCellGap = (
  rowBinIndex: number,
  columnBinIndex: number,
  coverageStatus: ShadowConditionCrossCoverageGap['coverageStatus'],
  recordCountDeficit: number
): ShadowConditionCrossCoverageGap => ({
  rowBinIndex,
  columnBinIndex,
  rowMinimumInclusive: rowBinIndex,
  rowMaximum: rowBinIndex + 1,
  rowMaximumInclusive: false,
  columnMinimumInclusive: 280 + columnBinIndex * 20,
  columnMaximum: 300 + columnBinIndex * 20,
  columnMaximumInclusive: false,
  recordCount: coverageStatus === 'empty' ? 0 : 1,
  minimumRequiredRecordCount:
    (coverageStatus === 'empty' ? 0 : 1) + recordCountDeficit,
  recordCountDeficit,
  coverageStatus,
})

const targetKey = (
  target: ReturnType<typeof buildShadowCoverageCollectionTargets>[number]
) =>
  target.targetKind === 'crossCell'
    ? `cross:${target.rowBinIndex}:${target.columnBinIndex}`
    : `bin:${target.dimension}:${target.binIndex}`

describe('影子覆盖补采优先级', () => {
  test('按空覆盖、缺口、目标粒度和索引生成稳定顺序', () => {
    const conditionGaps = [
      conditionGap('filmWidth', 2, 'insufficient', 3),
      conditionGap('rotationSpeed', 1, 'empty', 2),
      conditionGap('selectedAngle', 0, 'empty', 4),
    ]
    const crossCellGaps = [
      crossCellGap(1, 1, 'insufficient', 5),
      crossCellGap(1, 0, 'empty', 4),
      crossCellGap(0, 1, 'empty', 4),
    ]

    const targets = buildShadowCoverageCollectionTargets(
      conditionGaps,
      crossCellGaps
    )
    const reversedTargets = buildShadowCoverageCollectionTargets(
      [...conditionGaps].reverse(),
      [...crossCellGaps].reverse()
    )

    expect(targets.map(targetKey)).toEqual([
      'cross:0:1',
      'cross:1:0',
      'bin:selectedAngle:0',
      'bin:rotationSpeed:1',
      'cross:1:1',
      'bin:filmWidth:2',
    ])
    expect(reversedTargets).toEqual(targets)
    expect(targets.map((target) => target.priority)).toEqual([1, 2, 3, 4, 5, 6])
    expect(targets[0]).toMatchObject({
      priorityReason: 'emptyCoverage',
      additionalRecordsNeeded: 4,
    })
    expect(targets[4]).toMatchObject({
      priorityReason: 'recordCountDeficit',
      additionalRecordsNeeded: 5,
    })
    expect(buildShadowCoverageReadinessSummary(targets)).toEqual({
      status: 'incomplete',
      coverageRequirementsSatisfied: false,
      targetCount: 6,
      emptyTargetCount: 4,
      insufficientTargetCount: 2,
      conditionBinTargetCount: 3,
      crossCellTargetCount: 3,
      highestPriorityTarget: targets[0],
    })
  })

  test('区分未评估和已满足覆盖要求', () => {
    expect(buildShadowCoverageCollectionTargets([], [])).toEqual([])
    expect(buildShadowCoverageReadinessSummary([])).toEqual({
      status: 'satisfied',
      coverageRequirementsSatisfied: true,
      targetCount: 0,
      emptyTargetCount: 0,
      insufficientTargetCount: 0,
      conditionBinTargetCount: 0,
      crossCellTargetCount: 0,
      highestPriorityTarget: null,
    })
    expect(createUnevaluatedShadowCoverageReadinessSummary()).toEqual({
      status: 'notEvaluated',
      coverageRequirementsSatisfied: null,
      targetCount: null,
      emptyTargetCount: null,
      insufficientTargetCount: null,
      conditionBinTargetCount: null,
      crossCellTargetCount: null,
      highestPriorityTarget: null,
    })
  })
})
