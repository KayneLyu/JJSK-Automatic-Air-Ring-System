import type {
  FeatureTrackingConfidenceEvidence,
  FeatureTrackingConfidenceEvaluation,
  FeatureTrackingConfidenceLimits,
  FeatureTrackingConfidenceViolation,
  FeatureTrackingResult,
} from './upperRotation.featureTracking'
import { evaluateFeatureTrackingConfidence } from './upperRotation.featureTracking'

export type ExpectedRotationDirection = 'positive' | 'negative'

export type AngularVelocityObservation = {
  accepted: boolean
  expectedDirection: ExpectedRotationDirection
  elapsedMs: number | null
  angleDeltaDeg: number | null
  angularVelocityDegPerSecond: number | null
  speedMagnitudeDegPerSecond: number | null
  confidenceEvidence: FeatureTrackingConfidenceEvidence | null
  confidenceViolations: FeatureTrackingConfidenceViolation[]
  trackingRejectReason: FeatureTrackingResult['rejectReason']
  rejectReason:
    | 'trackingRejected'
    | 'invalidTrackingResult'
    | 'invalidConfidenceEvidence'
    | 'invalidConfidenceLimits'
    | 'lowConfidence'
    | 'directionConflict'
    | null
}

export type AngularVelocityAggregationOptions = {
  minimumAcceptedObservations: number
}

export type TimedAngularVelocityObservation = {
  referenceTimestampMs: number
  candidateTimestampMs: number
  observation: AngularVelocityObservation
}

export type SteadyStateObservationOptions = {
  tripStartTimestampMs: number
  tripEndTimestampMs: number
  startExclusionMs: number
  endExclusionMs: number
}

export type SteadyStateObservationSelection = {
  accepted: boolean
  steadyStartTimestampMs: number | null
  steadyEndTimestampMs: number | null
  inputCount: number
  selectedCount: number
  excludedNearReversalCount: number
  excludedOutsideTripCount: number
  excludedInvalidTimingCount: number
  observations: AngularVelocityObservation[]
  rejectReason: 'invalidOptions' | 'emptySteadyWindow' | null
}

export type AngularVelocityAggregate = {
  accepted: boolean
  direction: ExpectedRotationDirection | null
  inputCount: number
  acceptedCount: number
  rejectedCount: number
  medianAngularVelocityDegPerSecond: number | null
  medianSpeedMagnitudeDegPerSecond: number | null
  medianAbsoluteDeviationDegPerSecond: number | null
  relativeMedianAbsoluteDeviation: number | null
  maximumAbsoluteDeviationDegPerSecond: number | null
  rejectReason:
    | 'invalidOptions'
    | 'insufficientObservations'
    | 'mixedDirections'
    | null
}

export type AngularVelocityStabilityLimits = {
  maximumRelativeMedianAbsoluteDeviation: number
  maximumAbsoluteDeviationDegPerSecond: number
}

export type AngularVelocityStabilityViolation =
  | 'relativeMedianAbsoluteDeviation'
  | 'maximumAbsoluteDeviationDegPerSecond'

export type AngularVelocityStabilityEvaluation = {
  accepted: boolean
  relativeMedianAbsoluteDeviation: number | null
  maximumRelativeMedianAbsoluteDeviation: number | null
  maximumAbsoluteDeviationDegPerSecond: number | null
  allowedMaximumAbsoluteDeviationDegPerSecond: number | null
  violations: AngularVelocityStabilityViolation[]
  rejectReason: 'invalidAggregate' | 'invalidLimits' | 'unstableVelocity' | null
}

export type BidirectionalVelocityConsistencyLimits = {
  maximumAbsoluteDifferenceDegPerSecond: number
  maximumRelativeDifference: number
}

export type BidirectionalVelocityConsistencyViolation =
  | 'absoluteDifferenceDegPerSecond'
  | 'relativeDifference'

