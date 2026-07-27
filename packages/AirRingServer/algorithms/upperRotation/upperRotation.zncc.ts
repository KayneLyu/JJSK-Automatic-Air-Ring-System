export type ZnccOptions = {
  maxShift: number
  minOverlapCount: number
}

export type ZnccShiftScore = {
  shift: number
  correlation: number | null
  overlapCount: number
}

export type ZnccResult = {
  accepted: boolean
  bestShift: number | null
  bestShiftSubpixel: number | null
  bestCorrelation: number | null
  bestOverlapCount: number
  interpolationApplied: boolean
  secondPeakShift: number | null
  secondPeakCorrelation: number | null
  secondPeakOverlapCount: number | null
  peakProminence: number | null
  scores: ZnccShiftScore[]
  rejectReason: 'lengthMismatch' | 'invalidOptions' | 'noValidShift' | null
}

type PeakDiagnostics = Pick<
  ZnccResult,
  | 'bestShiftSubpixel'
  | 'interpolationApplied'
  | 'secondPeakShift'
  | 'secondPeakCorrelation'
  | 'secondPeakOverlapCount'
  | 'peakProminence'
>

const emptyPeakDiagnostics = (): PeakDiagnostics => ({
  bestShiftSubpixel: null,
  interpolationApplied: false,
  secondPeakShift: null,
  secondPeakCorrelation: null,
  secondPeakOverlapCount: null,
  peakProminence: null,
})

const analyzePeak = (
  scores: readonly ZnccShiftScore[],
  best: ZnccShiftScore
): PeakDiagnostics => {
  const bestIndex = scores.findIndex(({ shift }) => shift === best.shift)
  let bestShiftSubpixel = best.shift
  let interpolationApplied = false
  const left = scores[bestIndex - 1]?.correlation
  const center = scores[bestIndex]?.correlation
  const right = scores[bestIndex + 1]?.correlation
  if (
    left !== null &&
    left !== undefined &&
    center !== null &&
    center !== undefined &&
    right !== null &&
    right !== undefined &&
    center > left &&
    center > right
  ) {
    const curvature = left - 2 * center + right
    if (curvature < 0) {
      const offset = (0.5 * (left - right)) / curvature
      if (Number.isFinite(offset) && Math.abs(offset) <= 1) {
        bestShiftSubpixel += offset
        interpolationApplied = true
      }
    }
  }

  let secondPeak: ZnccShiftScore | null = null
  for (let index = 0; index < scores.length; index++) {
    const score = scores[index]
    if (score.correlation === null || Math.abs(score.shift - best.shift) <= 1) {
      continue
    }
    const previous = scores[index - 1]?.correlation
    const next = scores[index + 1]?.correlation
    const isLocalPeak =
      (previous === null ||
        previous === undefined ||
        score.correlation >= previous) &&
      (next === null || next === undefined || score.correlation >= next)
    if (
      isLocalPeak &&
      (secondPeak === null ||
        score.correlation > (secondPeak.correlation as number))
    ) {
      secondPeak = score
    }
  }

  return {
    bestShiftSubpixel,
    interpolationApplied,
    secondPeakShift: secondPeak?.shift ?? null,
    secondPeakCorrelation: secondPeak?.correlation ?? null,
    secondPeakOverlapCount: secondPeak?.overlapCount ?? null,
    peakProminence:
      secondPeak?.correlation === null || secondPeak?.correlation === undefined
        ? null
        : (best.correlation as number) - secondPeak.correlation,
  }
}

const scoreShift = (
  reference: readonly number[],
  candidate: readonly number[],
  shift: number,
  minOverlapCount: number
): ZnccShiftScore => {
  const pairs: Array<[number, number]> = []
  for (
    let referenceIndex = 0;
    referenceIndex < reference.length;
    referenceIndex++
  ) {
    const candidateIndex = referenceIndex + shift
    if (candidateIndex < 0 || candidateIndex >= candidate.length) continue
    const referenceValue = reference[referenceIndex]
    const candidateValue = candidate[candidateIndex]
    if (Number.isFinite(referenceValue) && Number.isFinite(candidateValue)) {
      pairs.push([referenceValue, candidateValue])
    }
  }

  if (pairs.length < minOverlapCount) {
    return { shift, correlation: null, overlapCount: pairs.length }
  }

  const referenceMean =
    pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length
  const candidateMean =
    pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length
  let covariance = 0
  let referenceVariance = 0
  let candidateVariance = 0
  for (const [referenceValue, candidateValue] of pairs) {
    const referenceDelta = referenceValue - referenceMean
    const candidateDelta = candidateValue - candidateMean
    covariance += referenceDelta * candidateDelta
    referenceVariance += referenceDelta * referenceDelta
    candidateVariance += candidateDelta * candidateDelta
  }
  const denominator = Math.sqrt(referenceVariance * candidateVariance)
  return {
    shift,
    correlation: denominator > 0 ? covariance / denominator : null,
    overlapCount: pairs.length,
  }
}

/**
 * 对每个位移使用该位移的真实有限值重叠区计算零均值归一化互相关。
 * 正位移表示 candidate 中的同一特征位于 reference 的右侧。
 */
export const calculateZncc = (
  reference: readonly number[],
  candidate: readonly number[],
  { maxShift, minOverlapCount }: ZnccOptions
): ZnccResult => {
  if (reference.length !== candidate.length || reference.length === 0) {
    return {
      accepted: false,
      bestShift: null,
      ...emptyPeakDiagnostics(),
      bestCorrelation: null,
      bestOverlapCount: 0,
      scores: [],
      rejectReason: 'lengthMismatch',
    }
  }
  if (
    !Number.isInteger(maxShift) ||
    maxShift < 0 ||
    maxShift >= reference.length ||
    !Number.isInteger(minOverlapCount) ||
    minOverlapCount < 2 ||
    minOverlapCount > reference.length
  ) {
    return {
      accepted: false,
      bestShift: null,
      ...emptyPeakDiagnostics(),
      bestCorrelation: null,
      bestOverlapCount: 0,
      scores: [],
      rejectReason: 'invalidOptions',
    }
  }

  const scores: ZnccShiftScore[] = []
  let best: ZnccShiftScore | null = null
  for (let shift = -maxShift; shift <= maxShift; shift++) {
    const score = scoreShift(reference, candidate, shift, minOverlapCount)
    scores.push(score)
    if (score.correlation === null) continue
    if (
      best === null ||
      score.correlation > (best.correlation as number) ||
      (score.correlation === best.correlation &&
        (score.overlapCount > best.overlapCount ||
          (score.overlapCount === best.overlapCount &&
            Math.abs(score.shift) < Math.abs(best.shift))))
    ) {
      best = score
    }
  }

  const peakDiagnostics =
    best === null ? emptyPeakDiagnostics() : analyzePeak(scores, best)
  return {
    accepted: best !== null,
    bestShift: best?.shift ?? null,
    ...peakDiagnostics,
    bestCorrelation: best?.correlation ?? null,
    bestOverlapCount: best?.overlapCount ?? 0,
    scores,
    rejectReason: best === null ? 'noValidShift' : null,
  }
}
