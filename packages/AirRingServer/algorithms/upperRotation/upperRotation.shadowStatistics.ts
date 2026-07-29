import type { OfflineUpperRotationRefinementResult } from './upperRotation.offlineRefinement'
import type { UpperRotationStrategyComparison } from './upperRotation.estimate'
import {
  buildShadowConditionBinStatistics,
  buildRotationSpeedBySelectedAngleMatrix,
  collectShadowConditionCoverageGaps,
  type ShadowConditionBinStatistics,
  type ShadowConditionCrossMatrix,
  type ShadowConditionCoverageGap,
} from './upperRotation.shadowConditionStatistics'
import {
  buildShadowCoverageCollectionTargets,
  buildShadowCoverageReadinessSummary,
  createUnevaluatedShadowCoverageReadinessSummary,
  type ShadowCoverageCollectionTarget,
  type ShadowCoverageReadinessSummary,
} from './upperRotation.shadowCoverageTargets'

export type UpperRotationShadowRecordMetadata = {
  windowId: string
  observedAtMs: number
  machineId?: string
  recipeId?: string
  rotationSpeedDegPerSecond?: number
  filmWidthMm?: number
  conditionSource?: 'deviceConfiguration' | 'measured' | 'simulation'
}

export type UpperRotationShadowPathSnapshot = {
  accepted: boolean
  angleDeg: number | null
  elapsedMs: number
  rejectStage: string | null
  rejectReason: string | null
}

export type UpperRotationShadowRecord = {
  metadata: UpperRotationShadowRecordMetadata
  production: UpperRotationShadowPathSnapshot
  generic: UpperRotationShadowPathSnapshot
  candidate: UpperRotationShadowPathSnapshot
  selectedSource: 'production'
  selectedAngleDeg: number | null
  candidateMinusProductionDeg: number | null
  genericMinusProductionDeg: number | null
  candidateMinusGenericDeg: number | null
}

export type BuildUpperRotationShadowRecordResult = {
  accepted: boolean
  record: UpperRotationShadowRecord | null
  rejectReason:
    | 'invalidMetadata'
    | 'invalidStrategyComparison'
    | 'invalidCandidateResult'
    | 'invalidCandidateElapsedMs'
    | null
}

export type ShadowDistributionSummary = {
  count: number
  median: number | null
  p95: number | null
  maximum: number | null
}

export type UpperRotationShadowBatchOptions = {
  minimumRecordCount: number
  minimumMachineCount: number
  minimumRecipeCount: number
  requireCompleteCoverageMetadata: boolean
  requireCompleteContinuousConditions: boolean
  rotationSpeedBinEdgesDegPerSecond: readonly number[]
  selectedAngleBinEdgesDeg: readonly number[]
  filmWidthBinEdgesMm: readonly number[]
  minimumRecordsPerConditionBin: number
  minimumRecordsPerConditionCell: number
}

export type ShadowNumericCoverage = {
  binEdges: readonly number[]
  binCounts: readonly number[]
  missingCount: number
  outOfRangeCount: number
}