export type BidirectionalVelocityConsistencyEvaluation = {
  accepted: boolean
  positiveSpeedMagnitudeDegPerSecond: number | null
  negativeSpeedMagnitudeDegPerSecond: number | null
  absoluteDifferenceDegPerSecond: number | null
  relativeDifference: number | null
  maximumAbsoluteDifferenceDegPerSecond: number | null
  maximumRelativeDifference: number | null
  violations: BidirectionalVelocityConsistencyViolation[]
  rejectReason:
    | 'invalidAggregate'
    | 'sameDirection'
    | 'invalidLimits'
    | 'inconsistentVelocity'
    | null
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * 仅保留完整位于行程稳态时间窗内的角速度观测。
 * 端部排除时间必须由调用方根据设备配置或独立实测显式提供。
 */
export const selectSteadyStateAngularVelocityObservations = (
  timedObservations: readonly TimedAngularVelocityObservation[],
  {
    tripStartTimestampMs,
    tripEndTimestampMs,
    startExclusionMs,
    endExclusionMs,
  }: SteadyStateObservationOptions
): SteadyStateObservationSelection => {
  const rejectedResult = (
    rejectReason: Exclude<SteadyStateObservationSelection['rejectReason'], null>
  ): SteadyStateObservationSelection => ({
    accepted: false,
    steadyStartTimestampMs: null,
    steadyEndTimestampMs: null,
    inputCount: timedObservations.length,
    selectedCount: 0,
    excludedNearReversalCount: 0,
    excludedOutsideTripCount: 0,
    excludedInvalidTimingCount: 0,
    observations: [],
    rejectReason,
  })

  if (
    !Number.isFinite(tripStartTimestampMs) ||
    !Number.isFinite(tripEndTimestampMs) ||
    tripEndTimestampMs <= tripStartTimestampMs ||
    !Number.isFinite(startExclusionMs) ||
    startExclusionMs < 0 ||
    !Number.isFinite(endExclusionMs) ||
    endExclusionMs < 0
  ) {
    return rejectedResult('invalidOptions')
  }

  const steadyStartTimestampMs = tripStartTimestampMs + startExclusionMs
  const steadyEndTimestampMs = tripEndTimestampMs - endExclusionMs
  if (steadyEndTimestampMs <= steadyStartTimestampMs) {
    return rejectedResult('emptySteadyWindow')
  }

  const observations: AngularVelocityObservation[] = []
  let excludedNearReversalCount = 0
  let excludedOutsideTripCount = 0
  let excludedInvalidTimingCount = 0
  for (const timedObservation of timedObservations) {
    const { referenceTimestampMs, candidateTimestampMs } = timedObservation
    if (
      !Number.isFinite(referenceTimestampMs) ||
      !Number.isFinite(candidateTimestampMs) ||
      candidateTimestampMs <= referenceTimestampMs
    ) {
      excludedInvalidTimingCount++
    } else if (
      referenceTimestampMs < tripStartTimestampMs ||
      candidateTimestampMs > tripEndTimestampMs
    ) {
      excludedOutsideTripCount++
    } else if (
      referenceTimestampMs < steadyStartTimestampMs ||
      candidateTimestampMs > steadyEndTimestampMs
    ) {
      excludedNearReversalCount++
    } else {
      observations.push(timedObservation.observation)
    }
  }

  return {
    accepted: true,
    steadyStartTimestampMs,
    steadyEndTimestampMs,
    inputCount: timedObservations.length,
    selectedCount: observations.length,
    excludedNearReversalCount,
    excludedOutsideTripCount,
    excludedInvalidTimingCount,
    observations,
    rejectReason: null,
  }
}

/**
 * 从一次已接受的特征位移计算有符号角速度，并与换向信号方向核对。
 * 方向冲突时保留原始观测用于诊断，不强制翻转符号。
 */
export const calculateAngularVelocityObservation = (
  tracking: FeatureTrackingResult,
  expectedDirection: ExpectedRotationDirection,
  confidenceLimits?: FeatureTrackingConfidenceLimits
): AngularVelocityObservation => {
  if (!tracking.accepted) {
    return {
      accepted: false,
      expectedDirection,
      elapsedMs: tracking.elapsedMs,
      angleDeltaDeg: tracking.angleDeltaDeg,
      angularVelocityDegPerSecond: null,
      speedMagnitudeDegPerSecond: null,
      confidenceEvidence: tracking.confidenceEvidence,
      confidenceViolations: [],
      trackingRejectReason: tracking.rejectReason,
      rejectReason: 'trackingRejected',
    }
  }
  if (
    tracking.elapsedMs === null ||
    tracking.elapsedMs <= 0 ||
    tracking.angleDeltaDeg === null ||
    !Number.isFinite(tracking.angleDeltaDeg)
  ) {
    return {
      accepted: false,
      expectedDirection,
      elapsedMs: tracking.elapsedMs,
      angleDeltaDeg: tracking.angleDeltaDeg,
      angularVelocityDegPerSecond: null,
      speedMagnitudeDegPerSecond: null,
      confidenceEvidence: tracking.confidenceEvidence,
      confidenceViolations: [],
      trackingRejectReason: tracking.rejectReason,
      rejectReason: 'invalidTrackingResult',
    }
  }

  const confidenceEvaluation: FeatureTrackingConfidenceEvaluation | null =
    confidenceLimits === undefined
      ? null
      : tracking.confidenceEvidence === null
        ? { accepted: false, violations: [], rejectReason: 'invalidEvidence' }
        : evaluateFeatureTrackingConfidence(
            tracking.confidenceEvidence,
            confidenceLimits
          )
  if (confidenceEvaluation !== null && !confidenceEvaluation.accepted) {
    return {
      accepted: false,
      expectedDirection,
      elapsedMs: tracking.elapsedMs,
      angleDeltaDeg: tracking.angleDeltaDeg,
      angularVelocityDegPerSecond: null,
      speedMagnitudeDegPerSecond: null,
      confidenceEvidence: tracking.confidenceEvidence,
      confidenceViolations: confidenceEvaluation.violations,
      trackingRejectReason: tracking.rejectReason,
      rejectReason:
        confidenceEvaluation.rejectReason === 'lowConfidence'
          ? 'lowConfidence'
          : confidenceEvaluation.rejectReason === 'invalidEvidence'
            ? 'invalidConfidenceEvidence'
            : 'invalidConfidenceLimits',
    }
  }

  const angularVelocityDegPerSecond =
    tracking.angleDeltaDeg / (tracking.elapsedMs / 1000)
  const directionMatches =
    expectedDirection === 'positive'
      ? angularVelocityDegPerSecond > 0
      : angularVelocityDegPerSecond < 0
  return {
    accepted: directionMatches,
    expectedDirection,
    elapsedMs: tracking.elapsedMs,
    angleDeltaDeg: tracking.angleDeltaDeg,
    angularVelocityDegPerSecond,
    speedMagnitudeDegPerSecond: Math.abs(angularVelocityDegPerSecond),
    confidenceEvidence: tracking.confidenceEvidence,
    confidenceViolations: [],
    trackingRejectReason: tracking.rejectReason,
    rejectReason: directionMatches ? null : 'directionConflict',
  }
}

/**
 * 使用中位数聚合方向一致的已接受角速度，并输出 MAD 离散度诊断。
 * 本函数不按固定倍数删除离群值，也不内置最少样本数。
 */
export const aggregateAngularVelocityObservations = (
  observations: readonly AngularVelocityObservation[],
  { minimumAcceptedObservations }: AngularVelocityAggregationOptions
): AngularVelocityAggregate => {
  const emptyResult = (
    rejectReason: Exclude<AngularVelocityAggregate['rejectReason'], null>,
    acceptedCount = 0
  ): AngularVelocityAggregate => ({
    accepted: false,
    direction: null,
    inputCount: observations.length,
    acceptedCount,
    rejectedCount: observations.length - acceptedCount,
    medianAngularVelocityDegPerSecond: null,
    medianSpeedMagnitudeDegPerSecond: null,
    medianAbsoluteDeviationDegPerSecond: null,
    relativeMedianAbsoluteDeviation: null,
    maximumAbsoluteDeviationDegPerSecond: null,
    rejectReason,
  })

  if (
    !Number.isInteger(minimumAcceptedObservations) ||
    minimumAcceptedObservations < 1
  ) {
    return emptyResult('invalidOptions')
  }
  const accepted = observations.filter(
    (observation) =>
      observation.accepted &&
      observation.angularVelocityDegPerSecond !== null &&
      Number.isFinite(observation.angularVelocityDegPerSecond)
  )
  if (accepted.length < minimumAcceptedObservations) {
    return emptyResult('insufficientObservations', accepted.length)
  }
  const directions = new Set(
    accepted.map((observation) => observation.expectedDirection)
  )
  if (directions.size !== 1) {
    return emptyResult('mixedDirections', accepted.length)
  }

  const velocities = accepted.map(
    (observation) => observation.angularVelocityDegPerSecond as number
  )
  const magnitudes = velocities.map(Math.abs)
  const medianVelocity = median(velocities)
  const medianMagnitude = median(magnitudes)
  const deviations = magnitudes.map((value) =>
    Math.abs(value - medianMagnitude)
  )
  const medianAbsoluteDeviation = median(deviations)
  return {
    accepted: true,
    direction: accepted[0].expectedDirection,
    inputCount: observations.length,
    acceptedCount: accepted.length,
    rejectedCount: observations.length - accepted.length,
    medianAngularVelocityDegPerSecond: medianVelocity,
    medianSpeedMagnitudeDegPerSecond: medianMagnitude,
    medianAbsoluteDeviationDegPerSecond: medianAbsoluteDeviation,
    relativeMedianAbsoluteDeviation:
      medianMagnitude === 0 ? null : medianAbsoluteDeviation / medianMagnitude,
    maximumAbsoluteDeviationDegPerSecond: Math.max(...deviations),
    rejectReason: null,
  }
}

/**
 * 使用调用方显式提供的设备容差评价聚合角速度是否稳定。
 * 本层不提供默认容差，也不从历史角度标签推导阈值。
 */
export const evaluateAngularVelocityStability = (
  aggregate: AngularVelocityAggregate,
  {
    maximumRelativeMedianAbsoluteDeviation,
    maximumAbsoluteDeviationDegPerSecond:
      allowedMaximumAbsoluteDeviationDegPerSecond,
  }: AngularVelocityStabilityLimits
): AngularVelocityStabilityEvaluation => {
  const rejectedResult = (
    rejectReason: 'invalidAggregate' | 'invalidLimits'
  ): AngularVelocityStabilityEvaluation => ({
    accepted: false,
    relativeMedianAbsoluteDeviation: aggregate.relativeMedianAbsoluteDeviation,
    maximumRelativeMedianAbsoluteDeviation: null,
    maximumAbsoluteDeviationDegPerSecond:
      aggregate.maximumAbsoluteDeviationDegPerSecond,
    allowedMaximumAbsoluteDeviationDegPerSecond: null,
    violations: [],
    rejectReason,
  })

  if (
    !aggregate.accepted ||
    aggregate.relativeMedianAbsoluteDeviation === null ||
    !Number.isFinite(aggregate.relativeMedianAbsoluteDeviation) ||
    aggregate.maximumAbsoluteDeviationDegPerSecond === null ||
    !Number.isFinite(aggregate.maximumAbsoluteDeviationDegPerSecond)
  ) {
    return rejectedResult('invalidAggregate')
  }
  if (
    !Number.isFinite(maximumRelativeMedianAbsoluteDeviation) ||
    maximumRelativeMedianAbsoluteDeviation < 0 ||
    !Number.isFinite(allowedMaximumAbsoluteDeviationDegPerSecond) ||
    allowedMaximumAbsoluteDeviationDegPerSecond < 0
  ) {
    return rejectedResult('invalidLimits')
  }

  const violations: AngularVelocityStabilityViolation[] = []
  if (
    aggregate.relativeMedianAbsoluteDeviation >
    maximumRelativeMedianAbsoluteDeviation
  ) {
    violations.push('relativeMedianAbsoluteDeviation')
  }
  if (
    aggregate.maximumAbsoluteDeviationDegPerSecond >
    allowedMaximumAbsoluteDeviationDegPerSecond
  ) {
    violations.push('maximumAbsoluteDeviationDegPerSecond')
  }

  return {
    accepted: violations.length === 0,
    relativeMedianAbsoluteDeviation: aggregate.relativeMedianAbsoluteDeviation,
    maximumRelativeMedianAbsoluteDeviation,
    maximumAbsoluteDeviationDegPerSecond:
      aggregate.maximumAbsoluteDeviationDegPerSecond,
    allowedMaximumAbsoluteDeviationDegPerSecond,
    violations,
    rejectReason: violations.length === 0 ? null : 'unstableVelocity',
  }
}

/**
 * 比较正反向行程的匀速速度绝对值，并按调用方设备容差判断一致性。
 * 相对差使用双方速度绝对值的算术平均作为对称基准。
 */
export const evaluateBidirectionalVelocityConsistency = (
  first: AngularVelocityAggregate,
  second: AngularVelocityAggregate,
  {
    maximumAbsoluteDifferenceDegPerSecond,
    maximumRelativeDifference,
  }: BidirectionalVelocityConsistencyLimits
): BidirectionalVelocityConsistencyEvaluation => {
  const rejectedResult = (
    rejectReason: 'invalidAggregate' | 'sameDirection' | 'invalidLimits'
  ): BidirectionalVelocityConsistencyEvaluation => ({
    accepted: false,
    positiveSpeedMagnitudeDegPerSecond: null,
    negativeSpeedMagnitudeDegPerSecond: null,
    absoluteDifferenceDegPerSecond: null,
    relativeDifference: null,
    maximumAbsoluteDifferenceDegPerSecond: null,
    maximumRelativeDifference: null,
    violations: [],
    rejectReason,
  })
  const isValidAggregate = (aggregate: AngularVelocityAggregate): boolean =>
    aggregate.accepted &&
    aggregate.direction !== null &&
    aggregate.medianSpeedMagnitudeDegPerSecond !== null &&
    Number.isFinite(aggregate.medianSpeedMagnitudeDegPerSecond) &&
    aggregate.medianSpeedMagnitudeDegPerSecond > 0

  if (!isValidAggregate(first) || !isValidAggregate(second)) {
    return rejectedResult('invalidAggregate')
  }
  if (first.direction === second.direction) {
    return rejectedResult('sameDirection')
  }
  if (
    !Number.isFinite(maximumAbsoluteDifferenceDegPerSecond) ||
    maximumAbsoluteDifferenceDegPerSecond < 0 ||
    !Number.isFinite(maximumRelativeDifference) ||
    maximumRelativeDifference < 0
  ) {
    return rejectedResult('invalidLimits')
  }

  const positive = first.direction === 'positive' ? first : second
  const negative = first.direction === 'negative' ? first : second
  const positiveMagnitude = positive.medianSpeedMagnitudeDegPerSecond as number
  const negativeMagnitude = negative.medianSpeedMagnitudeDegPerSecond as number
  const absoluteDifference = Math.abs(positiveMagnitude - negativeMagnitude)
  const relativeDifference =
    absoluteDifference / ((positiveMagnitude + negativeMagnitude) / 2)
  const violations: BidirectionalVelocityConsistencyViolation[] = []
  if (absoluteDifference > maximumAbsoluteDifferenceDegPerSecond) {
    violations.push('absoluteDifferenceDegPerSecond')
  }
  if (relativeDifference > maximumRelativeDifference) {
    violations.push('relativeDifference')
  }

  return {
    accepted: violations.length === 0,
    positiveSpeedMagnitudeDegPerSecond: positiveMagnitude,
    negativeSpeedMagnitudeDegPerSecond: negativeMagnitude,
    absoluteDifferenceDegPerSecond: absoluteDifference,
    relativeDifference,
    maximumAbsoluteDifferenceDegPerSecond,
    maximumRelativeDifference,
    violations,
    rejectReason: violations.length === 0 ? null : 'inconsistentVelocity',
  }
}
