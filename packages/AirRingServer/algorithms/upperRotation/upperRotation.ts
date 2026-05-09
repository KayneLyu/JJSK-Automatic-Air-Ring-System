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

export { estimateThetaMaxWithPhaseCorrection } from './upperRotation.estimate'
