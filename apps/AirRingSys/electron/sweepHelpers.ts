import { BubbleReconstructionResult } from '@/types/ipc'

/**
 * 膜泡厚度重建 — 纯工具函数
 *
 * 从 dataPipeline.ts 拆分出的纯函数，与 DataPipeline 类实例无依赖。
 * 所有函数均为纯函数，不访问实例状态或外部 I/O。
 */
export const calcThicknessMicrons = (
  ad: number,
  airAD: number,
  gain: number
): number => {
  if (ad <= 0 || airAD <= 0) return 0
  if (ad >= airAD) return 0
  const x = Math.log(airAD / ad)
  const base = 9.65 * x * x + 243.08 * x - 0.087
  return Math.max(0, base * (gain || 1.0))
}

export function detectOutOfBoundsThreshold(values: number[]): number | null {
    if (values.length < 100) return null

    const sorted = [...values].sort((a, b) => a - b)
    const p01 = sorted[Math.floor(sorted.length * 0.01)]
    const p99 = sorted[Math.floor(sorted.length * 0.99)]
    const range = p99 - p01
    if (range <= 0) return null

    const NUM_BINS = 50
    const binWidth = range / NUM_BINS
    const hist = new Array(NUM_BINS).fill(0)

    for (const v of values) {
      const bin = Math.min(Math.floor((v - p01) / binWidth), NUM_BINS - 1)
      hist[bin]++
    }

    let maxCount = 0
    let peakBin = 0
    for (let i = 0; i < NUM_BINS; i++) {
      if (hist[i] > maxCount) {
        maxCount = hist[i]
        peakBin = i
      }
    }

    let valleyBin = -1
    let valleyCount = Infinity
    const startBin = Math.max(peakBin + 3, Math.floor(NUM_BINS * 0.3))
    const endBin = Math.min(NUM_BINS - 3, Math.floor(NUM_BINS * 0.9))

    for (let i = startBin; i < endBin; i++) {
      if (hist[i] < valleyCount) {
        valleyCount = hist[i]
        valleyBin = i
      }
    }

    if (valleyBin < 0) return null
    if (valleyCount > maxCount * 0.2) return null

    let rightPeak = 0
    for (let i = valleyBin + 1; i < NUM_BINS; i++) {
      if (hist[i] > rightPeak) rightPeak = hist[i]
    }
    if (rightPeak < 0.02 * maxCount) return null

    return p01 + (valleyBin + 0.5) * binWidth
  }

export function isProfilePlausible(result: BubbleReconstructionResult): boolean {
    if (result.profile.length === 0) return false
    return result.profile.every((v) => Number.isFinite(v))
  }


/** 均匀降采样，保持元素相对顺序 */
export function downsampleUniform<T>(arr: readonly T[], target: number): T[] {
  if (arr.length <= target) return [...arr]
  const stride = arr.length / target
  const out: T[] = []
  for (let i = 0; i < target; i += 1) {
    out.push(arr[Math.floor(i * stride)])
  }
  return out
}
