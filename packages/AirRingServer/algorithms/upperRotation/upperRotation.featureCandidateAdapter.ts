import type {
  TripAngleCandidateAggregation,
  UpperRotationTripAngleCandidate,
} from './upperRotation.tripCandidates'

export type FeatureAngleUncertaintyComponents = {
  tripAngleMadDeg: number
  bidirectionalMedianDifferenceDeg: number
  observedTrendSpanDeg: number
  endpointTimingUncertaintyDeg: number
}

export type FeatureCandidateRefinementInput = {
  featureAngleDeg: number
  uncertaintyComponentsDeg: readonly number[]
}

export type FeatureCandidateAdapterResult = {
  accepted: boolean
  refinementInput: FeatureCandidateRefinementInput | null
  uncertainty: FeatureAngleUncertaintyComponents | null
  acceptedTripCount: number
  confidenceEvidenceCount: number
  minimumCorrelation: number | null
  minimumOverlapRatio: number | null
  rejectReason:
    | 'aggregationRejected'
    | 'invalidAggregationDiagnostics'
    | 'candidateCountMismatch'
    | 'invalidTripCandidate'
    | 'missingTripConfidence'
    | 'invalidEndpointTimingUncertainty'
    | null
}

/**
 * 将 Stage 6 多行程候选只读适配为 Stage 7 特征粗估输入。
 * 各不确定度保持具名且按局部窗口的最坏情况规则相加，不生成经验权重分数。
 */
export const adaptTripCandidatesToFeatureRefinement = (
  aggregation: TripAngleCandidateAggregation,
  candidates: readonly UpperRotationTripAngleCandidate[],
  endpointTimingUncertaintyDeg: number
): FeatureCandidateAdapterResult => {
  const base = {
    refinementInput: null,
    uncertainty: null,
    acceptedTripCount: aggregation.acceptedTripCount,
    confidenceEvidenceCount: 0,
    minimumCorrelation: null,
    minimumOverlapRatio: null,
  }
  if (!aggregation.accepted) {
    return { accepted: false, ...base, rejectReason: 'aggregationRejected' }
  }
  const diagnostics = [
    aggregation.medianAngleDeg,
    aggregation.angleMadDeg,
    aggregation.bidirectionalMedianDifferenceDeg,
    aggregation.trendDegPerTrip,
  ]
  if (diagnostics.some((value) => value === null || !Number.isFinite(value))) {
    return {
      accepted: false,
      ...base,
      rejectReason: 'invalidAggregationDiagnostics',
    }
  }
  if (
    aggregation.acceptedTripCount < 2 ||
    (aggregation.angleMadDeg as number) < 0 ||
    (aggregation.bidirectionalMedianDifferenceDeg as number) < 0
  ) {
    return {
      accepted: false,
      ...base,
      rejectReason: 'invalidAggregationDiagnostics',
    }
  }
  if (
    !Number.isFinite(endpointTimingUncertaintyDeg) ||
    endpointTimingUncertaintyDeg < 0
  ) {
    return {
      accepted: false,
      ...base,
      rejectReason: 'invalidEndpointTimingUncertainty',
    }
  }

  const acceptedCandidates = candidates.filter(
    (candidate) => candidate.accepted
  )
  if (acceptedCandidates.length !== aggregation.acceptedTripCount) {
    return {
      accepted: false,
      ...base,
      rejectReason: 'candidateCountMismatch',
    }
  }

  let confidenceEvidenceCount = 0
  let minimumCorrelation = Infinity
  let minimumOverlapRatio = Infinity
  for (const candidate of acceptedCandidates) {
    if (
      candidate.maximumAngleDeg === null ||
      !Number.isFinite(candidate.maximumAngleDeg)
    ) {
      return {
        accepted: false,
        ...base,
        rejectReason: 'invalidTripCandidate',
      }
    }
    const confidence = candidate.confidence
    if (
      confidence === null ||
      !confidence.accepted ||
      confidence.correlation.minimum === null ||
      !Number.isFinite(confidence.correlation.minimum) ||
      confidence.overlapRatio.minimum === null ||
      !Number.isFinite(confidence.overlapRatio.minimum)
    ) {
      return {
        accepted: false,
        ...base,
        rejectReason: 'missingTripConfidence',
      }
    }
    confidenceEvidenceCount += confidence.evidenceCount
    minimumCorrelation = Math.min(
      minimumCorrelation,
      confidence.correlation.minimum
    )
    minimumOverlapRatio = Math.min(
      minimumOverlapRatio,
      confidence.overlapRatio.minimum
    )
  }

  const uncertainty: FeatureAngleUncertaintyComponents = {
    tripAngleMadDeg: aggregation.angleMadDeg as number,
    bidirectionalMedianDifferenceDeg:
      aggregation.bidirectionalMedianDifferenceDeg as number,
    observedTrendSpanDeg:
      Math.abs(aggregation.trendDegPerTrip as number) *
      Math.max(0, aggregation.acceptedTripCount - 1),
    endpointTimingUncertaintyDeg,
  }
  return {
    accepted: true,
    refinementInput: {
      featureAngleDeg: aggregation.medianAngleDeg as number,
      uncertaintyComponentsDeg: [
        uncertainty.tripAngleMadDeg,
        uncertainty.bidirectionalMedianDifferenceDeg,
        uncertainty.observedTrendSpanDeg,
        uncertainty.endpointTimingUncertaintyDeg,
      ],
    },
    uncertainty,
    acceptedTripCount: aggregation.acceptedTripCount,
    confidenceEvidenceCount,
    minimumCorrelation,
    minimumOverlapRatio,
    rejectReason: null,
  }
}
