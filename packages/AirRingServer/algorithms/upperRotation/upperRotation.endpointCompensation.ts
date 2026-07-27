export type LinearEndpointCompensationOptions = {
  constantAngularSpeedDegPerSecond: number
  halfTripDurationMs: number
  accelerationDurationMs: number
  decelerationDurationMs: number
  minimumAngleDeg: number
  maximumAngleDeg: number
}

export type LinearEndpointCompensationResult = {
  accepted: boolean
  constantAngularSpeedDegPerSecond: number | null
  halfTripDurationMs: number | null
  accelerationDurationMs: number | null
  constantSpeedDurationMs: number | null
  decelerationDurationMs: number | null
  accelerationAngleDeg: number | null
  constantSpeedAngleDeg: number | null
  decelerationAngleDeg: number | null
  maximumAngleDeg: number | null
  rejectReason:
    | 'invalidPhysicalInputs'
    | 'invalidAngleRange'
    | 'noConstantSpeedInterval'
    | 'angleOutOfRange'
    | null
}

export type LinearEndpointSensitivityOptions = {
  baseline: LinearEndpointCompensationOptions
  accelerationVariationMs: number
  decelerationVariationMs: number
}

export type LinearEndpointSensitivityResult = {
  accepted: boolean
  baselineAngleDeg: number | null
  angleChangePerAccelerationMsDeg: number | null
  angleChangePerDecelerationMsDeg: number | null
  accelerationVariationAngleImpactDeg: number | null
  decelerationVariationAngleImpactDeg: number | null
  combinedVariationAngleImpactDeg: number | null
  minimumAngleDeg: number | null
  maximumAngleDeg: number | null
  angleSpanDeg: number | null
  rejectReason:
    | 'invalidBaseline'
    | 'invalidVariation'
    | 'noConstantSpeedIntervalUnderVariation'
    | 'perturbedAngleOutOfRange'
    | null
}

export type EndpointTimingEvidence = {
  source:
    | 'deviceConfiguration'
    | 'measuredMotorFrequency'
    | 'simulation'
    | 'historicalHeuristic'
  provenanceId: string
  accelerationDurationMs: number
  decelerationDurationMs: number
  measuredSampleCount?: number
  observedMaximumFrequency?: number
  frequencyUnitConfirmed?: boolean
}

export type TrustedEndpointTimingResult = {
  accepted: boolean
  source: EndpointTimingEvidence['source'] | null
  provenanceId: string | null
  accelerationDurationMs: number | null
  decelerationDurationMs: number | null
  rejectReason:
    | 'untrustedSource'
    | 'missingProvenance'
    | 'invalidDurations'
    | 'insufficientMeasurementEvidence'
    | null
}

/**
 * 验证端部时间是否来自可追溯的生产证据。
 * 仿真参数和历史启发式只可用于离线分析，不能进入生产候选计算。
 */
export const resolveTrustedEndpointTiming = (
  evidence: EndpointTimingEvidence
): TrustedEndpointTimingResult => {
  const rejected = (
    rejectReason: Exclude<TrustedEndpointTimingResult['rejectReason'], null>
  ): TrustedEndpointTimingResult => ({
    accepted: false,
    source: evidence.source,
    provenanceId: evidence.provenanceId || null,
    accelerationDurationMs: null,
    decelerationDurationMs: null,
    rejectReason,
  })

  if (
    evidence.source !== 'deviceConfiguration' &&
    evidence.source !== 'measuredMotorFrequency'
  ) {
    return rejected('untrustedSource')
  }
  if (evidence.provenanceId.trim().length === 0) {
    return rejected('missingProvenance')
  }
  if (
    !Number.isFinite(evidence.accelerationDurationMs) ||
    evidence.accelerationDurationMs < 0 ||
    !Number.isFinite(evidence.decelerationDurationMs) ||
    evidence.decelerationDurationMs < 0
  ) {
    return rejected('invalidDurations')
  }
  if (
    evidence.source === 'measuredMotorFrequency' &&
    (!Number.isInteger(evidence.measuredSampleCount) ||
      (evidence.measuredSampleCount as number) < 2 ||
      !Number.isFinite(evidence.observedMaximumFrequency) ||
      (evidence.observedMaximumFrequency as number) <= 0 ||
      evidence.frequencyUnitConfirmed !== true)
  ) {
    return rejected('insufficientMeasurementEvidence')
  }

  return {
    accepted: true,
    source: evidence.source,
    provenanceId: evidence.provenanceId,
    accelerationDurationMs: evidence.accelerationDurationMs,
    decelerationDurationMs: evidence.decelerationDurationMs,
    rejectReason: null,
  }
}

const rejectedResult = (
  rejectReason: Exclude<LinearEndpointCompensationResult['rejectReason'], null>
): LinearEndpointCompensationResult => ({
  accepted: false,
  constantAngularSpeedDegPerSecond: null,
  halfTripDurationMs: null,
  accelerationDurationMs: null,
  constantSpeedDurationMs: null,
  decelerationDurationMs: null,
  accelerationAngleDeg: null,
  constantSpeedAngleDeg: null,
  decelerationAngleDeg: null,
  maximumAngleDeg: null,
  rejectReason,
})

/**
 * 依据线性加速、匀速、线性减速模型计算单程最大角度候选。
 * 所有物理时间与合法角度范围必须由调用方显式提供。
 */
