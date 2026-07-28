import {
  evaluateExpanded,
  type ExpandedPoint,
} from './upperRotation.evaluation'

export type ExpandedObjectiveSegment = {
  readonly data: readonly ExpandedPoint[]
  readonly duration: number
  readonly accelRatio: number
}

export type ExpandedObjectiveAdapterOptions = {
  readonly segments: readonly ExpandedObjectiveSegment[]
  readonly numberOfBins: number
  readonly minimumValidSegmentCount: number
  readonly minimumFinitePointCount: number
}

export type ExpandedObjectiveAdapterResult = {
  accepted: boolean
  objective: ((angleDeg: number) => number) | null
  inputSegmentCount: number
  validSegmentCount: number
  inputPointCount: number
  finitePointCount: number
  missingThicknessPointCount: number
  invalidPointCount: number
  rejectReason:
    | 'invalidOptions'
    | 'invalidSegment'
    | 'invalidPoint'
    | 'insufficientValidSegments'
    | 'insufficientFinitePoints'
    | null
}

/**
 * 将 expanded 行程只读地适配为通用局部精调目标函数，不修改生产搜索路径。
 */
export const createExpandedObjective = (
  options: ExpandedObjectiveAdapterOptions
): ExpandedObjectiveAdapterResult => {
  const inputSegmentCount = options.segments.length
  const inputPointCount = options.segments.reduce(
    (total, segment) => total + segment.data.length,
    0
  )
  const base = {
    objective: null,
    inputSegmentCount,
    validSegmentCount: 0,
    inputPointCount,
    finitePointCount: 0,
    missingThicknessPointCount: 0,
    invalidPointCount: 0,
  }
  if (
    !Number.isInteger(options.numberOfBins) ||
    options.numberOfBins < 2 ||
    !Number.isInteger(options.minimumValidSegmentCount) ||
    options.minimumValidSegmentCount < 1 ||
    !Number.isInteger(options.minimumFinitePointCount) ||
    options.minimumFinitePointCount < 2
  ) {
    return { accepted: false, ...base, rejectReason: 'invalidOptions' }
  }

  let finitePointCount = 0
  let missingThicknessPointCount = 0
  let invalidPointCount = 0
  const copiedSegments: {
    data: ExpandedPoint[]
    duration: number
    accelRatio: number
  }[] = []
  for (const segment of options.segments) {
    if (
      !Number.isFinite(segment.duration) ||
      segment.duration <= 0 ||
      !Number.isFinite(segment.accelRatio) ||
      segment.accelRatio < 0 ||
      segment.accelRatio >= 0.5 ||
      segment.data.length === 0
    ) {
      return {
        accepted: false,
        ...base,
        finitePointCount,
        missingThicknessPointCount,
        invalidPointCount,
        rejectReason: 'invalidSegment',
      }
    }

    const copiedPoints: ExpandedPoint[] = []
    for (const point of segment.data) {
      const missingThickness = Number.isNaN(point.y)
      if (
        !Number.isFinite(point.t) ||
        point.t < 0 ||
        point.t > segment.duration ||
        !Number.isFinite(point.offsetDeg) ||
        (!missingThickness && !Number.isFinite(point.y))
      ) {
        invalidPointCount++
        continue
      }
      copiedPoints.push({ ...point })
      if (missingThickness) missingThicknessPointCount++
      else finitePointCount++
    }
    copiedSegments.push({
      data: copiedPoints,
      duration: segment.duration,
      accelRatio: segment.accelRatio,
    })
  }

  const diagnostics = {
    ...base,
    validSegmentCount: copiedSegments.length,
    finitePointCount,
    missingThicknessPointCount,
    invalidPointCount,
  }
  if (invalidPointCount > 0) {
    return { accepted: false, ...diagnostics, rejectReason: 'invalidPoint' }
  }
  if (copiedSegments.length < options.minimumValidSegmentCount) {
    return {
      accepted: false,
      ...diagnostics,
      rejectReason: 'insufficientValidSegments',
    }
  }
  if (finitePointCount < options.minimumFinitePointCount) {
    return {
      accepted: false,
      ...diagnostics,
      rejectReason: 'insufficientFinitePoints',
    }
  }

  return {
    accepted: true,
    ...diagnostics,
    objective: (angleDeg: number) =>
      Number.isFinite(angleDeg)
        ? evaluateExpanded(copiedSegments, angleDeg, options.numberOfBins)
        : Infinity,
    rejectReason: null,
  }
}
