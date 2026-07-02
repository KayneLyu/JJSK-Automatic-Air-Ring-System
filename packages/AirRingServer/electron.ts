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
export {
  createS7Connector,
  S7Connector,
  type S7ConnectorOptions,
} from './connections/base/s7'
export {
  createThicknessS7Connection,
  type ThicknessS7ControlKey,
  type ThicknessS7ControlState,
  type ThicknessS7ConnectionOptions,
} from './connections/thickness/s7'
export {
  createUpperRotationS7Connection,
  type UpperRotationS7ConnectionOptions,
} from './connections/airRing/s7'
export {
  createThicknessBatchModbusConnection,
  type ThicknessBatchModbusConnectionOptions,
  parseThicknessBatchRegisters,
} from './connections/thickness/batchModbus'
export type { RingData } from './connections/airRing/types'
export type {
  ThicknessData,
  ThicknessBatchData,
} from './connections/thickness/types'
export type { CalibrationConfig, Scalar, TripSegment } from './types'
export {
  estimateThetaMaxWithPhaseCorrection,
  type UpperRotationAdaptiveRulesOverride,
  type UpperRotationAdaptiveTuningOverride,
  type UpperRotationDebugOptions,
  type UpperRotationObjectiveMode,
  type UpperRotationOffsetMode,
  type UpperRotationStrategyProfile,
} from './algorithms/upperRotation/upperRotation'
export { detectBimodalThreshold } from './algorithms/buildTripSegment'
