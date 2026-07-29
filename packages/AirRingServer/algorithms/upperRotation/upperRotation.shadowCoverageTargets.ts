import type {
  ShadowConditionCoverageGap,
  ShadowConditionCrossCoverageGap,
} from './upperRotation.shadowConditionStatistics'

type ShadowCoverageCollectionTargetBase = {
  priority: number
  coverageStatus: 'empty' | 'insufficient'
  recordCount: number
  minimumRequiredRecordCount: number
  additionalRecordsNeeded: number
  priorityReason: 'emptyCoverage' | 'recordCountDeficit'
}

export type ShadowConditionBinCollectionTarget =
  ShadowCoverageCollectionTargetBase & {
    targetKind: 'conditionBin'
    dimension: ShadowConditionCoverageGap['dimension']
    binIndex: number
    minimumInclusive: number
    maximum: number
    maximumInclusive: boolean
  }

export type ShadowConditionCrossCellCollectionTarget =
  ShadowCoverageCollectionTargetBase & {
    targetKind: 'crossCell'
    rowDimension: 'rotationSpeed'
    columnDimension: 'selectedAngle'
    rowBinIndex: number
    columnBinIndex: number
    rowMinimumInclusive: number
    rowMaximum: number
    rowMaximumInclusive: boolean
    columnMinimumInclusive: number
    columnMaximum: number
    columnMaximumInclusive: boolean
  }

export type ShadowCoverageCollectionTarget =
  | ShadowConditionBinCollectionTarget
  | ShadowConditionCrossCellCollectionTarget

export type ShadowCoverageReadinessSummary = {
  status: 'notEvaluated' | 'incomplete' | 'satisfied'
  coverageRequirementsSatisfied: boolean | null
  targetCount: number | null
  emptyTargetCount: number | null
  insufficientTargetCount: number | null
  conditionBinTargetCount: number | null
  crossCellTargetCount: number | null
  highestPriorityTarget: ShadowCoverageCollectionTarget | null
}

const DIMENSION_ORDER: Readonly<
  Record<ShadowConditionCoverageGap['dimension'], number>
> = {
  rotationSpeed: 0,
  selectedAngle: 1,
  filmWidth: 2,
}

const compareTargets = (
  left: ShadowCoverageCollectionTarget,
  right: ShadowCoverageCollectionTarget
): number => {
  if (left.coverageStatus !== right.coverageStatus) {
    return left.coverageStatus === 'empty' ? -1 : 1
  }
  if (left.additionalRecordsNeeded !== right.additionalRecordsNeeded) {
    return right.additionalRecordsNeeded - left.additionalRecordsNeeded
  }
  if (left.targetKind !== right.targetKind) {
    return left.targetKind === 'crossCell' ? -1 : 1
  }
  if (left.targetKind === 'crossCell' && right.targetKind === 'crossCell') {
    return (
      left.rowBinIndex - right.rowBinIndex ||
      left.columnBinIndex - right.columnBinIndex
    )
  }
  if (
    left.targetKind === 'conditionBin' &&
    right.targetKind === 'conditionBin'
  ) {
    return (
      DIMENSION_ORDER[left.dimension] - DIMENSION_ORDER[right.dimension] ||
      left.binIndex - right.binIndex
    )
  }
  return 0
}

/**
 * 把一维与二维覆盖缺口转换为确定性补采顺序。
 * 目标可能重叠，因此调用方不得对 additionalRecordsNeeded 求和。
 */
export const buildShadowCoverageCollectionTargets = (
  conditionGaps: readonly ShadowConditionCoverageGap[],
  crossCellGaps: readonly ShadowConditionCrossCoverageGap[]
): ShadowCoverageCollectionTarget[] => {
  const targets: ShadowCoverageCollectionTarget[] = [
    ...conditionGaps.map((gap) => ({
      priority: 0,
      targetKind: 'conditionBin' as const,
      dimension: gap.dimension,
      binIndex: gap.binIndex,
      minimumInclusive: gap.minimumInclusive,
      maximum: gap.maximum,
      maximumInclusive: gap.maximumInclusive,
      coverageStatus: gap.coverageStatus,
      recordCount: gap.recordCount,
      minimumRequiredRecordCount: gap.minimumRequiredRecordCount,
      additionalRecordsNeeded: gap.recordCountDeficit,
      priorityReason:
        gap.coverageStatus === 'empty'
          ? ('emptyCoverage' as const)
          : ('recordCountDeficit' as const),
    })),
    ...crossCellGaps.map((gap) => ({
      priority: 0,
      targetKind: 'crossCell' as const,
      rowDimension: 'rotationSpeed' as const,
      columnDimension: 'selectedAngle' as const,
      rowBinIndex: gap.rowBinIndex,
      columnBinIndex: gap.columnBinIndex,
      rowMinimumInclusive: gap.rowMinimumInclusive,
      rowMaximum: gap.rowMaximum,
      rowMaximumInclusive: gap.rowMaximumInclusive,
      columnMinimumInclusive: gap.columnMinimumInclusive,
      columnMaximum: gap.columnMaximum,
      columnMaximumInclusive: gap.columnMaximumInclusive,
      coverageStatus: gap.coverageStatus,
      recordCount: gap.recordCount,
      minimumRequiredRecordCount: gap.minimumRequiredRecordCount,
      additionalRecordsNeeded: gap.recordCountDeficit,
      priorityReason:
        gap.coverageStatus === 'empty'
          ? ('emptyCoverage' as const)
          : ('recordCountDeficit' as const),
    })),
  ]
  return targets
    .sort(compareTargets)
    .map((target, index) => ({ ...target, priority: index + 1 }))
}

export const createUnevaluatedShadowCoverageReadinessSummary =
  (): ShadowCoverageReadinessSummary => ({
    status: 'notEvaluated',
    coverageRequirementsSatisfied: null,
    targetCount: null,
    emptyTargetCount: null,
    insufficientTargetCount: null,
    conditionBinTargetCount: null,
    crossCellTargetCount: null,
    highestPriorityTarget: null,
  })

/** 只汇总显式分桶样本阈值，不表示算法准确度或生产切换资格。 */
export const buildShadowCoverageReadinessSummary = (
  targets: readonly ShadowCoverageCollectionTarget[]
): ShadowCoverageReadinessSummary => {
  const targetCount = targets.length
  const coverageRequirementsSatisfied = targetCount === 0
  return {
    status: coverageRequirementsSatisfied ? 'satisfied' : 'incomplete',
    coverageRequirementsSatisfied,
    targetCount,
    emptyTargetCount: targets.filter(
      (target) => target.coverageStatus === 'empty'
    ).length,
    insufficientTargetCount: targets.filter(
      (target) => target.coverageStatus === 'insufficient'
    ).length,
    conditionBinTargetCount: targets.filter(
      (target) => target.targetKind === 'conditionBin'
    ).length,
    crossCellTargetCount: targets.filter(
      (target) => target.targetKind === 'crossCell'
    ).length,
    highestPriorityTarget: targets[0] ?? null,
  }
}
