import { describe, expect, test } from 'vitest'
import type { UpperRotationDetailedEstimate } from '../upperRotation.estimate'
import type { OfflineUpperRotationRefinementResult } from '../upperRotation.offlineRefinement'
import {
  aggregateUpperRotationShadowRecords,
  buildUpperRotationShadowRecord,
  type UpperRotationShadowRecord,
} from '../upperRotation.shadowStatistics'

const estimate = (
  angleDeg: number | null,
  elapsedMs: number,
  rejectReason: string | null = null
): UpperRotationDetailedEstimate => ({
  thetaMaxDeg: angleDeg,
  diagnostics: {
    status: angleDeg === null ? 'rejected' : 'success',
    strategyProfile: 'datasetTuned2026Q1',
    objectiveMode: 'auto',
    offsetMode: 'auto',
    objectiveUsed: angleDeg === null ? null : 'expanded',
    inputSegments: 4,
    completeSegments: 4,
    filteredSegments: 4,
    totalPoints: 1000,
    baseThetaDeg: angleDeg,
    finalThetaDeg: angleDeg,
    finalLoss: angleDeg === null ? null : 0.1,
    triggeredRules: [],
    rejectReason,
    elapsedMs,
  },
})

const candidate = (
  angleDeg: number | null,
  rejectStage: OfflineUpperRotationRefinementResult['rejectStage'] = null,
  rejectReason: string | null = null
): OfflineUpperRotationRefinementResult =>
  ({
    accepted: angleDeg !== null,
    finalAngleDeg: angleDeg,
    finalLoss: angleDeg === null ? null : 0.05,
    featureCandidate: {},
    expandedObjective: null,
    localRefinement: null,
    rejectStage,
    rejectReason,
  }) as OfflineUpperRotationRefinementResult

const build = (
  id: string,
  productionAngle: number | null,
  genericAngle: number | null,
  candidateAngle: number | null,
  candidateStage: OfflineUpperRotationRefinementResult['rejectStage'] = null,
  candidateReason: string | null = null
): UpperRotationShadowRecord => {
  const sequence = Number(id.split('-').at(-1))
  const result = buildUpperRotationShadowRecord(
    {
      windowId: id,
      observedAtMs: Number.isFinite(sequence) ? sequence * 1000 : 1000,
      machineId: `machine-${sequence % 2}`,
      recipeId: `recipe-${sequence % 3}`,
      rotationSpeedDegPerSecond: 0.5 + (sequence % 3) * 0.5,
      filmWidthMm: 900 + sequence * 50,
      conditionSource: 'measured',
    },
    {
      production: estimate(productionAngle, 20),
      shadow: estimate(genericAngle, 25),
      selectedThetaDeg: productionAngle,
      angleDeltaDeg: null,
      absoluteAngleDeltaDeg: null,
      elapsedDeltaMs: 5,
      comparable: productionAngle !== null && genericAngle !== null,
    },
    candidate(candidateAngle, candidateStage, candidateReason),
    10
  )
  expect(result.accepted).toBe(true)
  return result.record!
}

const continuousCoverageOptions = {
  requireCompleteContinuousConditions: true,
  rotationSpeedBinEdgesDegPerSecond: [0, 0.75, 1.25, 2],
  selectedAngleBinEdgesDeg: [280, 300, 320, 340],
  filmWidthBinEdgesMm: [800, 1000, 1200, 1400],
  minimumRecordsPerConditionBin: 2,
  minimumRecordsPerConditionCell: 2,
}

