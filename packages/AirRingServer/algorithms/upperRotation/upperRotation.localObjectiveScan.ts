import type { DynamicLocalSearchWindowResult } from './upperRotation.localSearchWindow'

export type LocalObjectiveScore = {
  angleDeg: number
  loss: number | null
}

export type LocalObjectiveScanResult = {
  accepted: boolean
  evaluatedPointCount: number
  validLossCount: number
  invalidLossCount: number
  bestAngleDeg: number | null
  bestLoss: number | null
  bestAtBoundary: boolean
  scores: LocalObjectiveScore[]
  rejectReason:
    | 'invalidWindow'
    | 'evaluationBudgetMismatch'
    | 'noFiniteObjective'
    | 'bestAtBoundary'
    | null
}

/**
 * 在已验证的动态窗口内扫描任意通用目标函数。
 * 边界最优只作为“窗口可能未覆盖真实极值”的证据，不输出可接受结果。
 */
export const scanLocalObjective = (
  window: DynamicLocalSearchWindowResult,
  objective: (angleDeg: number) => number
): LocalObjectiveScanResult => {
  const rejected = (
    rejectReason: Exclude<LocalObjectiveScanResult['rejectReason'], null>,
    diagnostics: Partial<LocalObjectiveScanResult> = {}
  ): LocalObjectiveScanResult => ({
    accepted: false,
    evaluatedPointCount: 0,
    validLossCount: 0,
    invalidLossCount: 0,
    bestAngleDeg: null,
    bestLoss: null,
    bestAtBoundary: false,
    scores: [],
    ...diagnostics,
    rejectReason,
  })
  if (
    !window.accepted ||
    window.minimumAngleDeg === null ||
    window.maximumAngleDeg === null ||
    window.searchStepDeg === null ||
    window.plannedSearchPointCount === null ||
    !Number.isFinite(window.minimumAngleDeg) ||
    !Number.isFinite(window.maximumAngleDeg) ||
    !Number.isFinite(window.searchStepDeg) ||
    window.searchStepDeg <= 0 ||
    window.maximumAngleDeg <= window.minimumAngleDeg ||
    !Number.isInteger(window.plannedSearchPointCount) ||
    window.plannedSearchPointCount < 2
  ) {
    return rejected('invalidWindow')
  }

  const scores: LocalObjectiveScore[] = []
  let bestAngleDeg: number | null = null
  let bestLoss = Infinity
  let validLossCount = 0
  let invalidLossCount = 0
  for (let index = 0; index < window.plannedSearchPointCount; index++) {
    const angleDeg =
      index === window.plannedSearchPointCount - 1
        ? window.maximumAngleDeg
        : window.minimumAngleDeg + index * window.searchStepDeg
    if (angleDeg > window.maximumAngleDeg) {
      return rejected('evaluationBudgetMismatch', {
        evaluatedPointCount: scores.length,
        validLossCount,
        invalidLossCount,
        bestAngleDeg,
        bestLoss: bestAngleDeg === null ? null : bestLoss,
        scores,
      })
    }
    let loss: number | null = null
    try {
      const evaluated = objective(angleDeg)
      if (Number.isFinite(evaluated)) loss = evaluated
    } catch {
      // 目标函数异常与非有限 loss 使用相同的无效评估语义。
    }
    scores.push({ angleDeg, loss })
    if (loss === null) {
      invalidLossCount++
    } else {
      validLossCount++
      if (loss < bestLoss) {
        bestLoss = loss
        bestAngleDeg = angleDeg
      }
    }
  }

  if (bestAngleDeg === null) {
    return rejected('noFiniteObjective', {
      evaluatedPointCount: scores.length,
      validLossCount,
      invalidLossCount,
      scores,
    })
  }
  const bestAtBoundary =
    bestAngleDeg === window.minimumAngleDeg ||
    bestAngleDeg === window.maximumAngleDeg
  const diagnostics = {
    evaluatedPointCount: scores.length,
    validLossCount,
    invalidLossCount,
    bestAngleDeg,
    bestLoss,
    bestAtBoundary,
    scores,
  }
  if (bestAtBoundary) {
    return rejected('bestAtBoundary', diagnostics)
  }
  return { accepted: true, ...diagnostics, rejectReason: null }
}
