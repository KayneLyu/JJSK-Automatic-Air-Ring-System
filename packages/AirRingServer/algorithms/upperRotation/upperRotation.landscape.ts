import { upperRotationRuntimeLimits } from './upperRotation.config'

export type LossSample = {
  theta: number
  loss: number
}

type LossLandscapeFeature = {
  boundaryPlateau: boolean
  bimodalDivergence: boolean
  localMinimaCount: number
  secondaryMinTheta: number | null
}

export type HighAngleGateDecision = {
  divergenceDeg: number
  shouldTrigger: boolean
  reason: string
}

const dedupeAndSortSamples = (samples: readonly LossSample[]): LossSample[] => {
  const byTheta = new Map<number, number>()
  for (const s of samples) {
    if (!isFinite(s.theta) || !isFinite(s.loss)) continue
    const key = Number(s.theta.toFixed(3))
    const prev = byTheta.get(key)
    if (prev === undefined || s.loss < prev) byTheta.set(key, s.loss)
  }
  return [...byTheta.entries()]
    .map(([theta, loss]) => ({ theta, loss }))
    .sort((a, b) => a.theta - b.theta)
}

export const analyzeLossLandscape = (
  samples: readonly LossSample[],
  min: number,
  max: number
): LossLandscapeFeature => {
  const normalized = dedupeAndSortSamples(samples)
  if (normalized.length < 9) {
    return {
      boundaryPlateau: false,
      bimodalDivergence: false,
      localMinimaCount: 0,
      secondaryMinTheta: null,
    }
  }

  const span = max - min
  let globalBestLoss = normalized[0].loss
  for (let i = 1; i < normalized.length; i++) {
    if (normalized[i].loss < globalBestLoss) {
      globalBestLoss = normalized[i].loss
    }
  }
  const safeBest = Math.max(globalBestLoss, 1e-9)
  const boundaryStart = Math.max(min, max - Math.min(14, span * 0.16))
  const boundaryBand = normalized.filter((s) => s.theta >= boundaryStart)

  let boundaryPlateau = false
  if (boundaryBand.length >= 3) {
    const losses = boundaryBand.map((s) => s.loss).sort((a, b) => a - b)
    const boundaryBest = losses[0]
    const boundaryMedian = losses[Math.floor(losses.length / 2)]
    const nearGlobalBest = boundaryBest <= safeBest * 1.03
    const isFlat = (boundaryMedian - boundaryBest) / safeBest <= 0.015
    boundaryPlateau = nearGlobalBest && isFlat
  }

  const localMinima: LossSample[] = []
  for (let i = 1; i < normalized.length - 1; i++) {
    const prev = normalized[i - 1]
    const cur = normalized[i]
    const next = normalized[i + 1]
    if (cur.loss <= prev.loss && cur.loss <= next.loss) {
      localMinima.push(cur)
    }
  }

  const minimaByLoss = [...localMinima].sort((a, b) => a.loss - b.loss)
  const primary = minimaByLoss[0]
  const secondary = minimaByLoss[1]
  const highBandStart = min + span * 0.8
  const bimodalDivergence =
    primary !== undefined &&
    secondary !== undefined &&
    Math.abs(primary.theta - secondary.theta) >=
      upperRotationRuntimeLimits.SOLUTION_GAP_THRESHOLD_DEG &&
    secondary.loss <= Math.max(primary.loss, 1e-9) * 1.025 &&
    (primary.theta >= highBandStart || secondary.theta >= highBandStart)

  return {
    boundaryPlateau,
    bimodalDivergence,
    localMinimaCount: localMinima.length,
    secondaryMinTheta: secondary?.theta ?? null,
  }
}

// 基于 loss 地形动态调整高角度门控：边界平台化/双峰分歧出现时更早触发比较。
export const resolveHighAngleDivergenceDeg = (
  min: number,
  max: number,
  feature?: LossLandscapeFeature
): HighAngleGateDecision => {
  const span = max - min
  const adaptive = min + span * 0.8 // 关注搜索区间上 20%
  const baseline = Math.min(
    max - 12,
    Math.max(
      320,
      Math.max(
        upperRotationRuntimeLimits.HIGH_ANGLE_DIVERGENCE_BASE_DEG - 6,
        adaptive
      )
    )
  )

  if (!feature) {
    return {
      divergenceDeg: baseline,
      shouldTrigger: false,
      reason: 'no-feature',
    }
  }

  let divergenceDeg = baseline
  let reason = 'stable'
  const shouldTrigger = feature.boundaryPlateau || feature.bimodalDivergence

  if (feature.boundaryPlateau) {
    divergenceDeg = Math.max(min + span * 0.72, divergenceDeg - 8)
    reason = 'boundary-plateau'
  }
  if (feature.bimodalDivergence) {
    divergenceDeg = Math.max(min + span * 0.68, divergenceDeg - 6)
    reason =
      reason === 'boundary-plateau' ? 'boundary-plateau+bimodal' : 'bimodal'
  }

  return {
    divergenceDeg: Math.min(max - 8, divergenceDeg),
    shouldTrigger,
    reason,
  }
}
