import {
  refineLocalObjectiveWithGoldenSection,
  type GoldenRefinementOptions,
  type GoldenRefinementResult,
} from './upperRotation.goldenRefinement'
import {
  buildDynamicLocalSearchWindow,
  type DynamicLocalSearchWindowOptions,
  type DynamicLocalSearchWindowResult,
} from './upperRotation.localSearchWindow'
import {
  scanLocalObjective,
  type LocalObjectiveScanResult,
} from './upperRotation.localObjectiveScan'

export type LocalObjectiveRefinementOptions =
  DynamicLocalSearchWindowOptions & {
    goldenRefinement: GoldenRefinementOptions
    maximumFeatureObjectiveShiftDeg: number
  }

export type LocalObjectiveRefinementResult = {
  accepted: boolean
  featureAngleDeg: number
  refinedAngleDeg: number | null
  featureObjectiveShiftDeg: number | null
  finalLoss: number | null
  totalUncertaintyDeg: number | null
  evidenceSources: readonly ['featureCandidate', 'genericObjective']
  window: DynamicLocalSearchWindowResult | null
  scan: LocalObjectiveScanResult | null
  refinement: GoldenRefinementResult | null
  rejectStage:
    | 'configuration'
    | 'window'
    | 'scan'
    | 'refinement'
    | 'consistency'
    | null
  rejectReason: string | null
}

/**
 * 通用离线局部精调管线。特征证据与目标函数证据冲突时不选择任一方兜底。
 */
export const refineFeatureAngleWithLocalObjective = (
  options: LocalObjectiveRefinementOptions,
  objective: (angleDeg: number) => number
): LocalObjectiveRefinementResult => {
  const base = {
    featureAngleDeg: options.featureAngleDeg,
    refinedAngleDeg: null,
    featureObjectiveShiftDeg: null,
    finalLoss: null,
    totalUncertaintyDeg: null,
    evidenceSources: ['featureCandidate', 'genericObjective'] as const,
    window: null,
    scan: null,
    refinement: null,
  }
  if (
    !Number.isFinite(options.maximumFeatureObjectiveShiftDeg) ||
    options.maximumFeatureObjectiveShiftDeg < 0
  ) {
    return {
      accepted: false,
      ...base,
      rejectStage: 'configuration',
      rejectReason: 'invalidFeatureObjectiveShiftLimit',
    }
  }

  const window = buildDynamicLocalSearchWindow(options)
  if (!window.accepted) {
    return {
      accepted: false,
      ...base,
      totalUncertaintyDeg: window.totalUncertaintyDeg,
      window,
      rejectStage: 'window',
      rejectReason: window.rejectReason,
    }
  }
  const scan = scanLocalObjective(window, objective)
  if (!scan.accepted) {
    return {
      accepted: false,
      ...base,
      totalUncertaintyDeg: window.totalUncertaintyDeg,
      window,
      scan,
      rejectStage: 'scan',
      rejectReason: scan.rejectReason,
    }
  }
  const refinement = refineLocalObjectiveWithGoldenSection(
    window,
    scan,
    objective,
    options.goldenRefinement
  )
  if (
    !refinement.accepted ||
    refinement.refinedAngleDeg === null ||
    refinement.refinedLoss === null
  ) {
    return {
      accepted: false,
      ...base,
      totalUncertaintyDeg: window.totalUncertaintyDeg,
      window,
      scan,
      refinement,
      rejectStage: 'refinement',
      rejectReason: refinement.rejectReason,
    }
  }

  const featureObjectiveShiftDeg = Math.abs(
    refinement.refinedAngleDeg - options.featureAngleDeg
  )
  const diagnostics = {
    featureAngleDeg: options.featureAngleDeg,
    refinedAngleDeg: refinement.refinedAngleDeg,
    featureObjectiveShiftDeg,
    finalLoss: refinement.refinedLoss,
    totalUncertaintyDeg: window.totalUncertaintyDeg,
    evidenceSources: base.evidenceSources,
    window,
    scan,
    refinement,
  }
  if (featureObjectiveShiftDeg > options.maximumFeatureObjectiveShiftDeg) {
    return {
      accepted: false,
      ...diagnostics,
      rejectStage: 'consistency',
      rejectReason: 'featureObjectiveConflict',
    }
  }
  return {
    accepted: true,
    ...diagnostics,
    rejectStage: null,
    rejectReason: null,
  }
}
