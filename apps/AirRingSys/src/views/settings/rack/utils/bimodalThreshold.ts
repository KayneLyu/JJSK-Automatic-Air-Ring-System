/**
 * 双峰阈值检测 — 基于直方图谷底/Otsu 自动分离测厚仪的"在界"与"出界"测量
 *
 * 算法来自 packages/AirRingServer/algorithms/buildTripSegment.ts
 * 原算法在 ProbeValue (光通量) 上运行,这里适配为直接在数值上运行
 */

const NUM_BINS = 50

interface HistogramInfo {
  minY: number
  maxY: number
  totalRange: number
  binSize: number
  hist: number[]
}

function buildHistogram(ys: number[]): HistogramInfo | null {
  if (ys.length < 50) return null

  let minY = Infinity
  let maxY = -Infinity
  for (const y of ys) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const totalRange = maxY - minY
  if (!isFinite(totalRange) || totalRange === 0) return null

  const binSize = totalRange / NUM_BINS
  if (!isFinite(binSize) || binSize === 0) return null

  const hist = new Array(NUM_BINS).fill(0)
  for (const y of ys) {
    const bin = Math.min(Math.floor((y - minY) / binSize), NUM_BINS - 1)
    hist[bin]++
  }

  return { minY, maxY, totalRange, binSize, hist }
}

function refineThresholdFromSplit(
  histogram: HistogramInfo,
  splitBin: number
): { threshold: number; valleyCount: number; leftPeakCount: number; rightPeakCount: number } | null {
  const { minY, binSize, hist } = histogram

  let leftPeakCount = 0
  for (let i = 0; i <= splitBin; i++) {
    if (hist[i] > leftPeakCount) { leftPeakCount = hist[i] }
  }

  let rightPeakCount = 0
  for (let i = splitBin + 1; i < hist.length; i++) {
    if (hist[i] > rightPeakCount) { rightPeakCount = hist[i] }
  }

  // 在 splitBin 附近 ±2 bin 找真正的谷底
  let valleyBin = splitBin
  let valleyCount = hist[splitBin]
  for (let i = Math.max(0, splitBin - 2); i <= Math.min(hist.length - 1, splitBin + 2); i++) {
    if (hist[i] < valleyCount) { valleyCount = hist[i]; valleyBin = i }
  }

  return {
    threshold: minY + (valleyBin + 0.5) * binSize,
    valleyCount,
    leftPeakCount,
    rightPeakCount,
  }
}

function detectOtsuThreshold(
  histogram: HistogramInfo,
  sampleCount: number
): number | null {
  const { hist } = histogram
  if (sampleCount < 50) return null

  let totalMean = 0
  for (let i = 0; i < hist.length; i++) totalMean += i * (hist[i] / sampleCount)

  let totalVariance = 0
  for (let i = 0; i < hist.length; i++) {
    const delta = i - totalMean
    totalVariance += (hist[i] / sampleCount) * delta * delta
  }
  if (!isFinite(totalVariance) || totalVariance === 0) return null

  let sum = 0
  for (let i = 0; i < hist.length; i++) sum += i * hist[i]

  let bestScore = -Infinity
  let bestSplitBin = -1
  let bestLeftMean = 0
  let bestRightMean = 0
  let weightLeft = 0
  let weightedLeftSum = 0

  for (let i = 0; i < hist.length - 1; i++) {
    weightLeft += hist[i]
    weightedLeftSum += i * hist[i]
    if (weightLeft === 0 || weightLeft === sampleCount) continue

    const weightRight = sampleCount - weightLeft
    const leftRatio = weightLeft / sampleCount
    const rightRatio = weightRight / sampleCount
    if (leftRatio < 0.05 || rightRatio < 0.05) continue

    const leftMean = weightedLeftSum / weightLeft
    const rightMean = (sum - weightedLeftSum) / weightRight
    const betweenVariance = leftRatio * rightRatio * (leftMean - rightMean) ** 2

    if (betweenVariance > bestScore) {
      bestScore = betweenVariance
      bestSplitBin = i
      bestLeftMean = leftMean
      bestRightMean = rightMean
    }
  }

  if (bestSplitBin < 0) return null

  const meanGapBins = bestRightMean - bestLeftMean
  const separability = bestScore / totalVariance
  if (meanGapBins < hist.length * 0.15) return null
  if (separability < 0.55) return null

  const refined = refineThresholdFromSplit(histogram, bestSplitBin)
  if (!refined) return null

  const valleyLimit = Math.min(refined.leftPeakCount, refined.rightPeakCount) * 0.6
  if (refined.valleyCount > valleyLimit) return null

  return refined.threshold
}

/**
 * 基于直方图的双峰分布阈值检测
 *
 * 测厚仪在界时读数较低(膜厚大),出界时读数高(膜薄/空气),形成双峰。
 * 自动检测两峰之间的谷底作为阈值。高于阈值的点为出界(应过滤)。
 *
 * @param ys  数值数组(原始 ad 值或厚度值)
 * @returns 阈值,若无明显双峰分布则返回 null
 */
export function detectBimodalThreshold(ys: number[]): number | null {
  const histogram = buildHistogram(ys)
  if (!histogram) return null

  const { minY, binSize, hist } = histogram

  let maxCount = 0
  for (const c of hist) if (c > maxCount) maxCount = c

  const startBin = Math.floor(NUM_BINS * 0.1)
  const endBin = Math.floor(NUM_BINS * 0.9)
  let minCount = Infinity
  let valleyBin = -1
  for (let i = startBin; i <= endBin; i++) {
    if (hist[i] < minCount) { minCount = hist[i]; valleyBin = i }
  }

  if (minCount > maxCount * 0.3) return null

  let leftPeak = 0
  for (let i = 0; i < valleyBin; i++) if (hist[i] > leftPeak) leftPeak = hist[i]
  let rightPeak = 0
  for (let i = valleyBin + 1; i < NUM_BINS; i++) if (hist[i] > rightPeak) rightPeak = hist[i]

  const hasClearBimodalValley =
    leftPeak >= maxCount * 0.1 &&
    rightPeak >= Math.max(minCount * 2 + 2, maxCount * 0.02)

  if (hasClearBimodalValley) {
    return minY + (valleyBin + 0.5) * binSize
  }

  return detectOtsuThreshold(histogram, ys.length)
}