export const calculateLinearEndpointCompensatedAngle = ({
  constantAngularSpeedDegPerSecond,
  halfTripDurationMs,
  accelerationDurationMs,
  decelerationDurationMs,
  minimumAngleDeg,
  maximumAngleDeg,
}: LinearEndpointCompensationOptions): LinearEndpointCompensationResult => {
  if (
    !Number.isFinite(constantAngularSpeedDegPerSecond) ||
    constantAngularSpeedDegPerSecond <= 0 ||
    !Number.isFinite(halfTripDurationMs) ||
    halfTripDurationMs <= 0 ||
    !Number.isFinite(accelerationDurationMs) ||
    accelerationDurationMs < 0 ||
    !Number.isFinite(decelerationDurationMs) ||
    decelerationDurationMs < 0
  ) {
    return rejectedResult('invalidPhysicalInputs')
  }
  if (
    !Number.isFinite(minimumAngleDeg) ||
    !Number.isFinite(maximumAngleDeg) ||
    minimumAngleDeg < 0 ||
    maximumAngleDeg <= minimumAngleDeg
  ) {
    return rejectedResult('invalidAngleRange')
  }

  const constantSpeedDurationMs =
    halfTripDurationMs - accelerationDurationMs - decelerationDurationMs
  if (constantSpeedDurationMs <= 0) {
    return rejectedResult('noConstantSpeedInterval')
  }

  const speedDegPerMs = constantAngularSpeedDegPerSecond / 1000
  const accelerationAngleDeg = speedDegPerMs * accelerationDurationMs * 0.5
  const constantSpeedAngleDeg = speedDegPerMs * constantSpeedDurationMs
  const decelerationAngleDeg = speedDegPerMs * decelerationDurationMs * 0.5
  const maximumAngle =
    accelerationAngleDeg + constantSpeedAngleDeg + decelerationAngleDeg
  const diagnostics = {
    constantAngularSpeedDegPerSecond,
    halfTripDurationMs,
    accelerationDurationMs,
    constantSpeedDurationMs,
    decelerationDurationMs,
    accelerationAngleDeg,
    constantSpeedAngleDeg,
    decelerationAngleDeg,
    maximumAngleDeg: maximumAngle,
  }

  if (maximumAngle < minimumAngleDeg || maximumAngle > maximumAngleDeg) {
    return {
      accepted: false,
      ...diagnostics,
      rejectReason: 'angleOutOfRange',
    }
  }
  return {
    accepted: true,
    ...diagnostics,
    rejectReason: null,
  }
}

/**
 * 分析端部时间对线性补偿角度的解析敏感性。
 * 扰动范围由调用方提供，并同时验证增减扰动后的物理边界。
 */
export const analyzeLinearEndpointSensitivity = ({
  baseline,
  accelerationVariationMs,
  decelerationVariationMs,
}: LinearEndpointSensitivityOptions): LinearEndpointSensitivityResult => {
  const rejectedResult = (
    rejectReason: Exclude<LinearEndpointSensitivityResult['rejectReason'], null>
  ): LinearEndpointSensitivityResult => ({
    accepted: false,
    baselineAngleDeg: null,
    angleChangePerAccelerationMsDeg: null,
    angleChangePerDecelerationMsDeg: null,
    accelerationVariationAngleImpactDeg: null,
    decelerationVariationAngleImpactDeg: null,
    combinedVariationAngleImpactDeg: null,
    minimumAngleDeg: null,
    maximumAngleDeg: null,
    angleSpanDeg: null,
    rejectReason,
  })
  const baselineResult = calculateLinearEndpointCompensatedAngle(baseline)
  if (!baselineResult.accepted || baselineResult.maximumAngleDeg === null) {
    return rejectedResult('invalidBaseline')
  }
  if (
    !Number.isFinite(accelerationVariationMs) ||
    accelerationVariationMs < 0 ||
    accelerationVariationMs > baseline.accelerationDurationMs ||
    !Number.isFinite(decelerationVariationMs) ||
    decelerationVariationMs < 0 ||
    decelerationVariationMs > baseline.decelerationDurationMs
  ) {
    return rejectedResult('invalidVariation')
  }
  if (
    baseline.accelerationDurationMs +
      accelerationVariationMs +
      baseline.decelerationDurationMs +
      decelerationVariationMs >=
    baseline.halfTripDurationMs
  ) {
    return rejectedResult('noConstantSpeedIntervalUnderVariation')
  }

  const angleChangePerEndpointMsDeg =
    -baseline.constantAngularSpeedDegPerSecond / 2000
  const accelerationVariationAngleImpactDeg =
    Math.abs(angleChangePerEndpointMsDeg) * accelerationVariationMs
  const decelerationVariationAngleImpactDeg =
    Math.abs(angleChangePerEndpointMsDeg) * decelerationVariationMs
  const combinedVariationAngleImpactDeg =
    accelerationVariationAngleImpactDeg + decelerationVariationAngleImpactDeg
  const minimumAngleDeg =
    baselineResult.maximumAngleDeg - combinedVariationAngleImpactDeg
  const maximumAngleDeg =
    baselineResult.maximumAngleDeg + combinedVariationAngleImpactDeg
  const diagnostics = {
    baselineAngleDeg: baselineResult.maximumAngleDeg,
    angleChangePerAccelerationMsDeg: angleChangePerEndpointMsDeg,
    angleChangePerDecelerationMsDeg: angleChangePerEndpointMsDeg,
    accelerationVariationAngleImpactDeg,
    decelerationVariationAngleImpactDeg,
    combinedVariationAngleImpactDeg,
    minimumAngleDeg,
    maximumAngleDeg,
    angleSpanDeg: maximumAngleDeg - minimumAngleDeg,
  }
  if (
    minimumAngleDeg < baseline.minimumAngleDeg ||
    maximumAngleDeg > baseline.maximumAngleDeg
  ) {
    return {
      accepted: false,
      ...diagnostics,
      rejectReason: 'perturbedAngleOutOfRange',
    }
  }
  return {
    accepted: true,
    ...diagnostics,
    rejectReason: null,
  }
}
