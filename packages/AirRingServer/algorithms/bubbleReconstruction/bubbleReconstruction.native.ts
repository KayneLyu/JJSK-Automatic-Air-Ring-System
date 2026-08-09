import type { SparseSystem } from './types'

export type BubbleNativeBinding = {
  solveBubbleBatch: (
    rowPtr: Int32Array,
    colInd: Int32Array,
    values: Float64Array,
    targets: Float64Array,
    numBins: number,
    lambda: number,
    mu: number
  ) => number[]
}

export type BubbleRustShadowTelemetry = {
  schemaVersion: 1
  status: 'success' | 'loadError' | 'executionError'
  numBins: number
  measurementCount: number
  tsSolveMs: number
  rustSolveMs: number | null
  /** TypeScript 从 CSR 构建到最终重建结果的完整耗时。 */
  tsTotalMs: number
  /** Rust 从 CSR 构建到最终重建结果的完整耗时；失败时为 null。 */
  rustTotalMs: number | null
  totalShadowMs: number
  maxAbsProfileDelta: number | null
  rmsProfileDelta: number | null
  error: string | null
}

export type BubbleRustPrimaryTelemetry = {
  schemaVersion: 1
  status: 'success' | 'fallback'
  numBins: number
  measurementCount: number
  rustSolveMs: number | null
  rustTotalMs: number | null
  fallbackTsTotalMs: number | null
  totalPrimaryMs: number
  error: string | null
}

const MAX_ERROR_LENGTH = 500

const normalizeError = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH
  )

export const solveBubbleBatchWithNative = (
  binding: BubbleNativeBinding,
  sparse: SparseSystem,
  lambda: number,
  mu: number
): number[] => {
  const profile = binding.solveBubbleBatch(
    sparse.rowPtr,
    sparse.colInd,
    sparse.values,
    sparse.b,
    sparse.N,
    lambda,
    mu
  )
  if (profile.length !== sparse.N) {
    throw new Error(
      `Native 膜泡 profile 长度不匹配: ${profile.length} !== ${sparse.N}`
    )
  }
  if (profile.some((value) => !Number.isFinite(value))) {
    throw new Error('Native 膜泡 profile 包含非有限数值')
  }
  return profile
}

export const compareBubbleProfiles = (
  tsProfile: number[],
  rustProfile: number[]
): { maxAbsProfileDelta: number; rmsProfileDelta: number } => {
  if (tsProfile.length !== rustProfile.length) {
    throw new Error(
      `膜泡 profile 长度不可比较: ${tsProfile.length} !== ${rustProfile.length}`
    )
  }

  let maxAbsProfileDelta = 0
  let sumSquaredDelta = 0
  for (let index = 0; index < tsProfile.length; index += 1) {
    const delta = Math.abs((tsProfile[index] ?? 0) - (rustProfile[index] ?? 0))
    maxAbsProfileDelta = Math.max(maxAbsProfileDelta, delta)
    sumSquaredDelta += delta * delta
  }
  return {
    maxAbsProfileDelta,
    rmsProfileDelta: Math.sqrt(sumSquaredDelta / Math.max(1, tsProfile.length)),
  }
}

export const createBubbleRustShadowFailure = (options: {
  status: 'loadError' | 'executionError'
  numBins: number
  measurementCount: number
  tsSolveMs: number
  tsTotalMs: number
  totalShadowMs: number
  error: unknown
}): BubbleRustShadowTelemetry => ({
  schemaVersion: 1,
  status: options.status,
  numBins: options.numBins,
  measurementCount: options.measurementCount,
  tsSolveMs: options.tsSolveMs,
  rustSolveMs: null,
  tsTotalMs: options.tsTotalMs,
  rustTotalMs: null,
  totalShadowMs: options.totalShadowMs,
  maxAbsProfileDelta: null,
  rmsProfileDelta: null,
  error: normalizeError(options.error),
})
