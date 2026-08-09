/**
 * 膜泡厚度重建 — 纯工具函数
 *
 * 从 dataPipeline.ts 拆分出的纯函数，不访问实例状态或外部 I/O。
 */

import type { BubbleReconstructionResult } from '@/types/ipc'

/**
 * 基于直方图双峰检测，自动识别出界阈值。
 *
 * 原理：测厚仪扫描超出膜宽时，没有薄膜遮挡，AD 值跳升形成第二个峰。
 * 本函数在直方图的 30%-90% 区间找两峰之间的谷底作为阈值。
 *
 * @param values 原始 AD 值数组
 * @returns 出界阈值，无明显双峰或数据不足返回 null
 */
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

/**
 * 检查膜泡重建结果的 profile 是否合理。
 *
 * @returns false 如果 profile 为空或包含非数值
 */
export function isProfilePlausible(
  result: BubbleReconstructionResult
): boolean {
  if (result.profile.length === 0) return false
  return result.profile.every((v) => Number.isFinite(v))
}

/**
 * 均匀降采样，保持元素相对顺序。
 *
 * @param arr    原始数组
 * @param target 目标元素数
 * @returns 降采样后的新数组，若原数组不超 target 则返回副本
 */
export function downsampleUniform<T>(arr: readonly T[], target: number): T[] {
  if (arr.length <= target) return [...arr]
  const stride = arr.length / target
  const out: T[] = []
  for (let i = 0; i < target; i += 1) {
    out.push(arr[Math.floor(i * stride)])
  }
  return out
}