export type UpperRotationShadowBatchStatistics = {
  accepted: boolean
  inputRecordCount: number
  productionAcceptedCount: number
  genericAcceptedCount: number
  candidateAcceptedCount: number
  productionAcceptanceRate: number | null
  genericAcceptanceRate: number | null
  candidateAcceptanceRate: number | null
  candidateMinusProductionAbsoluteDeg: ShadowDistributionSummary
  genericMinusProductionAbsoluteDeg: ShadowDistributionSummary
  candidateMinusGenericAbsoluteDeg: ShadowDistributionSummary
  productionElapsedMs: ShadowDistributionSummary
  genericElapsedMs: ShadowDistributionSummary
  candidateElapsedMs: ShadowDistributionSummary
  candidateRejectionCounts: Readonly<Record<string, number>>
  firstObservedAtMs: number | null
  lastObservedAtMs: number | null
  observationSpanMs: number | null
  distinctMachineCount: number
  distinctRecipeCount: number
  missingMachineIdCount: number
  missingRecipeIdCount: number
  recordsByMachine: Readonly<Record<string, number>>
  recordsByRecipe: Readonly<Record<string, number>>
  rotationSpeedCoverage: ShadowNumericCoverage
  selectedAngleCoverage: ShadowNumericCoverage
  filmWidthCoverage: ShadowNumericCoverage
  recordsByConditionSource: Readonly<Record<string, number>>
  missingConditionSourceCount: number
  rotationSpeedBinStatistics: readonly ShadowConditionBinStatistics[]
  selectedAngleBinStatistics: readonly ShadowConditionBinStatistics[]
  filmWidthBinStatistics: readonly ShadowConditionBinStatistics[]
  conditionCoverageGaps: readonly ShadowConditionCoverageGap[]
  rotationSpeedBySelectedAngleMatrix: ShadowConditionCrossMatrix
  coverageCollectionTargets: readonly ShadowCoverageCollectionTarget[]
  coverageReadiness: ShadowCoverageReadinessSummary
  rejectReason:
    | 'invalidOptions'
    | 'insufficientRecords'
    | 'invalidRecord'
    | 'duplicateWindowId'
    | 'nonIncreasingObservationTime'
    | 'incompleteCoverageMetadata'
    | 'insufficientMachineCoverage'
    | 'insufficientRecipeCoverage'
    | 'incompleteContinuousConditions'
    | null
}

const validOptionalId = (value: string | undefined): boolean =>
  value === undefined || value.trim().length > 0

const validOptionalPositive = (value: number | undefined): boolean =>
  value === undefined || (Number.isFinite(value) && value > 0)

const validConditionSource = (
  value: UpperRotationShadowRecordMetadata['conditionSource']
): boolean =>
  value === undefined ||
  value === 'deviceConfiguration' ||
  value === 'measured' ||
  value === 'simulation'

const delta = (
  left: UpperRotationShadowPathSnapshot,
  right: UpperRotationShadowPathSnapshot
): number | null =>
  left.accepted &&
  right.accepted &&
  left.angleDeg !== null &&
  right.angleDeg !== null
    ? left.angleDeg - right.angleDeg
    : null

/** 构建单窗口可序列化影子记录；生产选择永远不由影子结果覆盖。 */
export const buildUpperRotationShadowRecord = (
  metadata: UpperRotationShadowRecordMetadata,
  comparison: UpperRotationStrategyComparison,
  candidateResult: OfflineUpperRotationRefinementResult,
  candidateElapsedMs: number
): BuildUpperRotationShadowRecordResult => {
  if (
    metadata.windowId.trim().length === 0 ||
    !Number.isFinite(metadata.observedAtMs) ||
    !validOptionalId(metadata.machineId) ||
    !validOptionalId(metadata.recipeId) ||
    !validOptionalPositive(metadata.rotationSpeedDegPerSecond) ||
    !validOptionalPositive(metadata.filmWidthMm) ||
    !validConditionSource(metadata.conditionSource)
  ) {
    return { accepted: false, record: null, rejectReason: 'invalidMetadata' }
  }
  if (!Number.isFinite(candidateElapsedMs) || candidateElapsedMs < 0) {
    return {
      accepted: false,
      record: null,
      rejectReason: 'invalidCandidateElapsedMs',
    }
  }
  const validDetailedEstimate = (
    estimate: UpperRotationStrategyComparison['production']
  ): boolean =>
    Number.isFinite(estimate.diagnostics.elapsedMs) &&
    estimate.diagnostics.elapsedMs >= 0 &&
    (estimate.thetaMaxDeg === null || Number.isFinite(estimate.thetaMaxDeg))
  if (
    !validDetailedEstimate(comparison.production) ||
    !validDetailedEstimate(comparison.shadow)
  ) {
    return {
      accepted: false,
      record: null,
      rejectReason: 'invalidStrategyComparison',
    }
  }
  if (
    (candidateResult.accepted &&
      (candidateResult.finalAngleDeg === null ||
        !Number.isFinite(candidateResult.finalAngleDeg))) ||
    (!candidateResult.accepted && candidateResult.finalAngleDeg !== null)
  ) {
    return {
      accepted: false,
      record: null,
      rejectReason: 'invalidCandidateResult',
    }
  }

  const production: UpperRotationShadowPathSnapshot = {
    accepted: comparison.production.thetaMaxDeg !== null,
    angleDeg: comparison.production.thetaMaxDeg,
    elapsedMs: comparison.production.diagnostics.elapsedMs,
    rejectStage: null,
    rejectReason: comparison.production.diagnostics.rejectReason,
  }
  const generic: UpperRotationShadowPathSnapshot = {
    accepted: comparison.shadow.thetaMaxDeg !== null,
    angleDeg: comparison.shadow.thetaMaxDeg,
    elapsedMs: comparison.shadow.diagnostics.elapsedMs,
    rejectStage: null,
    rejectReason: comparison.shadow.diagnostics.rejectReason,
  }
  const candidate: UpperRotationShadowPathSnapshot = {
    accepted: candidateResult.accepted,
    angleDeg: candidateResult.finalAngleDeg,
    elapsedMs: candidateElapsedMs,
    rejectStage: candidateResult.rejectStage,
    rejectReason: candidateResult.rejectReason,
  }
  return {
    accepted: true,
    record: {
      metadata: { ...metadata },
      production,
      generic,
      candidate,
      selectedSource: 'production',
      selectedAngleDeg: production.angleDeg,
      candidateMinusProductionDeg: delta(candidate, production),
      genericMinusProductionDeg: delta(generic, production),
      candidateMinusGenericDeg: delta(candidate, generic),
    },
    rejectReason: null,
  }
}