describe('三路径影子记录与批量统计', () => {
  test('生产选择始终保持不变并计算三组有符号差值', () => {
    const record = build('window-1', 300, 302, 301)

    expect(record.selectedSource).toBe('production')
    expect(record.selectedAngleDeg).toBe(300)
    expect(record.candidateMinusProductionDeg).toBe(1)
    expect(record.genericMinusProductionDeg).toBe(2)
    expect(record.candidateMinusGenericDeg).toBe(-1)
    expect(JSON.stringify(record)).not.toContain('objective')
  })

  test('路径拒绝时只记录诊断且不制造差值', () => {
    const record = build(
      'window-2',
      300,
      null,
      null,
      'localRefinement',
      'bestAtBoundary'
    )

    expect(record.selectedAngleDeg).toBe(300)
    expect(record.candidateMinusProductionDeg).toBeNull()
    expect(record.genericMinusProductionDeg).toBeNull()
    expect(record.candidate.rejectStage).toBe('localRefinement')
  })

  test('汇总接受率、绝对差分布、耗时和拒绝原因', () => {
    const records = [
      build('1', 300, 302, 301),
      build('2', 300, 304, 303),
      build('3', 300, null, null, 'localRefinement', 'bestAtBoundary'),
      build('4', 300, 301, null, 'featureCandidate', 'aggregationRejected'),
    ]
    const result = aggregateUpperRotationShadowRecords(records, {
      ...continuousCoverageOptions,
      minimumRecordCount: 4,
      minimumMachineCount: 2,
      minimumRecipeCount: 3,
      requireCompleteCoverageMetadata: true,
    })

    expect(result.accepted).toBe(true)
    expect(result.productionAcceptanceRate).toBe(1)
    expect(result.genericAcceptanceRate).toBe(0.75)
    expect(result.candidateAcceptanceRate).toBe(0.5)
    expect(result.candidateMinusProductionAbsoluteDeg).toEqual({
      count: 2,
      median: 2,
      p95: 3,
      maximum: 3,
    })
    expect(result.candidateRejectionCounts).toEqual({
      'localRefinement:bestAtBoundary': 1,
      'featureCandidate:aggregationRejected': 1,
    })
    expect(result.candidateElapsedMs.median).toBe(10)
    expect(result.observationSpanMs).toBe(3000)
    expect(result.distinctMachineCount).toBe(2)
    expect(result.distinctRecipeCount).toBe(3)
    expect(result.missingMachineIdCount).toBe(0)
    expect(result.rotationSpeedCoverage.binCounts).toEqual([1, 2, 1])
    expect(result.selectedAngleCoverage.binCounts).toEqual([0, 4, 0])
    expect(result.filmWidthCoverage.binCounts).toEqual([1, 3, 0])
    expect(result.recordsByConditionSource).toEqual({ measured: 4 })
    expect(
      result.rotationSpeedBinStatistics.map((bin) => ({
        count: bin.recordCount,
        candidateRate: bin.candidateAcceptanceRate,
      }))
    ).toEqual([
      { count: 1, candidateRate: 0 },
      { count: 2, candidateRate: 0.5 },
      { count: 1, candidateRate: 1 },
    ])
    expect(
      result.rotationSpeedBinStatistics[1].candidateMinusProductionAbsoluteDeg
    ).toEqual({ count: 1, median: 1, p95: 1, maximum: 1 })
    expect(
      result.rotationSpeedBinStatistics[1].candidateRejectionCounts
    ).toEqual({ 'featureCandidate:aggregationRejected': 1 })
    expect(result.selectedAngleBinStatistics[1].recordCount).toBe(4)
    expect(result.selectedAngleBinStatistics[1].candidateAcceptanceRate).toBe(
      0.5
    )
    expect(result.filmWidthBinStatistics[2]).toMatchObject({
      recordCount: 0,
      candidateAcceptanceRate: null,
      maximumInclusive: true,
      minimumRequiredRecordCount: 2,
      recordCountDeficit: 2,
      coverageStatus: 'empty',
    })
    expect(
      result.rotationSpeedBinStatistics.map((bin) => bin.coverageStatus)
    ).toEqual(['insufficient', 'sufficient', 'insufficient'])
    expect(result.conditionCoverageGaps).toHaveLength(6)
    expect(result.conditionCoverageGaps).toContainEqual({
      dimension: 'filmWidth',
      binIndex: 2,
      minimumInclusive: 1200,
      maximum: 1400,
      maximumInclusive: true,
      recordCount: 0,
      minimumRequiredRecordCount: 2,
      recordCountDeficit: 2,
      coverageStatus: 'empty',
    })
    expect(result.rotationSpeedBySelectedAngleMatrix).toMatchObject({
      rowDimension: 'rotationSpeed',
      columnDimension: 'selectedAngle',
      rowBinCount: 3,
      columnBinCount: 3,
    })
    expect(result.rotationSpeedBySelectedAngleMatrix.cells).toHaveLength(9)
    expect(
      result.rotationSpeedBySelectedAngleMatrix.cells.reduce(
        (total, cell) => total + cell.recordCount,
        0
      )
    ).toBe(4)
    expect(result.rotationSpeedBySelectedAngleMatrix.coverageGaps).toHaveLength(
      8
    )
    expect(result.coverageCollectionTargets).toHaveLength(14)
    expect(result.coverageCollectionTargets[0]).toMatchObject({
      priority: 1,
      targetKind: 'crossCell',
      rowBinIndex: 0,
      columnBinIndex: 0,
      coverageStatus: 'empty',
      additionalRecordsNeeded: 2,
    })
    expect(
      result.coverageCollectionTargets.map((target) => target.priority)
    ).toEqual(Array.from({ length: 14 }, (_, index) => index + 1))
    expect(result.coverageReadiness).toMatchObject({
      status: 'incomplete',
      coverageRequirementsSatisfied: false,
      targetCount: 14,
      emptyTargetCount: 9,
      insufficientTargetCount: 5,
      conditionBinTargetCount: 6,
      crossCellTargetCount: 8,
      highestPriorityTarget: result.coverageCollectionTargets[0],
    })
    expect(result.rotationSpeedBySelectedAngleMatrix.cells[4]).toMatchObject({
      rowBinIndex: 1,
      columnBinIndex: 1,
      recordCount: 2,
      recordCountDeficit: 0,
      coverageStatus: 'sufficient',
      candidateAcceptanceRate: 0.5,
      candidateRejectionCounts: {
        'featureCandidate:aggregationRejected': 1,
      },
    })
    expect(result.rotationSpeedBySelectedAngleMatrix.cells[0]).toMatchObject({
      rowBinIndex: 0,
      columnBinIndex: 0,
      recordCount: 0,
      recordCountDeficit: 2,
      coverageStatus: 'empty',
      candidateAcceptanceRate: null,
    })
    expect(result.rotationSpeedBySelectedAngleMatrix.cells[8]).toMatchObject({
      rowMaximumInclusive: true,
      columnMaximumInclusive: true,
    })
  })

  test('拒绝非法记录元数据、候选耗时和不一致候选结果', () => {
    const comparison = {
      production: estimate(300, 20),
      shadow: estimate(301, 25),
      selectedThetaDeg: 300,
      angleDeltaDeg: 1,
      absoluteAngleDeltaDeg: 1,
      elapsedDeltaMs: 5,
      comparable: true,
    }
    expect(
      buildUpperRotationShadowRecord(
        { windowId: '', observedAtMs: 1 },
        comparison,
        candidate(301),
        10
      ).rejectReason
    ).toBe('invalidMetadata')
    expect(
      buildUpperRotationShadowRecord(
        { windowId: 'x', observedAtMs: 1 },
        comparison,
        candidate(301),
        -1
      ).rejectReason
    ).toBe('invalidCandidateElapsedMs')
    expect(
      buildUpperRotationShadowRecord(
        { windowId: 'x', observedAtMs: 1 },
        comparison,
        { ...candidate(301), accepted: false },
        10
      ).rejectReason
    ).toBe('invalidCandidateResult')
  })

  test('批量统计要求显式且足够的最少记录数', () => {
    const records = [build('1', 300, 301, 300.5)]
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...continuousCoverageOptions,
        minimumRecordCount: 0,
        minimumMachineCount: 0,
        minimumRecipeCount: 0,
        requireCompleteCoverageMetadata: false,
      }).rejectReason
    ).toBe('invalidOptions')
    const insufficient = aggregateUpperRotationShadowRecords(records, {
      ...continuousCoverageOptions,
      minimumRecordCount: 2,
      minimumMachineCount: 0,
      minimumRecipeCount: 0,
      requireCompleteCoverageMetadata: false,
    })
    expect(insufficient.rejectReason).toBe('insufficientRecords')
    expect(insufficient.coverageReadiness).toEqual({
      status: 'notEvaluated',
      coverageRequirementsSatisfied: null,
      targetCount: null,
      emptyTargetCount: null,
      insufficientTargetCount: null,
      conditionBinTargetCount: null,
      crossCellTargetCount: null,
      highestPriorityTarget: null,
    })
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...continuousCoverageOptions,
        minimumRecordCount: 1,
        minimumMachineCount: 0,
        minimumRecipeCount: 0,
        requireCompleteCoverageMetadata: false,
      }).coverageReadiness.status
    ).toBe('incomplete')
  })

  test('拒绝重复窗口和非严格递增观测时间', () => {
    const first = build('1', 300, 301, 300.5)
    const second = build('2', 300, 301, 300.5)
    const batchOptions = {
      ...continuousCoverageOptions,
      minimumRecordCount: 2,
      minimumMachineCount: 0,
      minimumRecipeCount: 0,
      requireCompleteCoverageMetadata: false,
    }

    expect(
      aggregateUpperRotationShadowRecords(
        [first, { ...second, metadata: { ...second.metadata, windowId: '1' } }],
        batchOptions
      ).rejectReason
    ).toBe('duplicateWindowId')
    expect(
      aggregateUpperRotationShadowRecords(
        [
          first,
          { ...second, metadata: { ...second.metadata, observedAtMs: 1000 } },
        ],
        batchOptions
      ).rejectReason
    ).toBe('nonIncreasingObservationTime')
    expect(
      aggregateUpperRotationShadowRecords(
        [{ ...first, selectedAngleDeg: 999 }, second],
        batchOptions
      ).rejectReason
    ).toBe('invalidRecord')
  })

  test('按显式要求检查元数据完整性和工况覆盖', () => {
    const records = [build('1', 300, 301, 300.5), build('2', 300, 301, 300.5)]
    const missingMetadata = [
      records[0],
      {
        ...records[1],
        metadata: { ...records[1].metadata, machineId: undefined },
      },
    ]

    expect(
      aggregateUpperRotationShadowRecords(missingMetadata, {
        ...continuousCoverageOptions,
        minimumRecordCount: 2,
        minimumMachineCount: 1,
        minimumRecipeCount: 1,
        requireCompleteCoverageMetadata: true,
      }).rejectReason
    ).toBe('incompleteCoverageMetadata')
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...continuousCoverageOptions,
        minimumRecordCount: 2,
        minimumMachineCount: 3,
        minimumRecipeCount: 1,
        requireCompleteCoverageMetadata: true,
      }).rejectReason
    ).toBe('insufficientMachineCoverage')
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...continuousCoverageOptions,
        minimumRecordCount: 2,
        minimumMachineCount: 1,
        minimumRecipeCount: 3,
        requireCompleteCoverageMetadata: true,
      }).rejectReason
    ).toBe('insufficientRecipeCoverage')
  })

  test('连续工况缺失或超出显式分桶时可诊断或拒绝', () => {
    const first = build('1', 300, 301, 300.5)
    const second = build('2', 300, 301, 300.5)
    const incomplete = [
      first,
      {
        ...second,
        metadata: {
          ...second.metadata,
          rotationSpeedDegPerSecond: undefined,
          filmWidthMm: 1500,
          conditionSource: undefined,
        },
      },
    ]
    const required = aggregateUpperRotationShadowRecords(incomplete, {
      ...continuousCoverageOptions,
      minimumRecordCount: 2,
      minimumMachineCount: 1,
      minimumRecipeCount: 1,
      requireCompleteCoverageMetadata: true,
    })
    expect(required.rejectReason).toBe('incompleteContinuousConditions')
    expect(required.rotationSpeedCoverage.missingCount).toBe(1)
    expect(required.filmWidthCoverage.outOfRangeCount).toBe(1)
    expect(required.missingConditionSourceCount).toBe(1)

    const diagnosticOnly = aggregateUpperRotationShadowRecords(incomplete, {
      ...continuousCoverageOptions,
      minimumRecordCount: 2,
      minimumMachineCount: 1,
      minimumRecipeCount: 1,
      requireCompleteCoverageMetadata: true,
      requireCompleteContinuousConditions: false,
    })
    expect(diagnosticOnly.accepted).toBe(true)
    expect(diagnosticOnly.rotationSpeedCoverage.missingCount).toBe(1)
  })

  test('拒绝非严格递增或不足两个边界的连续分桶', () => {
    const records = [build('1', 300, 301, 300.5)]
    const baseOptions = {
      ...continuousCoverageOptions,
      minimumRecordCount: 1,
      minimumMachineCount: 0,
      minimumRecipeCount: 0,
      requireCompleteCoverageMetadata: false,
    }
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...baseOptions,
        selectedAngleBinEdgesDeg: [280],
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...baseOptions,
        filmWidthBinEdgesMm: [800, 1000, 1000],
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...baseOptions,
        minimumRecordsPerConditionBin: 0,
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      aggregateUpperRotationShadowRecords(records, {
        ...baseOptions,
        minimumRecordsPerConditionCell: 0,
      }).rejectReason
    ).toBe('invalidOptions')
  })
})
