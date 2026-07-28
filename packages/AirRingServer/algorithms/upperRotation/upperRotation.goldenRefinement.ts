import type { DynamicLocalSearchWindowResult } from './upperRotation.localSearchWindow'
import type { LocalObjectiveScanResult } from './upperRotation.localObjectiveScan'

export type GoldenRefinementOptions = {
  angleToleranceDeg: number
  maximumIterations: number
  minimumBoundaryDistanceDeg: number
}

export type GoldenRefinementResult = {
  accepted: boolean
  bracketMinimumAngleDeg: number | null
  bracketMaximumAngleDeg: number | null
  finalBracketSpanDeg: number | null
  iterationCount: number
  refinedAngleDeg: number | null
  refinedLoss: number | null
  lossImprovement: number | null
  distanceToWindowBoundaryDeg: number | null
  rejectReason:
    | 'invalidScan'
    | 'invalidOptions'
    | 'missingFiniteBracket'
    | 'invalidObjective'
    | 'iterationBudgetExceeded'
    | 'refinedAtBoundary'
    | null
}

/**
 * 在离散内部最优点的最近有限邻点之间执行有界黄金分割细化。
 */
export const refineLocalObjectiveWithGoldenSection = (
  window: DynamicLocalSearchWindowResult,
  scan: LocalObjectiveScanResult,
  objective: (angleDeg: number) => number,
  {
    angleToleranceDeg,
    maximumIterations,
    minimumBoundaryDistanceDeg,
  }: GoldenRefinementOptions
): GoldenRefinementResult => {
  const rejected = (
    rejectReason: Exclude<GoldenRefinementResult['rejectReason'], null>,
    diagnostics: Partial<GoldenRefinementResult> = {}
  ): GoldenRefinementResult => ({
    accepted: false,
    bracketMinimumAngleDeg: null,
    bracketMaximumAngleDeg: null,
    finalBracketSpanDeg: null,
    iterationCount: 0,
    refinedAngleDeg: null,
    refinedLoss: null,
    lossImprovement: null,
    distanceToWindowBoundaryDeg: null,
    ...diagnostics,
    rejectReason,
  })
  if (
    !window.accepted ||
    window.minimumAngleDeg === null ||
    window.maximumAngleDeg === null ||
    !scan.accepted ||
    scan.bestAngleDeg === null ||
    scan.bestLoss === null ||
    scan.scores.length < 3
  ) {
    return rejected('invalidScan')
  }
  if (
    !Number.isFinite(angleToleranceDeg) ||
    angleToleranceDeg <= 0 ||
    !Number.isInteger(maximumIterations) ||
    maximumIterations < 1 ||
    !Number.isFinite(minimumBoundaryDistanceDeg) ||
    minimumBoundaryDistanceDeg < 0
  ) {
    return rejected('invalidOptions')
  }

  const bestIndex = scan.scores.findIndex(
    (score) => score.angleDeg === scan.bestAngleDeg && score.loss !== null
  )
  let leftIndex = bestIndex - 1
  while (leftIndex >= 0 && scan.scores[leftIndex].loss === null) leftIndex--
  let rightIndex = bestIndex + 1
  while (
    rightIndex < scan.scores.length &&
    scan.scores[rightIndex].loss === null
  ) {
    rightIndex++
  }
  if (bestIndex < 0 || leftIndex < 0 || rightIndex >= scan.scores.length) {
    return rejected('missingFiniteBracket')
  }

  let bracketMinimumAngleDeg = scan.scores[leftIndex].angleDeg
  let bracketMaximumAngleDeg = scan.scores[rightIndex].angleDeg
  const initialBracketMinimumAngleDeg = bracketMinimumAngleDeg
  const initialBracketMaximumAngleDeg = bracketMaximumAngleDeg
  const evaluate = (angleDeg: number): number | null => {
    try {
      const loss = objective(angleDeg)
      return Number.isFinite(loss) ? loss : null
    } catch {
      return null
    }
  }
  const ratio = (Math.sqrt(5) - 1) / 2
  let leftProbe =
    bracketMaximumAngleDeg -
    ratio * (bracketMaximumAngleDeg - bracketMinimumAngleDeg)
  let rightProbe =
    bracketMinimumAngleDeg +
    ratio * (bracketMaximumAngleDeg - bracketMinimumAngleDeg)
  let leftLoss = evaluate(leftProbe)
  let rightLoss = evaluate(rightProbe)
  if (leftLoss === null || rightLoss === null) {
    return rejected('invalidObjective', {
      bracketMinimumAngleDeg: initialBracketMinimumAngleDeg,
      bracketMaximumAngleDeg: initialBracketMaximumAngleDeg,
    })
  }

  let iterationCount = 0
  while (
    bracketMaximumAngleDeg - bracketMinimumAngleDeg > angleToleranceDeg &&
    iterationCount < maximumIterations
  ) {
    if (leftLoss <= rightLoss) {
      bracketMaximumAngleDeg = rightProbe
      rightProbe = leftProbe
      rightLoss = leftLoss
      leftProbe =
        bracketMaximumAngleDeg -
        ratio * (bracketMaximumAngleDeg - bracketMinimumAngleDeg)
      leftLoss = evaluate(leftProbe)
      if (leftLoss === null) {
        return rejected('invalidObjective', {
          bracketMinimumAngleDeg,
          bracketMaximumAngleDeg,
          iterationCount,
        })
      }
    } else {
      bracketMinimumAngleDeg = leftProbe
      leftProbe = rightProbe
      leftLoss = rightLoss
      rightProbe =
        bracketMinimumAngleDeg +
        ratio * (bracketMaximumAngleDeg - bracketMinimumAngleDeg)
      rightLoss = evaluate(rightProbe)
      if (rightLoss === null) {
        return rejected('invalidObjective', {
          bracketMinimumAngleDeg,
          bracketMaximumAngleDeg,
          iterationCount,
        })
      }
    }
    iterationCount++
  }

  const finalBracketSpanDeg = bracketMaximumAngleDeg - bracketMinimumAngleDeg
  if (finalBracketSpanDeg > angleToleranceDeg) {
    return rejected('iterationBudgetExceeded', {
      bracketMinimumAngleDeg,
      bracketMaximumAngleDeg,
      finalBracketSpanDeg,
      iterationCount,
    })
  }
  const refinedAngleDeg = (bracketMinimumAngleDeg + bracketMaximumAngleDeg) / 2
  const refinedLoss = evaluate(refinedAngleDeg)
  if (refinedLoss === null) {
    return rejected('invalidObjective', {
      bracketMinimumAngleDeg,
      bracketMaximumAngleDeg,
      finalBracketSpanDeg,
      iterationCount,
      refinedAngleDeg,
    })
  }
  const distanceToWindowBoundaryDeg = Math.min(
    refinedAngleDeg - window.minimumAngleDeg,
    window.maximumAngleDeg - refinedAngleDeg
  )
  const diagnostics = {
    bracketMinimumAngleDeg,
    bracketMaximumAngleDeg,
    finalBracketSpanDeg,
    iterationCount,
    refinedAngleDeg,
    refinedLoss,
    lossImprovement: scan.bestLoss - refinedLoss,
    distanceToWindowBoundaryDeg,
  }
  if (distanceToWindowBoundaryDeg <= minimumBoundaryDistanceDeg) {
    return rejected('refinedAtBoundary', diagnostics)
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
