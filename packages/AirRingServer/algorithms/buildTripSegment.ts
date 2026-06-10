import { TripSegment } from '../types'
import type { RingData } from '../connections/airRing'
import type { ThicknessData } from '../connections/thickness'
import { WithRequired } from '@jjsk/core'

type HistogramInfo = {
  minY: number
  maxY: number
  totalRange: number
  binSize: number
  hist: number[]
}

const NUM_BINS = 50

const buildHistogram = (ys: number[]): HistogramInfo | null => {
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

  return {
    minY,
    maxY,
    totalRange,
    binSize,
    hist,
  }
}

const refineThresholdFromSplit = (
  histogram: HistogramInfo,
  splitBin: number
): {
  threshold: number
  valleyCount: number
  leftPeakCount: number
  rightPeakCount: number
} | null => {
  const { minY, binSize, hist } = histogram

  let leftPeakBin = -1
  let leftPeakCount = 0
  for (let i = 0; i <= splitBin; i++) {
    if (hist[i] > leftPeakCount) {
      leftPeakCount = hist[i]
      leftPeakBin = i
    }
  }

  let rightPeakBin = -1
  let rightPeakCount = 0
  for (let i = splitBin + 1; i < hist.length; i++) {
    if (hist[i] > rightPeakCount) {
      rightPeakCount = hist[i]
      rightPeakBin = i
    }
  }

  if (leftPeakBin < 0 || rightPeakBin < 0) return null

  let valleyBin = splitBin
  let valleyCount = hist[splitBin]
  if (leftPeakBin + 1 <= rightPeakBin - 1) {
    valleyCount = Infinity
    for (let i = leftPeakBin + 1; i <= rightPeakBin - 1; i++) {
      if (hist[i] < valleyCount) {
        valleyCount = hist[i]
        valleyBin = i
      }
    }
  }

  return {
    threshold: minY + (valleyBin + 0.5) * binSize,
    valleyCount,
    leftPeakCount,
    rightPeakCount,
  }
}

