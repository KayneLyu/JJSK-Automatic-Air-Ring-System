export type {
  UpperRotationAdaptiveRules,
  UpperRotationAdaptiveRulesOverride,
  UpperRotationAdaptiveTuning,
  UpperRotationAdaptiveTuningOverride,
  UpperRotationDebugOptions,
  UpperRotationObjectiveMode,
  UpperRotationOffsetMode,
  UpperRotationStrategyProfile,
} from './upperRotation.config'

export {
  ADAPTIVE_RULES_BASE,
  ADAPTIVE_TUNING_DEFAULT,
  resolveAdaptiveRules,
} from './upperRotation.config'

export type {
  UpperRotationDetailedEstimate,
  UpperRotationEstimateDiagnostics,
  UpperRotationEstimateOptions,
  UpperRotationStrategyComparison,
} from './upperRotation.estimate'

export type {
  UpperRotationSearchBackend,
  UpperRotationSearchObjective,
  UpperRotationSearchRequest,
  UpperRotationSearchResult,
} from './upperRotation.searchBackend'

export type {
  NormalizedScannerProfile,
  ScannerProfileOptions,
  ScannerProfilePoint,
  ScannerProfileQuality,
} from './upperRotation.scanProfile'

export { normalizeScannerProfile } from './upperRotation.scanProfile'

export type {
  AngularVelocityAggregate,
  AngularVelocityAggregationOptions,
  AngularVelocityObservation,
  ExpectedRotationDirection,
} from './upperRotation.angularVelocity'

export {
  aggregateAngularVelocityObservations,
  calculateAngularVelocityObservation,
} from './upperRotation.angularVelocity'

export type {
  FeatureTrackingConfidenceEvidence,
  FeatureTrackingOptions,
  FeatureTrackingResult,
} from './upperRotation.featureTracking'

export { trackProfileShift } from './upperRotation.featureTracking'

export type {
  ZnccOptions,
  ZnccResult,
  ZnccShiftScore,
} from './upperRotation.zncc'

export { calculateZncc } from './upperRotation.zncc'

export {
  compareUpperRotationStrategies,
  estimateThetaMaxWithPhaseCorrection,
  estimateThetaMaxWithPhaseCorrectionDetailed,
} from './upperRotation.estimate'

export { createUpperRotationNativeSearchBackend } from './upperRotation.nativeBackend'

export {
  createUpperRotationRustShadowFailure,
  runUpperRotationRustShadow,
  type RunUpperRotationRustShadowOptions,
  type UpperRotationNativeBinding,
  type UpperRotationRustShadowStatus,
  type UpperRotationRustShadowTelemetry,
} from './upperRotation.nativeShadow'
