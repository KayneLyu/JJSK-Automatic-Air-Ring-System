import type { AngularVelocityObservation } from './upperRotation.angularVelocity'

export type TripConfidenceMetricSummary = {
  count: number
  median: number | null
  minimum: number | null
}

export type TripConfidenceEvidenceAggregate = {
  accepted: boolean
  inputObservationCount: number
  acceptedObservationCount: number
  evidenceCount: number
  missingEvidenceCount: number
  invalidEvidenceCount: number
  noCompetingPeakCount: number
  fisherUnavailableCount: number
  boundaryPeakCount: number
  equivalentPeakObservationCount: number
  correlation: TripConfidenceMetricSummary
  overlapRatio: TripConfidenceMetricSummary
  peakProminence: TripConfidenceMetricSummary
  fisherPeakSeparation: TripConfidenceMetricSummary
  rejectReason: 'invalidOptions' | 'insufficientEvidence' | null
}

const summarize = (values: number[]): TripConfidenceMetricSummary => {
  if (values.length === 0) return { count: 0, median: null, minimum: null }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return {
    count: sorted.length,
    median:
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle],
    minimum: sorted[0],
  }
}

/**
 * 将一个行程内的特征追踪证据逐维稳健汇总，不合成为经验加权总分。
 */
export const aggregateTripConfidenceEvidence = (
  observations: readonly AngularVelocityObservation[],
  minimumEvidenceCount: number
): TripConfidenceEvidenceAggregate => {
  const emptySummary = (): TripConfidenceMetricSummary => ({
    count: 0,
    median: null,
    minimum: null,
  })
  const rejected = (
    rejectReason: 'invalidOptions' | 'insufficientEvidence',
    diagnostics: Partial<TripConfidenceEvidenceAggregate> = {}
  ): TripConfidenceEvidenceAggregate => ({
    accepted: false,
    inputObservationCount: observations.length,
    acceptedObservationCount: 0,
    evidenceCount: 0,
    missingEvidenceCount: 0,
    invalidEvidenceCount: 0,
    noCompetingPeakCount: 0,
    fisherUnavailableCount: 0,
    boundaryPeakCount: 0,
    equivalentPeakObservationCount: 0,
    correlation: emptySummary(),
    overlapRatio: emptySummary(),
    peakProminence: emptySummary(),
    fisherPeakSeparation: emptySummary(),
    ...diagnostics,
    rejectReason,
  })
  if (!Number.isInteger(minimumEvidenceCount) || minimumEvidenceCount < 1) {
    return rejected('invalidOptions')
  }

  const acceptedObservations = observations.filter(
    (observation) => observation.accepted
  )
  const correlations: number[] = []
  const overlapRatios: number[] = []
  const peakProminences: number[] = []
  const fisherSeparations: number[] = []
  let missingEvidenceCount = 0
  let invalidEvidenceCount = 0
  let noCompetingPeakCount = 0
  let fisherUnavailableCount = 0
  let boundaryPeakCount = 0
  let equivalentPeakObservationCount = 0

  for (const observation of acceptedObservations) {
    const evidence = observation.confidenceEvidence
    if (evidence === null) {
      missingEvidenceCount++
      continue
    }
    const valid =
      Number.isFinite(evidence.correlation) &&
      evidence.correlation >= -1 &&
      evidence.correlation <= 1 &&
      Number.isFinite(evidence.overlapRatio) &&
      evidence.overlapRatio >= 0 &&
      evidence.overlapRatio <= 1 &&
      (evidence.peakProminence === null ||
        (Number.isFinite(evidence.peakProminence) &&
          evidence.peakProminence >= 0)) &&
      (evidence.fisherPeakSeparation === null ||
        Number.isFinite(evidence.fisherPeakSeparation)) &&
      Number.isInteger(evidence.equivalentPeakCount) &&
      evidence.equivalentPeakCount >= 1
    if (!valid) {
      invalidEvidenceCount++
      continue
    }

    correlations.push(evidence.correlation)
    overlapRatios.push(evidence.overlapRatio)
    if (evidence.peakProminence === null) {
      noCompetingPeakCount++
    } else {
      peakProminences.push(evidence.peakProminence)
      if (evidence.fisherPeakSeparation === null) {
        fisherUnavailableCount++
      }
    }
    if (evidence.fisherPeakSeparation !== null) {
      fisherSeparations.push(evidence.fisherPeakSeparation)
    }
    if (evidence.peakAtSearchBoundary) boundaryPeakCount++
    if (evidence.equivalentPeakCount > 1) equivalentPeakObservationCount++
  }

  const diagnostics = {
    inputObservationCount: observations.length,
    acceptedObservationCount: acceptedObservations.length,
    evidenceCount: correlations.length,
    missingEvidenceCount,
    invalidEvidenceCount,
    noCompetingPeakCount,
    fisherUnavailableCount,
    boundaryPeakCount,
    equivalentPeakObservationCount,
    correlation: summarize(correlations),
    overlapRatio: summarize(overlapRatios),
    peakProminence: summarize(peakProminences),
    fisherPeakSeparation: summarize(fisherSeparations),
  }
  if (correlations.length < minimumEvidenceCount) {
    return rejected('insufficientEvidence', diagnostics)
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
