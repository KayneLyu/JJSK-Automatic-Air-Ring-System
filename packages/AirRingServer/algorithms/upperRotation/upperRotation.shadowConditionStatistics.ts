import type { UpperRotationShadowRecord } from './upperRotation.shadowStatistics'

export type ShadowConditionDistributionSummary = {
  count: number
  median: number | null
  p95: number | null
  maximum: number | null
}

export type ShadowConditionBinStatistics = {
  binIndex: number
  minimumInclusive: number
  maximum: number
  maximumInclusive: boolean
  recordCount: number
  minimumRequiredRecordCount: number
  recordCountDeficit: number
  coverageStatus: 'empty' | 'insufficient' | 'sufficient'
  productionAcceptedCount: number
  genericAcceptedCount: number
  candidateAcceptedCount: number
  productionAcceptanceRate: number | null
  genericAcceptanceRate: number | null
  candidateAcceptanceRate: number | null
  candidateMinusProductionAbsoluteDeg: ShadowConditionDistributionSummary
  genericMinusProductionAbsoluteDeg: ShadowConditionDistributionSummary
  candidateMinusGenericAbsoluteDeg: ShadowConditionDistributionSummary
  candidateRejectionCounts: Readonly<Record<string, number>>
}

export type ShadowConditionCoverageGap = {
  dimension: 'rotationSpeed' | 'selectedAngle' | 'filmWidth'
  binIndex: number
  minimumInclusive: number
  maximum: number
  maximumInclusive: boolean
  recordCount: number
  minimumRequiredRecordCount: number
  recordCountDeficit: number
  coverageStatus: 'empty' | 'insufficient'
}

export type ShadowConditionCrossCellStatistics = {
  rowBinIndex: number
  columnBinIndex: number
  rowMinimumInclusive: number
  rowMaximum: number
  rowMaximumInclusive: boolean
  columnMinimumInclusive: number
  columnMaximum: number
  columnMaximumInclusive: boolean
  recordCount: number
  minimumRequiredRecordCount: number
  recordCountDeficit: number
  coverageStatus: 'empty' | 'insufficient' | 'sufficient'
  productionAcceptedCount: number
  genericAcceptedCount: number
  candidateAcceptedCount: number
  productionAcceptanceRate: number | null
  genericAcceptanceRate: number | null
  candidateAcceptanceRate: number | null
  candidateMinusProductionAbsoluteDeg: ShadowConditionDistributionSummary
  genericMinusProductionAbsoluteDeg: ShadowConditionDistributionSummary
  candidateMinusGenericAbsoluteDeg: ShadowConditionDistributionSummary
  candidateRejectionCounts: Readonly<Record<string, number>>
}

export type ShadowConditionCrossCoverageGap = Pick<
  ShadowConditionCrossCellStatistics,
  | 'rowBinIndex'
  | 'columnBinIndex'
  | 'rowMinimumInclusive'
  | 'rowMaximum'
  | 'rowMaximumInclusive'
  | 'columnMinimumInclusive'
  | 'columnMaximum'
  | 'columnMaximumInclusive'
  | 'recordCount'
  | 'minimumRequiredRecordCount'
  | 'recordCountDeficit'
> & { coverageStatus: 'empty' | 'insufficient' }

export type ShadowConditionCrossMatrix = {
  rowDimension: 'rotationSpeed'
  columnDimension: 'selectedAngle'
  rowBinEdges: readonly number[]
  columnBinEdges: readonly number[]
  rowBinCount: number
  columnBinCount: number
  cells: readonly ShadowConditionCrossCellStatistics[]
  coverageGaps: readonly ShadowConditionCrossCoverageGap[]
}

const summarize = (
  values: readonly number[]
): ShadowConditionDistributionSummary => {
  if (values.length === 0) {
    return { count: 0, median: null, p95: null, maximum: null }
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    median:
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maximum: sorted[sorted.length - 1],
  }
}

