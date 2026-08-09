export {
  createCalibrationSession,
  calibrateTractionSpeed,
  calibrateMutationWindowSize,
  detectMutation,
  calibrateDistance,
  buildTripSegments,
  calibrateMaxAngle,
  type CalibrateResult,
  type CalibrateNextResult,
  type PendingAngleEstimate,
  type CreateCalibrationSessionOptions,
} from './controllers/calibration'
export { buildTripSegment } from './algorithms/buildTripSegment'
export {
  createS7Connector,
  S7Connector,
  type S7ConnectorOptions,
} from './connections/base/s7'

export {
  createUpperRotationS7Connection,
  type UpperRotationS7ConnectionOptions,
} from './connections/airRing/s7'
export type { RingData } from './connections/airRing/types'
export type { ThicknessData } from './connections/thickness/types'
export type { CalibrationConfig, Scalar, TripSegment } from './types'
export {
  estimateThetaMaxWithPhaseCorrection,
  estimateThetaMaxWithPhaseCorrectionDetailed,
  createUpperRotationNativeSearchBackend,
  createUpperRotationRustShadowFailure,
  runUpperRotationRustShadow,
  type UpperRotationNativeBinding,
  type UpperRotationSearchBackend,
  type UpperRotationRustShadowTelemetry,
  type UpperRotationAdaptiveRulesOverride,
  type UpperRotationAdaptiveTuningOverride,
  type UpperRotationDebugOptions,
  type UpperRotationObjectiveMode,
  type UpperRotationOffsetMode,
  type UpperRotationStrategyProfile,
} from './algorithms/upperRotation/upperRotation'
export { detectBimodalThreshold } from './algorithms/buildTripSegment'