const summarize = (values: readonly number[]): ShadowDistributionSummary => {
  if (values.length === 0) {
    return { count: 0, median: null, p95: null, maximum: null }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle]
  return {
    count: sorted.length,
    median,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maximum: sorted[sorted.length - 1],
  }
}

const validBinEdges = (edges: readonly number[]): boolean =>
  edges.length >= 2 &&
  edges.every(
    (edge, index) =>
      Number.isFinite(edge) && (index === 0 || edge > edges[index - 1])
  )

const buildNumericCoverage = (
  values: readonly (number | null | undefined)[],
  edges: readonly number[]
): ShadowNumericCoverage => {
  const binCounts = Array.from({ length: edges.length - 1 }, () => 0)
  let missingCount = 0
  let outOfRangeCount = 0
  for (const value of values) {
    if (value === null || value === undefined) {
      missingCount++
      continue
    }
    if (value < edges[0] || value > edges[edges.length - 1]) {
      outOfRangeCount++
      continue
    }
    const binIndex =
      value === edges[edges.length - 1]
        ? edges.length - 2
        : edges.findIndex(
            (edge, index) =>
              index < edges.length - 1 &&
              value >= edge &&
              value < edges[index + 1]
          )
    if (binIndex < 0) outOfRangeCount++
    else binCounts[binIndex]++
  }
  return { binEdges: [...edges], binCounts, missingCount, outOfRangeCount }
}

