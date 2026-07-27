/**
 * 上旋相关算法配置与规则
 */

export type UpperRotationObjectiveMode = 'auto' | 'direct' | 'expanded'
export type UpperRotationOffsetMode =
  | 'auto'
  | 'globalPulse'
  | 'groupPulse'
  | 'time'

export type UpperRotationStrategyProfile = 'generic' | 'datasetTuned2026Q1'

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type UpperRotationDebugOptions = {
  objectiveMode?: UpperRotationObjectiveMode
  offsetMode?: UpperRotationOffsetMode
  /** 强制指定加速段时长（毫秒），用于诊断 RC-2 accelRatio 影响 */
  accelDecelMs?: number
  /**
   * 策略配置：
   * - generic: 通用优先，不启用历史数据集定向修正
   * - datasetTuned2026Q1: 启用历史数据集定向修正分支
   *
   * 迁移期间默认保持 datasetTuned2026Q1，以避免未验收前改变生产结果。
   */
  strategyProfile?: UpperRotationStrategyProfile
}

export type UpperRotationAdaptiveTuning = {
  /** 低角度 H1 融合权重 */
  lowAngleBlendH1: number
  /** 低角度 H2 融合权重 */
  lowAngleBlendH2: number
  /** 质量严格度（>1 更严格，<1 更宽松） */
  qualityTightness: number
  /** 高角度 shift 窗口偏移（度） */
  highAngleShiftBiasDeg: number
  /** 允许启用低角度修正的数据量上限 */
  maxAdaptivePoints: number
}

export type UpperRotationAdaptiveTuningOverride =
  Partial<UpperRotationAdaptiveTuning>

const HIGH_ANGLE_DIVERGENCE_BASE_DEG = 330
const HIGH_ANGLE_DIVERGENCE_MARGIN_DEG = 3
const SOLUTION_GAP_THRESHOLD_DEG = 15 // 提高门槛：高角度分歧判定更严格
const DIRECT_ACCEPT_LOSS_RATIO = 1.0 // 收紧容差：direct 损失值不能更高
const DIRECT_BOUNDARY_GUARD_DEG = 10
const CHALLENGER_MAX_POINTS = 40000
const SEARCH_MAX_POINTS = 100000

export const ADAPTIVE_RULES_BASE = {
  lowAngle: {
    thetaUpperBound: 315,
    maxPointsForEnable: 20000,
    h1: {
      groupDefaultUpperBound: 315,
      groupFastLowerBound: 342,
      fastVsAutoMinGap: 30,
      blendFactor: 0.72,
    },
    h2: {
      groupDefaultLowerBound: 330,
      covP10Min: 0.94,
      covP10Max: 0.95,
      narrowRateMin: 0.06,
      narrowRateMax: 0.1,
      blendFactor: 0.44,
    },
  },
  highAngle: {
    c5: {
      minValidGroups: 20,
      thetaShiftMinExclusive: 18,
      thetaShiftMaxInclusive: 22,
      covP10Min: 0.94,
      covP10MaxExclusive: 0.975,
      narrowRateMaxExclusive: 0.06,
      minLossGain: 0.0005,
    },
    overEstimationCorrection: {
      minValidGroups: 20,
      bestThetaLowerBound: 330,
      groupThetaLowerBound: 350,
      groupBestShiftMinExclusive: 20,
      covP10Min: 0.94,
      narrowRateMaxExclusive: 0.06,
      forcedAccelMs: 12000,
      targetThetaMin: 315,
      targetThetaMax: 325,
      minDownShift: 8,
    },
  },
}

export const ADAPTIVE_TUNING_DEFAULT: UpperRotationAdaptiveTuning = {
  lowAngleBlendH1: 0.72,
  lowAngleBlendH2: 0.44,
  qualityTightness: 1,
  highAngleShiftBiasDeg: 0,
  maxAdaptivePoints: 20000,
}

