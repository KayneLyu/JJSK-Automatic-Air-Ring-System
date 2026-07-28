import {
  createExpandedObjective,
  type ExpandedObjectiveAdapterOptions,
  type ExpandedObjectiveAdapterResult,
} from './upperRotation.expandedObjective'
import {
  adaptTripCandidatesToFeatureRefinement,
  type FeatureCandidateAdapterResult,
} from './upperRotation.featureCandidateAdapter'
import {
  refineFeatureAngleWithLocalObjective,
  type LocalObjectiveRefinementOptions,
  type LocalObjectiveRefinementResult,
} from './upperRotation.localRefinement'
import type {
  TripAngleCandidateAggregation,
  UpperRotationTripAngleCandidate,
} from './upperRotation.tripCandidates'

export type OfflineUpperRotationRefinementOptions = {
  aggregation: TripAngleCandidateAggregation
  candidates: readonly UpperRotationTripAngleCandidate[]
  endpointTimingUncertaintyDeg: number
  expandedObjective: ExpandedObjectiveAdapterOptions
  localRefinement: Omit<
    LocalObjectiveRefinementOptions,
    'featureAngleDeg' | 'uncertaintyComponentsDeg'
  >
}

export type OfflineUpperRotationRefinementResult = {
  accepted: boolean
  finalAngleDeg: number | null
  finalLoss: number | null
  featureCandidate: FeatureCandidateAdapterResult
  expandedObjective: ExpandedObjectiveAdapterResult | null
  localRefinement: LocalObjectiveRefinementResult | null
  rejectStage:
    | 'featureCandidate'
    | 'expandedObjective'
    | 'localRefinement'
    | null
  rejectReason: string | null
}

/**
 * Stage 6 → Stage 7 的离线只读编排入口，不修改当前生产估算路径。
 */
export const refineUpperRotationAngleOffline = (
  options: OfflineUpperRotationRefinementOptions
): OfflineUpperRotationRefinementResult => {
  const featureCandidate = adaptTripCandidatesToFeatureRefinement(
    options.aggregation,
    options.candidates,
    options.endpointTimingUncertaintyDeg
  )
  const base = {
    finalAngleDeg: null,
    finalLoss: null,
    featureCandidate,
    expandedObjective: null,
    localRefinement: null,
  }
  if (!featureCandidate.accepted || featureCandidate.refinementInput === null) {
    return {
      accepted: false,
      ...base,
      rejectStage: 'featureCandidate',
      rejectReason: featureCandidate.rejectReason,
    }
  }

  const expandedObjective = createExpandedObjective(options.expandedObjective)
  if (!expandedObjective.accepted || expandedObjective.objective === null) {
    return {
      accepted: false,
      ...base,
      expandedObjective,
      rejectStage: 'expandedObjective',
      rejectReason: expandedObjective.rejectReason,
    }
  }

  const localRefinement = refineFeatureAngleWithLocalObjective(
    {
      ...options.localRefinement,
      ...featureCandidate.refinementInput,
    },
    expandedObjective.objective
  )
  if (
    !localRefinement.accepted ||
    localRefinement.refinedAngleDeg === null ||
    localRefinement.finalLoss === null
  ) {
    return {
      accepted: false,
      ...base,
      expandedObjective,
      localRefinement,
      rejectStage: 'localRefinement',
      rejectReason: localRefinement.rejectReason,
    }
  }
  return {
    accepted: true,
    ...base,
    finalAngleDeg: localRefinement.refinedAngleDeg,
    finalLoss: localRefinement.finalLoss,
    expandedObjective,
    localRefinement,
    rejectStage: null,
    rejectReason: null,
  }
}