/** 汇总无标签影子证据；路径间接近只表示一致性，不表示准确度。 */
export const aggregateUpperRotationShadowRecords = (
  records: readonly UpperRotationShadowRecord[],
  options: UpperRotationShadowBatchOptions
): UpperRotationShadowBatchStatistics => {
  const empty = summarize([])
  const emptyCoverage = (
    edges: readonly number[] = []
  ): ShadowNumericCoverage => ({
    binEdges: [...edges],
    binCounts: edges.length >= 2 ? Array(edges.length - 1).fill(0) : [],
    missingCount: 0,
    outOfRangeCount: 0,
  })
  const base = {
    inputRecordCount: records.length,
    productionAcceptedCount: 0,
    genericAcceptedCount: 0,
    candidateAcceptedCount: 0,
    productionAcceptanceRate: null,
    genericAcceptanceRate: null,
    candidateAcceptanceRate: null,
    candidateMinusProductionAbsoluteDeg: empty,
    genericMinusProductionAbsoluteDeg: empty,
    candidateMinusGenericAbsoluteDeg: empty,
    productionElapsedMs: empty,
    genericElapsedMs: empty,
    candidateElapsedMs: empty,
    candidateRejectionCounts: {},
    firstObservedAtMs: null,
    lastObservedAtMs: null,
    observationSpanMs: null,
    distinctMachineCount: 0,
    distinctRecipeCount: 0,
    missingMachineIdCount: 0,
    missingRecipeIdCount: 0,
    recordsByMachine: {},
    recordsByRecipe: {},
    rotationSpeedCoverage: emptyCoverage(
      options.rotationSpeedBinEdgesDegPerSecond
    ),
    selectedAngleCoverage: emptyCoverage(options.selectedAngleBinEdgesDeg),
    filmWidthCoverage: emptyCoverage(options.filmWidthBinEdgesMm),
    recordsByConditionSource: {},
    missingConditionSourceCount: 0,
    rotationSpeedBinStatistics: [],
    selectedAngleBinStatistics: [],
    filmWidthBinStatistics: [],
    conditionCoverageGaps: [],
    rotationSpeedBySelectedAngleMatrix: {
      rowDimension: 'rotationSpeed' as const,
      columnDimension: 'selectedAngle' as const,
      rowBinEdges: [...options.rotationSpeedBinEdgesDegPerSecond],
      columnBinEdges: [...options.selectedAngleBinEdgesDeg],
      rowBinCount: Math.max(
        0,
        options.rotationSpeedBinEdgesDegPerSecond.length - 1
      ),
      columnBinCount: Math.max(0, options.selectedAngleBinEdgesDeg.length - 1),
      cells: [],
      coverageGaps: [],
    },
    coverageCollectionTargets: [],
    coverageReadiness: createUnevaluatedShadowCoverageReadinessSummary(),
  }
  if (
    !Number.isInteger(options.minimumRecordCount) ||
    options.minimumRecordCount < 1 ||
    !Number.isInteger(options.minimumMachineCount) ||
    options.minimumMachineCount < 0 ||
    !Number.isInteger(options.minimumRecipeCount) ||
    options.minimumRecipeCount < 0 ||
    typeof options.requireCompleteCoverageMetadata !== 'boolean' ||
    typeof options.requireCompleteContinuousConditions !== 'boolean' ||
    !Number.isInteger(options.minimumRecordsPerConditionBin) ||
    options.minimumRecordsPerConditionBin < 1 ||
    !Number.isInteger(options.minimumRecordsPerConditionCell) ||
    options.minimumRecordsPerConditionCell < 1 ||
    !validBinEdges(options.rotationSpeedBinEdgesDegPerSecond) ||
    !validBinEdges(options.selectedAngleBinEdgesDeg) ||
    !validBinEdges(options.filmWidthBinEdgesMm)
  ) {
    return { accepted: false, ...base, rejectReason: 'invalidOptions' }
  }
  if (records.length < options.minimumRecordCount) {
    return { accepted: false, ...base, rejectReason: 'insufficientRecords' }
  }

  const windowIds = new Set<string>()
  const recordsByMachine: Record<string, number> = {}
  const recordsByRecipe: Record<string, number> = {}
  const recordsByConditionSource: Record<string, number> = {}
  let missingMachineIdCount = 0
  let missingRecipeIdCount = 0
  let missingConditionSourceCount = 0
  let previousObservedAtMs = -Infinity
  for (const record of records) {
    const validSnapshot = (snapshot: UpperRotationShadowPathSnapshot) =>
      Number.isFinite(snapshot.elapsedMs) &&
      snapshot.elapsedMs >= 0 &&
      (snapshot.angleDeg === null || Number.isFinite(snapshot.angleDeg)) &&
      snapshot.accepted === (snapshot.angleDeg !== null)
    if (
      record.metadata.windowId.trim().length === 0 ||
      !Number.isFinite(record.metadata.observedAtMs) ||
      !validOptionalPositive(record.metadata.rotationSpeedDegPerSecond) ||
      !validOptionalPositive(record.metadata.filmWidthMm) ||
      !validConditionSource(record.metadata.conditionSource) ||
      record.selectedSource !== 'production' ||
      record.selectedAngleDeg !== record.production.angleDeg ||
      !validSnapshot(record.production) ||
      !validSnapshot(record.generic) ||
      !validSnapshot(record.candidate)
    ) {
      return { accepted: false, ...base, rejectReason: 'invalidRecord' }
    }
    if (windowIds.has(record.metadata.windowId)) {
      return { accepted: false, ...base, rejectReason: 'duplicateWindowId' }
    }
    windowIds.add(record.metadata.windowId)
    if (record.metadata.observedAtMs <= previousObservedAtMs) {
      return {
        accepted: false,
        ...base,
        rejectReason: 'nonIncreasingObservationTime',
      }
    }
    previousObservedAtMs = record.metadata.observedAtMs
    if (record.metadata.machineId === undefined) missingMachineIdCount++
    else {
      recordsByMachine[record.metadata.machineId] =
        (recordsByMachine[record.metadata.machineId] ?? 0) + 1
    }
    if (record.metadata.recipeId === undefined) missingRecipeIdCount++
    else {
      recordsByRecipe[record.metadata.recipeId] =
        (recordsByRecipe[record.metadata.recipeId] ?? 0) + 1
    }
    if (record.metadata.conditionSource === undefined) {
      missingConditionSourceCount++
    } else {
      recordsByConditionSource[record.metadata.conditionSource] =
        (recordsByConditionSource[record.metadata.conditionSource] ?? 0) + 1
    }
  }
  const rotationSpeedCoverage = buildNumericCoverage(
    records.map((record) => record.metadata.rotationSpeedDegPerSecond),
    options.rotationSpeedBinEdgesDegPerSecond
  )
  const selectedAngleCoverage = buildNumericCoverage(
    records.map((record) => record.selectedAngleDeg),
    options.selectedAngleBinEdgesDeg
  )
  const filmWidthCoverage = buildNumericCoverage(
    records.map((record) => record.metadata.filmWidthMm),
    options.filmWidthBinEdgesMm
  )
  const rotationSpeedBinStatistics = buildShadowConditionBinStatistics(
    records,
    options.rotationSpeedBinEdgesDegPerSecond,
    options.minimumRecordsPerConditionBin,
    (record) => record.metadata.rotationSpeedDegPerSecond
  )
  const selectedAngleBinStatistics = buildShadowConditionBinStatistics(
    records,
    options.selectedAngleBinEdgesDeg,
    options.minimumRecordsPerConditionBin,
    (record) => record.selectedAngleDeg
  )
  const filmWidthBinStatistics = buildShadowConditionBinStatistics(
    records,
    options.filmWidthBinEdgesMm,
    options.minimumRecordsPerConditionBin,
    (record) => record.metadata.filmWidthMm
  )
  const conditionCoverageGaps = [
    ...collectShadowConditionCoverageGaps(
      'rotationSpeed',
      rotationSpeedBinStatistics
    ),
    ...collectShadowConditionCoverageGaps(
      'selectedAngle',
      selectedAngleBinStatistics
    ),
    ...collectShadowConditionCoverageGaps('filmWidth', filmWidthBinStatistics),
  ]
  const rotationSpeedBySelectedAngleMatrix =
    buildRotationSpeedBySelectedAngleMatrix(
      records,
      options.rotationSpeedBinEdgesDegPerSecond,
      options.selectedAngleBinEdgesDeg,
      options.minimumRecordsPerConditionCell
    )
  const coverageCollectionTargets = buildShadowCoverageCollectionTargets(
    conditionCoverageGaps,
    rotationSpeedBySelectedAngleMatrix.coverageGaps
  )
  const coverageReadiness = buildShadowCoverageReadinessSummary(
    coverageCollectionTargets
  )
  const coverage = {
    firstObservedAtMs: records[0].metadata.observedAtMs,
    lastObservedAtMs: records[records.length - 1].metadata.observedAtMs,
    observationSpanMs:
      records[records.length - 1].metadata.observedAtMs -
      records[0].metadata.observedAtMs,
    distinctMachineCount: Object.keys(recordsByMachine).length,
    distinctRecipeCount: Object.keys(recordsByRecipe).length,
    missingMachineIdCount,
    missingRecipeIdCount,
    recordsByMachine,
    recordsByRecipe,
    rotationSpeedCoverage,
    selectedAngleCoverage,
    filmWidthCoverage,
    recordsByConditionSource,
    missingConditionSourceCount,
    rotationSpeedBinStatistics,
    selectedAngleBinStatistics,
    filmWidthBinStatistics,
    conditionCoverageGaps,
    rotationSpeedBySelectedAngleMatrix,
    coverageCollectionTargets,
    coverageReadiness,
  }
  if (
    options.requireCompleteCoverageMetadata &&
    (missingMachineIdCount > 0 || missingRecipeIdCount > 0)
  ) {
    return {
      accepted: false,
      ...base,
      ...coverage,
      rejectReason: 'incompleteCoverageMetadata',
    }
  }
  if (coverage.distinctMachineCount < options.minimumMachineCount) {
    return {
      accepted: false,
      ...base,
      ...coverage,
      rejectReason: 'insufficientMachineCoverage',
    }
  }
  if (coverage.distinctRecipeCount < options.minimumRecipeCount) {
    return {
      accepted: false,
      ...base,
      ...coverage,
      rejectReason: 'insufficientRecipeCoverage',
    }
  }
  if (
    options.requireCompleteContinuousConditions &&
    (rotationSpeedCoverage.missingCount > 0 ||
      rotationSpeedCoverage.outOfRangeCount > 0 ||
      selectedAngleCoverage.missingCount > 0 ||
      selectedAngleCoverage.outOfRangeCount > 0 ||
      filmWidthCoverage.missingCount > 0 ||
      filmWidthCoverage.outOfRangeCount > 0 ||
      missingConditionSourceCount > 0)
  ) {
    return {
      accepted: false,
      ...base,
      ...coverage,
      rejectReason: 'incompleteContinuousConditions',
    }
  }

  const productionAcceptedCount = records.filter(
    (record) => record.production.accepted
  ).length
  const genericAcceptedCount = records.filter(
    (record) => record.generic.accepted
  ).length
  const candidateAcceptedCount = records.filter(
    (record) => record.candidate.accepted
  ).length
  const finite = (value: number | null): value is number =>
    value !== null && Number.isFinite(value)
  const rejectionCounts: Record<string, number> = {}
  for (const record of records) {
    if (record.candidate.accepted) continue
    const key = `${record.candidate.rejectStage ?? 'unknown'}:${record.candidate.rejectReason ?? 'unknown'}`
    rejectionCounts[key] = (rejectionCounts[key] ?? 0) + 1
  }
  return {
    accepted: true,
    inputRecordCount: records.length,
    productionAcceptedCount,
    genericAcceptedCount,
    candidateAcceptedCount,
    productionAcceptanceRate: productionAcceptedCount / records.length,
    genericAcceptanceRate: genericAcceptedCount / records.length,
    candidateAcceptanceRate: candidateAcceptedCount / records.length,
    candidateMinusProductionAbsoluteDeg: summarize(
      records
        .map((record) => record.candidateMinusProductionDeg)
        .filter(finite)
        .map(Math.abs)
    ),
    genericMinusProductionAbsoluteDeg: summarize(
      records
        .map((record) => record.genericMinusProductionDeg)
        .filter(finite)
        .map(Math.abs)
    ),
    candidateMinusGenericAbsoluteDeg: summarize(
      records
        .map((record) => record.candidateMinusGenericDeg)
        .filter(finite)
        .map(Math.abs)
    ),
    productionElapsedMs: summarize(
      records.map((record) => record.production.elapsedMs)
    ),
    genericElapsedMs: summarize(
      records.map((record) => record.generic.elapsedMs)
    ),
    candidateElapsedMs: summarize(
      records.map((record) => record.candidate.elapsedMs)
    ),
    candidateRejectionCounts: rejectionCounts,
    ...coverage,
    rejectReason: null,
  }
}
