import type { LossSample } from './upperRotation.landscape'
import type { UpperRotationNativeSegment } from './upperRotation.native'

export type UpperRotationSearchObjective = 'direct' | 'expanded'

export type UpperRotationSearchRequest = {
  objective: UpperRotationSearchObjective
  segments: readonly UpperRotationNativeSegment[]
  minDegrees: number
  maxDegrees: number
  stepDegrees: number
  numBins: number
  collectSamples: boolean
}

export type UpperRotationSearchResult = {
  theta: number
  loss: number
  samples: LossSample[]
  evaluations: number
}

/**
 * 上旋估算的计算后端边界。数据准备和领域规则仍由 TypeScript 编排，
 * 目标函数与候选角度搜索可由 TypeScript 或 Rust Native 执行。
 */
export interface UpperRotationSearchBackend {
  search(request: UpperRotationSearchRequest): UpperRotationSearchResult | null
  evaluate(
    objective: UpperRotationSearchObjective,
    segments: readonly UpperRotationNativeSegment[],
    thetaDegrees: number,
    numBins: number
  ): number
}