const absoluteFiniteDeltas = (
  records: readonly UpperRotationShadowRecord[],
  select: (record: UpperRotationShadowRecord) => number | null
): number[] => {
  const values: number[] = []
  for (const record of records) {
    const value = select(record)
    if (value !== null && Number.isFinite(value)) values.push(Math.abs(value))
  }
  return values
}

const summarizeRecords = (
  records: readonly UpperRotationShadowRecord[],
  minimumRequiredRecordCount: number
) => {
  const count = (path: 'production' | 'generic' | 'candidate') =>
    records.filter((record) => record[path].accepted).length
  const productionAcceptedCount = count('production')
  const genericAcceptedCount = count('generic')
  const candidateAcceptedCount = count('candidate')
  const rate = (acceptedCount: number) =>
    records.length === 0 ? null : acceptedCount / records.length
  const candidateRejectionCounts: Record<string, number> = {}
  for (const record of records) {
    if (record.candidate.accepted) continue
    const key = `${record.candidate.rejectStage ?? 'unknown'}:${record.candidate.rejectReason ?? 'unknown'}`
    candidateRejectionCounts[key] = (candidateRejectionCounts[key] ?? 0) + 1
  }
  const recordCountDeficit = Math.max(
    0,
    minimumRequiredRecordCount - records.length
  )
  const coverageStatus =
    records.length === 0
      ? ('empty' as const)
      : recordCountDeficit > 0
        ? ('insufficient' as const)
        : ('sufficient' as const)
  return {
    recordCount: records.length,
    minimumRequiredRecordCount,
    recordCountDeficit,
    coverageStatus,
    productionAcceptedCount,
    genericAcceptedCount,
    candidateAcceptedCount,
    productionAcceptanceRate: rate(productionAcceptedCount),
    genericAcceptanceRate: rate(genericAcceptedCount),
    candidateAcceptanceRate: rate(candidateAcceptedCount),
    candidateMinusProductionAbsoluteDeg: summarize(
      absoluteFiniteDeltas(
        records,
        (record) => record.candidateMinusProductionDeg
      )
    ),
    genericMinusProductionAbsoluteDeg: summarize(
      absoluteFiniteDeltas(
        records,
        (record) => record.genericMinusProductionDeg
      )
    ),
    candidateMinusGenericAbsoluteDeg: summarize(
      absoluteFiniteDeltas(records, (record) => record.candidateMinusGenericDeg)
    ),
    candidateRejectionCounts,
  }
}

const inBin = (
  value: number | null | undefined,
  minimumInclusive: number,
  maximum: number,
  maximumInclusive: boolean
): boolean =>
  value !== null &&
  value !== undefined &&
  value >= minimumInclusive &&
  (maximumInclusive ? value <= maximum : value < maximum)

/** 生成所有显式工况桶的局部影子统计；空桶也保留。 */
export const buildShadowConditionBinStatistics = (
  records: readonly UpperRotationShadowRecord[],
  binEdges: readonly number[],
  minimumRequiredRecordCount: number,
  selectCondition: (
    record: UpperRotationShadowRecord
  ) => number | null | undefined
): ShadowConditionBinStatistics[] =>
  binEdges.slice(0, -1).map((minimumInclusive, binIndex) => {
    const maximum = binEdges[binIndex + 1]
    const maximumInclusive = binIndex === binEdges.length - 2
    const recordsInBin = records.filter((record) =>
      inBin(
        selectCondition(record),
        minimumInclusive,
        maximum,
        maximumInclusive
      )
    )
    return {
      binIndex,
      minimumInclusive,
      maximum,
      maximumInclusive,
      ...summarizeRecords(recordsInBin, minimumRequiredRecordCount),
    }
  })

