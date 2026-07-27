export type ScannerProfilePoint = {
  position: number
  value: number
}

export type ScannerProfileOptions = {
  positionRange: { min: number; max: number }
  sampleCount?: number
  minValidPoints?: number
  minCoverageRatio?: number
  edgeTrimRatio?: number
  detrend?: 'none' | 'mean' | 'linear'
  smoothingRadius?: number
}

export type ScannerProfileQuality = {
  inputCount: number
  validCount: number
  uniquePositionCount: number
  validRatio: number
  coverageRatio: number
  missingRatio: number
  inputDirection: 'increasing' | 'decreasing' | 'unknown'
}

export type NormalizedScannerProfile = {
  accepted: boolean
  positions: number[]
  values: number[]
  quality: ScannerProfileQuality
  rejectReason:
    | 'invalidPositionRange'
    | 'invalidSampleCount'
    | 'invalidPreprocessingOptions'
    | 'insufficientValidPoints'
    | 'insufficientCoverage'
    | null
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const emptyQuality = (inputCount: number): ScannerProfileQuality => ({
  inputCount,
  validCount: 0,
  uniquePositionCount: 0,
  validRatio: 0,
  coverageRatio: 0,
  missingRatio: 1,
  inputDirection: 'unknown',
})

const detectDirection = (
  points: readonly ScannerProfilePoint[]
): ScannerProfileQuality['inputDirection'] => {
  const first = points.find(
    (point) => Number.isFinite(point.position) && Number.isFinite(point.value)
  )
  let last: ScannerProfilePoint | undefined
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index]
    if (Number.isFinite(point.position) && Number.isFinite(point.value)) {
      last = point
      break
    }
  }
  if (!first || !last || first.position === last.position) return 'unknown'
  return last.position > first.position ? 'increasing' : 'decreasing'
}

const mergeDuplicatePositions = (
  points: ScannerProfilePoint[]
): ScannerProfilePoint[] => {
  const merged: ScannerProfilePoint[] = []
  let index = 0
  while (index < points.length) {
    const position = points[index].position
    let sum = 0
    let count = 0
    while (index < points.length && points[index].position === position) {
      sum += points[index].value
      count++
      index++
    }
    merged.push({ position, value: sum / count })
  }
  return merged
}

const demean = (values: readonly number[]): number[] => {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return [...values]
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length
  return values.map((value) => (Number.isFinite(value) ? value - mean : NaN))
}

const removeLinearTrend = (
  positions: readonly number[],
  values: readonly number[]
): number[] => {
  const finiteIndices = values
    .map((value, index) => (Number.isFinite(value) ? index : -1))
    .filter((index) => index >= 0)
  if (finiteIndices.length < 2) return demean(values)

  const meanPosition =
    finiteIndices.reduce((sum, index) => sum + positions[index], 0) /
    finiteIndices.length
  const meanValue =
    finiteIndices.reduce((sum, index) => sum + values[index], 0) /
    finiteIndices.length
  const denominator = finiteIndices.reduce((sum, index) => {
    const delta = positions[index] - meanPosition
    return sum + delta * delta
  }, 0)
  if (denominator === 0) return demean(values)
  const slope =
    finiteIndices.reduce(
      (sum, index) =>
        sum + (positions[index] - meanPosition) * (values[index] - meanValue),
      0
    ) / denominator

  return values.map((value, index) =>
    Number.isFinite(value)
      ? value - (meanValue + slope * (positions[index] - meanPosition))
      : NaN
  )
}

const smoothFiniteValues = (
  values: readonly number[],
  radius: number
): number[] =>
  values.map((value, index) => {
    if (!Number.isFinite(value)) return NaN
    let sum = 0
    let count = 0
    const start = Math.max(0, index - radius)
    const end = Math.min(values.length - 1, index + radius)
    for (let neighbour = start; neighbour <= end; neighbour++) {
      if (Number.isFinite(values[neighbour])) {
        sum += values[neighbour]
        count++
      }
    }
    return count === 0 ? NaN : sum / count
  })

/**
 * 将一次扫描按物理位置统一为递增方向的固定网格。
 * 覆盖范围外保留为 NaN，避免把未知边缘数据伪造成有效厚度。
 */
