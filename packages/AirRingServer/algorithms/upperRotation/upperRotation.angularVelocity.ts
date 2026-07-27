import type {
  FeatureTrackingConfidenceEvidence,
  FeatureTrackingResult,
} from './upperRotation.featureTracking'

export type ExpectedRotationDirection = 'positive' | 'negative'

export type AngularVelocityObservation = {
  accepted: boolean
  expectedDirection: ExpectedRotationDirection
  elapsedMs: number | null
  angleDeltaDeg: number | null
  angularVelocityDegPerSecond: number | null
  speedMagnitudeDegPerSecond: number | null
  confidenceEvidence: FeatureTrackingConfidenceEvidence | null
  trackingRejectReason: FeatureTrackingResult['rejectReason']
  rejectReason:
    | 'trackingRejected'
    | 'invalidTrackingResult'
    | 'directionConflict'
    | null
}

export type AngularVelocityAggregationOptions = {
  minimumAcceptedObservations: number
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

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

/**
 * 从一次已接受的特征位移计算有符号角速度，并与换向信号方向核对。
 * 方向冲突时保留原始观测用于诊断，不强制翻转符号。
 */
export const calculateAngularVelocityObservation = (
  tracking: FeatureTrackingResult,
  expectedDirection: ExpectedRotationDirection
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
      trackingRejectReason: tracking.rejectReason,
      rejectReason: 'invalidTrackingResult',
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
