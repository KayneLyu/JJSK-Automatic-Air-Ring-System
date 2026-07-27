import { calculateZncc, type ZnccResult } from './upperRotation.zncc'

export type FeatureTrackingOptions = {
  referenceTimestampMs: number
  candidateTimestampMs: number
  maxAngularSpeedDegPerSecond: number
  degreesPerSample: number
  minOverlapRatio: number
}

export type FeatureTrackingConfidenceEvidence = {
  correlation: number
  overlapRatio: number
  peakProminence: number | null
  fisherPeakSeparation: number | null
  peakAtSearchBoundary: boolean
  equivalentPeakCount: number
}

export type FeatureTrackingConfidenceLimits = {
  minimumCorrelation: number
  minimumOverlapRatio: number
  minimumPeakProminence?: number
  minimumFisherPeakSeparation?: number
}

export type FeatureTrackingConfidenceViolation =
  | 'correlation'
  | 'overlapRatio'
  | 'peakProminence'
  | 'fisherPeakSeparation'
  | 'fisherPeakSeparationUnavailable'

export type FeatureTrackingConfidenceEvaluation = {
  accepted: boolean
  violations: FeatureTrackingConfidenceViolation[]
  rejectReason: 'invalidEvidence' | 'invalidLimits' | 'lowConfidence' | null
}

export type FeatureTrackingResult = {
  accepted: boolean
  elapsedMs: number | null
  maxAngleDeltaDeg: number | null
  maxShift: number | null
  minOverlapCount: number | null
  shiftSamples: number | null
  angleDeltaDeg: number | null
  confidenceEvidence: FeatureTrackingConfidenceEvidence | null
  zncc: ZnccResult | null
  rejectReason:
    | 'invalidTiming'
    | 'invalidPhysicalLimits'
    | 'invalidOverlapRatio'
    | 'searchWindowExceedsProfile'
    | 'znccRejected'
    | 'peakAtSearchBoundary'
    | 'ambiguousEquivalentPeaks'
    | null
}

const rejectedResult = (
  rejectReason: Exclude<FeatureTrackingResult['rejectReason'], null>,
  diagnostics: Partial<FeatureTrackingResult> = {}
): FeatureTrackingResult => ({
  accepted: false,
  elapsedMs: null,
  maxAngleDeltaDeg: null,
  maxShift: null,
  minOverlapCount: null,
  shiftSamples: null,
  angleDeltaDeg: null,
  confidenceEvidence: null,
  zncc: null,
  rejectReason,
  ...diagnostics,
})

const isLocalPeak = (scores: ZnccResult['scores'], index: number): boolean => {
  const correlation = scores[index].correlation
  if (correlation === null) return false
  const previous = scores[index - 1]?.correlation
  const next = scores[index + 1]?.correlation
  return (
    (previous === null || previous === undefined || correlation >= previous) &&
    (next === null || next === undefined || correlation >= next)
  )
}

const buildConfidenceEvidence = (
  zncc: ZnccResult,
  profileLength: number,
  maxShift: number
): FeatureTrackingConfidenceEvidence => {
  const correlation = zncc.bestCorrelation as number
  const bestShift = zncc.bestShift as number
  const numericTolerance =
    Number.EPSILON * Math.max(1, Math.abs(correlation)) * zncc.scores.length
  const equivalentPeakCount = zncc.scores.reduce((count, score, index) => {
    if (
      Math.abs(score.shift - bestShift) <= 1 ||
      score.correlation === null ||
      !isLocalPeak(zncc.scores, index)
    ) {
      return count
    }
    return correlation - score.correlation <= numericTolerance
      ? count + 1
      : count
  }, 1)
  let fisherPeakSeparation: number | null = null
  if (
    zncc.secondPeakCorrelation !== null &&
    zncc.secondPeakOverlapCount !== null &&
    zncc.bestOverlapCount > 3 &&
    zncc.secondPeakOverlapCount > 3
  ) {
    const clampForFisher = (value: number): number =>
      Math.max(-1 + Number.EPSILON, Math.min(1 - Number.EPSILON, value))
    const fisherGap =
      Math.atanh(clampForFisher(correlation)) -
      Math.atanh(clampForFisher(zncc.secondPeakCorrelation))
    const standardError = Math.sqrt(
      1 / (zncc.bestOverlapCount - 3) + 1 / (zncc.secondPeakOverlapCount - 3)
    )
    fisherPeakSeparation = fisherGap / standardError
  }

  return {
    correlation,
    overlapRatio: zncc.bestOverlapCount / profileLength,
    peakProminence: zncc.peakProminence,
    fisherPeakSeparation,
    peakAtSearchBoundary: Math.abs(bestShift) === maxShift,
    equivalentPeakCount,
  }
}

/**
 * 使用调用方显式提供的证据门限评价特征追踪置信度。
 * 没有竞争次峰时，可选的突出度与 Fisher 门限不参与拒绝。
 */