const detectOtsuThreshold = (
  histogram: HistogramInfo,
  sampleCount: number
): number | null => {
  const { hist } = histogram
  if (sampleCount < 50) return null

  let totalMean = 0
  for (let i = 0; i < hist.length; i++) {
    totalMean += i * (hist[i] / sampleCount)
  }

  let totalVariance = 0
  for (let i = 0; i < hist.length; i++) {
    const delta = i - totalMean
    totalVariance += (hist[i] / sampleCount) * delta * delta
  }
  if (!isFinite(totalVariance) || totalVariance === 0) return null

  let sum = 0
  for (let i = 0; i < hist.length; i++) {
    sum += i * hist[i]
  }

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
    const betweenVariance =
      leftRatio * rightRatio * (leftMean - rightMean) * (leftMean - rightMean)

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
 * 对于真实测厚仪数据，扫描头出界时的读数（无薄膜，辐射穿透率高）明显高于
 * 在界时的读数，形成清晰的双峰分布。本函数自动检测两峰之间的谷底作为阈值，
 * 高于阈值的数据点将被标记为 NaN（出界）。
 *
 * @returns 阈值，若无明显双峰分布则返回 null
 */
const detectBimodalThreshold = (ys: number[]): number | null => {
  const histogram = buildHistogram(ys)
  if (!histogram) return null

  const { minY, binSize, hist } = histogram

  let maxCount = 0
  for (const c of hist) if (c > maxCount) maxCount = c

  // 在中间 80% 的区间内找密度最低的 bin（谷底）
  const startBin = Math.floor(NUM_BINS * 0.1)
  const endBin = Math.floor(NUM_BINS * 0.9)
  let minCount = Infinity
  let valleyBin = -1
  for (let i = startBin; i <= endBin; i++) {
    if (hist[i] < minCount) {
      minCount = hist[i]
      valleyBin = i
    }
  }

  // 谷底密度须明显低于峰值（<30%），且谷底两侧都有显著的峰
  if (minCount > maxCount * 0.3) return null
  let leftPeak = 0
  for (let i = 0; i < valleyBin; i++) if (hist[i] > leftPeak) leftPeak = hist[i]
  let rightPeak = 0
  for (let i = valleyBin + 1; i < NUM_BINS; i++)
    if (hist[i] > rightPeak) rightPeak = hist[i]
  // 左侧峰（在界区）须为主峰；
  // 右侧峰（出界区）在真实采集数据中仅占约 10–15%，无法达到旧的 20% 要求。
  // 改为：右侧峰须高于谷底的 2 倍（是真正的局部峰，而非噪声）
  // 且绝对值不低于最大值的 2%（排除极端噪声）
  const hasClearBimodalValley =
    leftPeak >= maxCount * 0.1 &&
    rightPeak >= Math.max(minCount * 2 + 2, maxCount * 0.02)

  if (hasClearBimodalValley) {
    return minY + (valleyBin + 0.5) * binSize
  }

  // 当双峰高度极不平衡时，传统“左右峰都明显”的规则会失效。
  // 退回到 Otsu 二类分割，但仍要求两侧都有足够样本且中间存在明显谷底，避免对单峰噪声误判。
  return detectOtsuThreshold(histogram, ys.length)
}

const extractSegment = (
  data: WithRequired<ThicknessData, 'timestamp'>[],
  startTime: number,
  duration: number,
  minPoints: number = 100,
  outOfBoundsThreshold: number | null = null,
  /**
   * 可选的探头值转换函数。
   *
   * **仅用于历史样本数据文件（`data/01-05`）场景。**
   * 这些文件的 ProbeValue 是直接采集的原始**光通量**，而非 μm。
   * 算法接口和仿真器均以膜厚 μm 为单位，生产代码路径无需传此参数。
   *
   * 对于只依赖相对变化的算法（如 θ_max 估算），光通量值可直接使用，
   * 无需转换；若需要验证依赖实际 μm 值的下游算法，则需传入标定公式。
   *
   * @example
   * // 使用样本数据验证需要实际厚度的算法时：
   * probeValueConverter: (raw) => gain * raw + offset
   */
  probeValueConverter?: (rawProbeValue: number) => number
) => {
  // 保留 rawY 用于双峰阈值比对（阈值始终基于原始探头值计算）。
  // 当传入 probeValueConverter 时，y 是转换后的值（μm）；否则与 rawY 相同。
  // 对于样本数据（光通量），双峰阈值在光通量域检测出界，
  // 而输出的 y 可以是光通量（θ_max 估算场景）或转换后的 μm（下游算法场景）。
  const valid = data
    .filter((d) => {
      return d.timestamp >= startTime && d.timestamp <= startTime + duration
    })
    .map((d) => {
      const raw = d.ProbeValue!
      return {
        t: d.timestamp - startTime,
        rawY: raw,
        y: probeValueConverter ? probeValueConverter(raw) : raw,
        pulse: d.HorizontalPulse,
      }
    })

  if (valid.length < minPoints) return []

  // 双峰阈值在原始值域内检测（出界点在真实数据中表现为极大的原始光通量值）
  const threshold =
    outOfBoundsThreshold ??
    (() => {
      const rawYs = valid.map((p) => p.rawY).filter((y) => isFinite(y))
      return rawYs.length > 50 ? detectBimodalThreshold(rawYs) : null
    })()

  if (threshold !== null) {
    // 比对原始值，但输出转换后的 y（或 NaN 表示出界）
    return valid.map(({ rawY, t, y, pulse }) => ({
      t,
      y: rawY > threshold ? NaN : y,
      pulse,
    }))
  }

  return valid.map(({ t, y, pulse }) => ({ t, y, pulse }))
}
/**
 * 生成旋转单程片段数据
 *
 * @param options.probeValueConverter 可选的探头值转换函数，**仅用于历史样本数据验证场景**。
 *   样本数据文件（`data/01-05`）的 ProbeValue 是原始光通量，而算法和仿真器均以 μm 为单位。
 *   对于 θ_max 估算等只依赖相对变化的算法，无需转换；
 *   若需验证依赖实际 μm 值的下游算法，则需传入标定公式。
 *   生产代码路径（OPC UA 实时数据 / 仿真器）无需传此参数。
 * */
export const buildTripSegment = (options?: {
  probeValueConverter?: (rawProbeValue: number) => number
}) => {
  const { probeValueConverter } = options ?? {}
  const segments: TripSegment[] = []

  let validThickness: WithRequired<
    ThicknessData,
    'timestamp' | 'ProbeValue'
  >[] = []

  // 跨所有行程累积原始探头值，用于计算全局双峰阈值
  // 全局阈值比逐段阈值更稳定，确保各段出界判断一致
  const allRawProbeValues: number[] = []

  const next = ({
    thickness,
    airRing,
  }: {
    thickness?: ThicknessData
    airRing?: RingData
  }) => {
    if (airRing) {
      if (!airRing.timestamp) return segments

      const currentSignal =
        !!airRing.ForwardRotation && !airRing.ReverseRotation
      if (segments.length > 0) {
        const prevSegment = segments[segments.length - 1]
        prevSegment.duration = airRing.timestamp - prevSegment.startTime

        if (currentSignal !== prevSegment.isForward) {
          // 从所有已累积数据计算全局双峰阈值
          const globalThreshold = detectBimodalThreshold(allRawProbeValues)
          prevSegment.measurements = extractSegment(
            validThickness,
            prevSegment.startTime,
            prevSegment.duration,
            100,
            globalThreshold,
            probeValueConverter
          )
          validThickness = []
          segments.push({
            startTime: airRing.timestamp,
            duration: 0,
            isForward: currentSignal,
            measurements: [],
          })
        }
      } else {
        segments.push({
          startTime: airRing.timestamp,
          duration: 0,
          isForward: currentSignal,
          measurements: [],
        })
      }
    }
    if (thickness) {
      if (thickness.timestamp) {
        if ((thickness.ProbeValue || 0) > 0) {
          // 限制当前段缓冲区大小：ADBox 1ms 采样时，一个典型上旋行程约 5-10 分钟，
          // 约 300,000-600,000 点；生产现场最长行程约 30 分钟。
          // 上限 2,000,000 约等于 33 分钟，足以覆盖完整行程，
          // 同时防止极端情况（信号长时间不切换）下内存无限增长。
          if (validThickness.length < 2_000_000) {
            validThickness.push(
              thickness as WithRequired<ThicknessData, 'timestamp' | 'ProbeValue'>
            )
          }
          // 同步累积到全局分布数组（用于阈值计算），最多保留 50000 个采样
          if (allRawProbeValues.length < 50000) {
            allRawProbeValues.push(thickness.ProbeValue!)
          }
        }
      }
    }
    return segments
  }
  return { next }
}