export const normalizeScannerProfile = (
  input: readonly ScannerProfilePoint[],
  {
    positionRange,
    sampleCount = 128,
    minValidPoints = 8,
    minCoverageRatio = 0.6,
    edgeTrimRatio = 0,
    detrend = 'none',
    smoothingRadius = 0,
  }: ScannerProfileOptions
): NormalizedScannerProfile => {
  const direction = detectDirection(input)
  const range = positionRange.max - positionRange.min
  if (
    !Number.isFinite(positionRange.min) ||
    !Number.isFinite(positionRange.max) ||
    range <= 0
  ) {
    return {
      accepted: false,
      positions: [],
      values: [],
      quality: { ...emptyQuality(input.length), inputDirection: direction },
      rejectReason: 'invalidPositionRange',
    }
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    return {
      accepted: false,
      positions: [],
      values: [],
      quality: { ...emptyQuality(input.length), inputDirection: direction },
      rejectReason: 'invalidSampleCount',
    }
  }
  if (
    !Number.isFinite(edgeTrimRatio) ||
    edgeTrimRatio < 0 ||
    edgeTrimRatio >= 0.5 ||
    !['none', 'mean', 'linear'].includes(detrend) ||
    !Number.isInteger(smoothingRadius) ||
    smoothingRadius < 0 ||
    smoothingRadius * 2 + 1 > sampleCount
  ) {
    return {
      accepted: false,
      positions: [],
      values: [],
      quality: { ...emptyQuality(input.length), inputDirection: direction },
      rejectReason: 'invalidPreprocessingOptions',
    }
  }

  const valid = input
    .filter(
      (point) => Number.isFinite(point.position) && Number.isFinite(point.value)
    )
    .map((point) => ({ ...point }))
    .sort((a, b) => a.position - b.position)
  const unique = mergeDuplicatePositions(valid)
  const validRatio = input.length === 0 ? 0 : valid.length / input.length
  if (unique.length < minValidPoints) {
    return {
      accepted: false,
      positions: [],
      values: [],
      quality: {
        ...emptyQuality(input.length),
        validCount: valid.length,
        uniquePositionCount: unique.length,
        validRatio,
        inputDirection: direction,
      },
      rejectReason: 'insufficientValidPoints',
    }
  }

  const observedMin = unique[0].position
  const observedMax = unique[unique.length - 1].position
  const overlapMin = Math.max(observedMin, positionRange.min)
  const overlapMax = Math.min(observedMax, positionRange.max)
  const coverageRatio = clamp01((overlapMax - overlapMin) / range)
  const positions = Array.from(
    { length: sampleCount },
    (_, index) => positionRange.min + (index / (sampleCount - 1)) * range
  )
  const values = new Array<number>(sampleCount).fill(NaN)

  let rightIndex = 1
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index]
    if (position < observedMin || position > observedMax) continue
    while (
      rightIndex < unique.length &&
      unique[rightIndex].position < position
    ) {
      rightIndex++
    }
    if (rightIndex >= unique.length) {
      values[index] = unique[unique.length - 1].value
      continue
    }
    const right = unique[rightIndex]
    const left = unique[Math.max(0, rightIndex - 1)]
    if (position === right.position || right.position === left.position) {
      values[index] = right.value
      continue
    }
    const ratio = (position - left.position) / (right.position - left.position)
    values[index] = left.value + ratio * (right.value - left.value)
  }

  const trimCount = Math.floor(sampleCount * edgeTrimRatio)
  for (let index = 0; index < trimCount; index++) {
    values[index] = NaN
    values[sampleCount - 1 - index] = NaN
  }
  const detrendedValues =
    detrend === 'mean'
      ? demean(values)
      : detrend === 'linear'
        ? removeLinearTrend(positions, values)
        : values
  const processedValues =
    smoothingRadius > 0
      ? smoothFiniteValues(detrendedValues, smoothingRadius)
      : detrendedValues

  const populatedCount = processedValues.reduce(
    (count, value) => count + (Number.isFinite(value) ? 1 : 0),
    0
  )
  const missingRatio = 1 - populatedCount / sampleCount
  const quality: ScannerProfileQuality = {
    inputCount: input.length,
    validCount: valid.length,
    uniquePositionCount: unique.length,
    validRatio,
    coverageRatio,
    missingRatio,
    inputDirection: direction,
  }
  return {
    accepted: coverageRatio >= minCoverageRatio,
    positions,
    values: processedValues,
    quality,
    rejectReason:
      coverageRatio >= minCoverageRatio ? null : 'insufficientCoverage',
  }
}