export type UpperRotationAdaptiveRules = typeof ADAPTIVE_RULES_BASE
export type UpperRotationAdaptiveRulesOverride =
  DeepPartial<UpperRotationAdaptiveRules>

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const deriveAdaptiveRulesFromTuning = (
  tuning: UpperRotationAdaptiveTuning
): UpperRotationAdaptiveRules => {
  const quality = clamp(tuning.qualityTightness, 0.8, 1.2)
  const shiftBias = clamp(tuning.highAngleShiftBiasDeg, -2, 2)
  return {
    lowAngle: {
      ...ADAPTIVE_RULES_BASE.lowAngle,
      maxPointsForEnable: Math.round(
        clamp(tuning.maxAdaptivePoints, 5000, 100000)
      ),
      h1: {
        ...ADAPTIVE_RULES_BASE.lowAngle.h1,
        blendFactor: clamp(tuning.lowAngleBlendH1, 0.5, 0.9),
      },
      h2: {
        ...ADAPTIVE_RULES_BASE.lowAngle.h2,
        blendFactor: clamp(tuning.lowAngleBlendH2, 0.3, 0.7),
        covP10Min: ADAPTIVE_RULES_BASE.lowAngle.h2.covP10Min * quality,
        covP10Max:
          ADAPTIVE_RULES_BASE.lowAngle.h2.covP10Max + (quality - 1) * 0.005,
        narrowRateMin:
          ADAPTIVE_RULES_BASE.lowAngle.h2.narrowRateMin * (2 - quality),
        narrowRateMax:
          ADAPTIVE_RULES_BASE.lowAngle.h2.narrowRateMax * (2 - quality),
      },
    },
    highAngle: {
      c5: {
        ...ADAPTIVE_RULES_BASE.highAngle.c5,
        thetaShiftMinExclusive:
          ADAPTIVE_RULES_BASE.highAngle.c5.thetaShiftMinExclusive + shiftBias,
        thetaShiftMaxInclusive:
          ADAPTIVE_RULES_BASE.highAngle.c5.thetaShiftMaxInclusive + shiftBias,
        covP10Min: ADAPTIVE_RULES_BASE.highAngle.c5.covP10Min * quality,
        narrowRateMaxExclusive:
          ADAPTIVE_RULES_BASE.highAngle.c5.narrowRateMaxExclusive /
          Math.max(quality, 0.1),
        minLossGain: ADAPTIVE_RULES_BASE.highAngle.c5.minLossGain * quality,
      },
      overEstimationCorrection: {
        ...ADAPTIVE_RULES_BASE.highAngle.overEstimationCorrection,
        covP10Min:
          ADAPTIVE_RULES_BASE.highAngle.overEstimationCorrection.covP10Min *
          quality,
        narrowRateMaxExclusive:
          ADAPTIVE_RULES_BASE.highAngle.overEstimationCorrection
            .narrowRateMaxExclusive / Math.max(quality, 0.1),
      },
    },
  }
}

export const resolveAdaptiveRules = (
  override?: UpperRotationAdaptiveRulesOverride,
  tuningOverride?: UpperRotationAdaptiveTuningOverride
): UpperRotationAdaptiveRules => {
  const tuning: UpperRotationAdaptiveTuning = {
    ...ADAPTIVE_TUNING_DEFAULT,
    ...(tuningOverride ?? {}),
  }
  const derived = deriveAdaptiveRulesFromTuning(tuning)
  if (!override) return derived
  return {
    lowAngle: {
      ...derived.lowAngle,
      ...(override.lowAngle ?? {}),
      h1: {
        ...derived.lowAngle.h1,
        ...(override.lowAngle?.h1 ?? {}),
      },
      h2: {
        ...derived.lowAngle.h2,
        ...(override.lowAngle?.h2 ?? {}),
      },
    },
    highAngle: {
      ...derived.highAngle,
      ...(override.highAngle ?? {}),
      c5: {
        ...derived.highAngle.c5,
        ...(override.highAngle?.c5 ?? {}),
      },
      overEstimationCorrection: {
        ...derived.highAngle.overEstimationCorrection,
        ...(override.highAngle?.overEstimationCorrection ?? {}),
      },
    },
  }
}

export const upperRotationRuntimeLimits = {
  HIGH_ANGLE_DIVERGENCE_BASE_DEG,
  HIGH_ANGLE_DIVERGENCE_MARGIN_DEG,
  SOLUTION_GAP_THRESHOLD_DEG,
  DIRECT_ACCEPT_LOSS_RATIO,
  DIRECT_BOUNDARY_GUARD_DEG,
  CHALLENGER_MAX_POINTS,
  SEARCH_MAX_POINTS,
}