/** 构建完整的速度 × 生产选中角度矩阵；数组按行优先排列且保留空单元。 */
export const buildRotationSpeedBySelectedAngleMatrix = (
  records: readonly UpperRotationShadowRecord[],
  rotationSpeedBinEdgesDegPerSecond: readonly number[],
  selectedAngleBinEdgesDeg: readonly number[],
  minimumRequiredRecordCount: number
): ShadowConditionCrossMatrix => {
  const cells: ShadowConditionCrossCellStatistics[] = []
  for (
    let rowBinIndex = 0;
    rowBinIndex < rotationSpeedBinEdgesDegPerSecond.length - 1;
    rowBinIndex++
  ) {
    const rowMinimumInclusive = rotationSpeedBinEdgesDegPerSecond[rowBinIndex]
    const rowMaximum = rotationSpeedBinEdgesDegPerSecond[rowBinIndex + 1]
    const rowMaximumInclusive =
      rowBinIndex === rotationSpeedBinEdgesDegPerSecond.length - 2
    for (
      let columnBinIndex = 0;
      columnBinIndex < selectedAngleBinEdgesDeg.length - 1;
      columnBinIndex++
    ) {
      const columnMinimumInclusive = selectedAngleBinEdgesDeg[columnBinIndex]
      const columnMaximum = selectedAngleBinEdgesDeg[columnBinIndex + 1]
      const columnMaximumInclusive =
        columnBinIndex === selectedAngleBinEdgesDeg.length - 2
      const recordsInCell = records.filter(
        (record) =>
          inBin(
            record.metadata.rotationSpeedDegPerSecond,
            rowMinimumInclusive,
            rowMaximum,
            rowMaximumInclusive
          ) &&
          inBin(
            record.selectedAngleDeg,
            columnMinimumInclusive,
            columnMaximum,
            columnMaximumInclusive
          )
      )
      cells.push({
        rowBinIndex,
        columnBinIndex,
        rowMinimumInclusive,
        rowMaximum,
        rowMaximumInclusive,
        columnMinimumInclusive,
        columnMaximum,
        columnMaximumInclusive,
        ...summarizeRecords(recordsInCell, minimumRequiredRecordCount),
      })
    }
  }
  const coverageGaps: ShadowConditionCrossCoverageGap[] = cells
    .filter((cell) => cell.coverageStatus !== 'sufficient')
    .map((cell) => ({
      rowBinIndex: cell.rowBinIndex,
      columnBinIndex: cell.columnBinIndex,
      rowMinimumInclusive: cell.rowMinimumInclusive,
      rowMaximum: cell.rowMaximum,
      rowMaximumInclusive: cell.rowMaximumInclusive,
      columnMinimumInclusive: cell.columnMinimumInclusive,
      columnMaximum: cell.columnMaximum,
      columnMaximumInclusive: cell.columnMaximumInclusive,
      recordCount: cell.recordCount,
      minimumRequiredRecordCount: cell.minimumRequiredRecordCount,
      recordCountDeficit: cell.recordCountDeficit,
      coverageStatus: cell.coverageStatus as 'empty' | 'insufficient',
    }))
  return {
    rowDimension: 'rotationSpeed',
    columnDimension: 'selectedAngle',
    rowBinEdges: [...rotationSpeedBinEdgesDegPerSecond],
    columnBinEdges: [...selectedAngleBinEdgesDeg],
    rowBinCount: rotationSpeedBinEdgesDegPerSecond.length - 1,
    columnBinCount: selectedAngleBinEdgesDeg.length - 1,
    cells,
    coverageGaps,
  }
}

export const collectShadowConditionCoverageGaps = (
  dimension: ShadowConditionCoverageGap['dimension'],
  bins: readonly ShadowConditionBinStatistics[]
): ShadowConditionCoverageGap[] =>
  bins
    .filter((bin) => bin.coverageStatus !== 'sufficient')
    .map((bin) => ({
      dimension,
      binIndex: bin.binIndex,
      minimumInclusive: bin.minimumInclusive,
      maximum: bin.maximum,
      maximumInclusive: bin.maximumInclusive,
      recordCount: bin.recordCount,
      minimumRequiredRecordCount: bin.minimumRequiredRecordCount,
      recordCountDeficit: bin.recordCountDeficit,
      coverageStatus: bin.coverageStatus as 'empty' | 'insufficient',
    }))