export const evaluateFeatureTrackingConfidence = (
  evidence: FeatureTrackingConfidenceEvidence,
  {
    minimumCorrelation,
    minimumOverlapRatio,
    minimumPeakProminence,
    minimumFisherPeakSeparation,
  }: FeatureTrackingConfidenceLimits
): FeatureTrackingConfidenceEvaluation => {
  if (
    !Number.isFinite(evidence.correlation) ||
    evidence.correlation < -1 ||
    evidence.correlation > 1 ||
    !Number.isFinite(evidence.overlapRatio) ||
    evidence.overlapRatio < 0 ||
    evidence.overlapRatio > 1 ||
    (evidence.peakProminence !== null &&
      (!Number.isFinite(evidence.peakProminence) ||
        evidence.peakProminence < 0)) ||
    (evidence.fisherPeakSeparation !== null &&
      !Number.isFinite(evidence.fisherPeakSeparation))
  ) {
    return {
      accepted: false,
      violations: [],
      rejectReason: 'invalidEvidence',
    }
  }
  if (
    !Number.isFinite(minimumCorrelation) ||
    minimumCorrelation < -1 ||
    minimumCorrelation > 1 ||
    !Number.isFinite(minimumOverlapRatio) ||
    minimumOverlapRatio <= 0 ||
    minimumOverlapRatio > 1 ||
    (minimumPeakProminence !== undefined &&
      (!Number.isFinite(minimumPeakProminence) || minimumPeakProminence < 0)) ||
    (minimumFisherPeakSeparation !== undefined &&
      (!Number.isFinite(minimumFisherPeakSeparation) ||
        minimumFisherPeakSeparation < 0))
  ) {
    return {
      accepted: false,
      violations: [],
      rejectReason: 'invalidLimits',
    }
  }

  const violations: FeatureTrackingConfidenceViolation[] = []
  if (evidence.correlation < minimumCorrelation) {
    violations.push('correlation')
  }
  if (evidence.overlapRatio < minimumOverlapRatio) {
    violations.push('overlapRatio')
  }
  const hasCompetingPeak = evidence.peakProminence !== null
  if (
    hasCompetingPeak &&
    minimumPeakProminence !== undefined &&
    (evidence.peakProminence as number) < minimumPeakProminence
  ) {
    violations.push('peakProminence')
  }
  if (hasCompetingPeak && minimumFisherPeakSeparation !== undefined) {
    if (evidence.fisherPeakSeparation === null) {
      violations.push('fisherPeakSeparationUnavailable')
    } else if (evidence.fisherPeakSeparation < minimumFisherPeakSeparation) {
      violations.push('fisherPeakSeparation')
    }
  }

  return {
    accepted: violations.length === 0,
    violations,
    rejectReason: violations.length === 0 ? null : 'lowConfidence',
  }
}

/**
 * 根据真实扫描间隔和设备物理速度上限动态推导 ZNCC 搜索窗口。
 * 本层不提供经验默认值，所有物理约束均由调用方显式传入。
 */
export const trackProfileShift = (
  reference: readonly number[],
  candidate: readonly number[],
  {
    referenceTimestampMs,
    candidateTimestampMs,
    maxAngularSpeedDegPerSecond,
    degreesPerSample,
    minOverlapRatio,
  }: FeatureTrackingOptions
): FeatureTrackingResult => {
  const elapsedMs = candidateTimestampMs - referenceTimestampMs
  if (
    !Number.isFinite(referenceTimestampMs) ||
    !Number.isFinite(candidateTimestampMs) ||
    elapsedMs <= 0
  ) {
    return rejectedResult('invalidTiming')
  }
  if (
    !Number.isFinite(maxAngularSpeedDegPerSecond) ||
    maxAngularSpeedDegPerSecond <= 0 ||
    !Number.isFinite(degreesPerSample) ||
    degreesPerSample <= 0
  ) {
    return rejectedResult('invalidPhysicalLimits', { elapsedMs })
  }
  if (
    !Number.isFinite(minOverlapRatio) ||
    minOverlapRatio <= 0 ||
    minOverlapRatio > 1
  ) {
    return rejectedResult('invalidOverlapRatio', { elapsedMs })
  }

  const maxAngleDeltaDeg = maxAngularSpeedDegPerSecond * (elapsedMs / 1000)
  const maxShift = Math.ceil(maxAngleDeltaDeg / degreesPerSample)
  const minOverlapCount = Math.ceil(reference.length * minOverlapRatio)
  if (
    reference.length === 0 ||
    reference.length !== candidate.length ||
    maxShift >= reference.length ||
    minOverlapCount < 2
  ) {
    return rejectedResult('searchWindowExceedsProfile', {
      elapsedMs,
      maxAngleDeltaDeg,
      maxShift,
      minOverlapCount,
    })
  }

  const zncc = calculateZncc(reference, candidate, {
    maxShift,
    minOverlapCount,
  })
  if (!zncc.accepted || zncc.bestShiftSubpixel === null) {
    return rejectedResult('znccRejected', {
      elapsedMs,
      maxAngleDeltaDeg,
      maxShift,
      minOverlapCount,
      zncc,
    })
  }
  const confidenceEvidence = buildConfidenceEvidence(
    zncc,
    reference.length,
    maxShift
  )
  if (confidenceEvidence.peakAtSearchBoundary) {
    return rejectedResult('peakAtSearchBoundary', {
      elapsedMs,
      maxAngleDeltaDeg,
      maxShift,
      minOverlapCount,
      confidenceEvidence,
      zncc,
    })
  }
  if (confidenceEvidence.equivalentPeakCount > 1) {
    return rejectedResult('ambiguousEquivalentPeaks', {
      elapsedMs,
      maxAngleDeltaDeg,
      maxShift,
      minOverlapCount,
      confidenceEvidence,
      zncc,
    })
  }

  return {
    accepted: true,
    elapsedMs,
    maxAngleDeltaDeg,
    maxShift,
    minOverlapCount,
    shiftSamples: zncc.bestShiftSubpixel,
    angleDeltaDeg: zncc.bestShiftSubpixel * degreesPerSample,
    confidenceEvidence,
    zncc,
    rejectReason: null,
  }
}
