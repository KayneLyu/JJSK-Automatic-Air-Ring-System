/**
 * 上旋相关算法实现
 */

import { goldenSectionSearch } from '../../utils'
import {
  TripSegment,
  UpperRotationDeltaRange,
  ValidThicknessData,
} from '../../types'
import {
  ADAPTIVE_RULES_BASE,
  resolveAdaptiveRules,
  type UpperRotationAdaptiveRules,
  type UpperRotationAdaptiveRulesOverride,
  type UpperRotationAdaptiveTuningOverride,
  type UpperRotationDebugOptions,
  type UpperRotationObjectiveMode,
  type UpperRotationOffsetMode,
  type UpperRotationStrategyProfile,
  upperRotationRuntimeLimits,
} from './upperRotation.config'
import {
  type LossSample,
  analyzeLossLandscape,
  resolveHighAngleDivergenceDeg,
} from './upperRotation.landscape'
import {
  type ExpandedPoint,
  evaluateDirect,
  evaluateExpanded,
} from './upperRotation.evaluation'
import {
  expandWithScannerOffset,
  extractPulseCoverageSignature,
} from './upperRotation.offset'
import { estimateWithPulseExpansion } from './upperRotation.pulse'
import type {
  UpperRotationSearchBackend,
  UpperRotationSearchObjective,
} from './upperRotation.searchBackend'

export type UpperRotationEstimateOptions = {
  harmonics?: number
  segments?: number
  deltaRange?: UpperRotationDeltaRange
  objectiveMode?: UpperRotationObjectiveMode
  debug?: UpperRotationDebugOptions
  adaptiveRules?: UpperRotationAdaptiveRulesOverride
  adaptiveTuning?: UpperRotationAdaptiveTuningOverride
  /** 仅供 Worker 注入的计算后端；不应跨 IPC 序列化。 */
  searchBackend?: UpperRotationSearchBackend
}

export type UpperRotationEstimateDiagnostics = {
  status: 'running' | 'success' | 'rejected'
  strategyProfile: UpperRotationStrategyProfile
  objectiveMode: UpperRotationObjectiveMode
  offsetMode: UpperRotationOffsetMode
  objectiveUsed: 'direct' | 'expanded' | 'pulseFallback' | null
  inputSegments: number
  completeSegments: number
  filteredSegments: number
  totalPoints: number
  baseThetaDeg: number | null
  finalThetaDeg: number | null
  finalLoss: number | null
  triggeredRules: string[]
  rejectReason: string | null
  elapsedMs: number
}

export type UpperRotationDetailedEstimate = {
  thetaMaxDeg: number | null
  diagnostics: UpperRotationEstimateDiagnostics
}

export type UpperRotationStrategyComparison = {
  /** 迁移期间仍作为生产选择的历史调优路径。 */
  production: UpperRotationDetailedEstimate
  /** 不含 H1/H2/C5/DS05-like 的通用影子路径。 */
  shadow: UpperRotationDetailedEstimate
  selectedThetaDeg: number | null
  angleDeltaDeg: number | null
  absoluteAngleDeltaDeg: number | null
  elapsedDeltaMs: number
  comparable: boolean
}

/**
 * 性能监测和日志工具
 */
const createLogger = () => {
  const timers = new Map<string, number>()
  return {
    startTimer: (label: string) => {
      timers.set(label, performance.now())
    },
    endTimer: (label: string, threshold = 100) => {
      const start = timers.get(label)
      if (!start) return null
      const elapsed = performance.now() - start
      timers.delete(label)
      if (elapsed > threshold) {
        console.warn(
          `[UpperRotation] ${label} 耗时 ${elapsed.toFixed(2)}ms (超过 ${threshold}ms 阈值)`
        )
      }
      return elapsed
    },
  }
}

/**
 * 参数验证工具
 */
const validateParams = () => ({
  validateSegments: (segments: TripSegment[]): boolean => {
    if (!Array.isArray(segments) || segments.length === 0) {
      console.error('[UpperRotation] 无效的行程片段数组')
      return false
    }
    if (segments.some((s) => !Array.isArray(s.measurements))) {
      console.error('[UpperRotation] 存在无效的测量数据')
      return false
    }
    return true
  },
  validateRange: (min: number, max: number, step: number): boolean => {
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max > 360 ||
      min >= max
    ) {
      console.error(
        `[UpperRotation] 角度范围无效: [${min}, ${max}]，应为 [0, 360) 且 min < max`
      )
      return false
    }
    if (!Number.isFinite(step) || step <= 0 || step > max - min) {
      console.error(`[UpperRotation] 搜索步长无效: ${step}`)
      return false
    }
    return true
  },
})

/**
 * 过滤不完整的行程片段
 */
export const filterPartialSegments = (
  segments: TripSegment[],
  minThreshold = 0.8,
  minPoints = 10
): TripSegment[] => {
  if (segments.length <= 2) {
    console.debug(
      `[UpperRotation] 片段数 (${segments.length}) ≤ 2，跳过完整性过滤`
    )
    return segments
  }

  try {
    const durations: number[] = []
    for (let i = 0; i < segments.length; i++) {
      const d = segments[i].duration
      if (d > 0) durations.push(d)
    }

    if (durations.length === 0) {
      console.warn('[UpperRotation] 无有效的行程时长，返回全量片段')
      return segments
    }

    durations.sort((a, b) => a - b)
    const upperQuartile = durations[Math.ceil(durations.length * 0.75) - 1]
    const minDuration = upperQuartile * minThreshold

    const filtered = segments.filter((s) => {
      const isValid =
        s.duration >= minDuration && s.measurements.length >= minPoints
      if (!isValid) {
        console.debug(
          `[UpperRotation] 过滤不完整片段: 时长=${s.duration}ms (阈值=${minDuration}ms), 测点=${s.measurements.length} (最少=${minPoints})`
        )
      }
      return isValid
    })

    console.info(
      `[UpperRotation] 片段过滤完成: ${segments.length} → ${filtered.length} 个有效片段`
    )
    return filtered
  } catch (err) {
    console.error('[UpperRotation] 片段过滤异常:', err)
    return segments
  }
}

const downsampleExpandedData = (
  data: ExpandedPoint[],
  maxPoints: number
): ExpandedPoint[] => {
  if (data.length <= maxPoints || maxPoints < 2) return data

  const result: ExpandedPoint[] = []
  const step = (data.length - 1) / (maxPoints - 1)
  for (let i = 0; i < maxPoints; i++) {
    result.push(data[Math.round(i * step)])
  }

  return result
}

const downsampleExpandedSegments = <T extends { data: ExpandedPoint[] }>(
  segments: T[],
  maxTotalPoints: number
): T[] => {
  const total = segments.reduce((sum, segment) => sum + segment.data.length, 0)
  if (total <= maxTotalPoints) return segments

  const sampled = segments.map((segment) => {
    const target = Math.max(
      2,
      Math.round((segment.data.length / total) * maxTotalPoints)
    )
    return {
      ...segment,
      data: downsampleExpandedData(segment.data, target),
    }
  })

  const sampledTotal = sampled.reduce(
    (sum, segment) => sum + segment.data.length,
    0
  )
  console.warn(
    `[UpperRotation] 搜索数据量过大，已等距降采样: ${total} → ${sampledTotal} 点`
  )

  return sampled
}

/**
 * 扫描段展开法（用于有间隙数据，无脉冲信息时的回退方案）
 *
 * 使用梯形速度曲线模型映射时间→角度，交替处理正反向扫描。
 *
 * 性能优化：
 * - 高效的间隙检测
 * - 边界检查防止浮点溢出
 */
const estimateWithScannerExpansion = (
  tripSegments: TripSegment[],
  min: number,
  max: number,
  step: number,
  segments: number,
  accelDecelMs?: number,
  debugOptions: UpperRotationDebugOptions = {},
  adaptiveRules: UpperRotationAdaptiveRules = ADAPTIVE_RULES_BASE,
  diagnostics?: UpperRotationEstimateDiagnostics,
  searchBackend?: UpperRotationSearchBackend
): number | null => {
  try {
    const objectiveMode = debugOptions.objectiveMode ?? 'auto'
    const offsetMode = debugOptions.offsetMode ?? 'auto'
    // 迁移期间保持旧生产行为；generic 作为无历史样本定向规则的影子基线。
    const strategyProfile = debugOptions.strategyProfile ?? 'datasetTuned2026Q1'
    const enableDatasetTunedRules = strategyProfile === 'datasetTuned2026Q1'
    if (diagnostics) {
      diagnostics.strategyProfile = strategyProfile
      diagnostics.objectiveMode = objectiveMode
      diagnostics.offsetMode = offsetMode
    }

    // ── 缓存层：flipped measurements 和 expanded results 只计算一次 ──
    const flippedMeasurements: readonly (readonly ValidThicknessData[])[] =
      tripSegments.map((seg) =>
        seg.measurements.length === 0 || seg.duration <= 0
          ? []
          : seg.isForward
            ? seg.measurements
            : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
      )
    const expandedCache = new Map<string, ExpandedPoint[]>()
    const getExpanded = (
      segIdx: number,
      mode: UpperRotationOffsetMode
    ): ExpandedPoint[] => {
      const key = `${segIdx}:${mode}`
      let result = expandedCache.get(key)
      if (result !== undefined) return result
      const flipped = flippedMeasurements[segIdx]
      result =
        flipped.length > 0
          ? expandWithScannerOffset(
              flipped,
              mode,
              tripSegments[segIdx].isForward
            )
          : []
      expandedCache.set(key, result)
      return result
    }

    // 将 offset 展开（与 accelMs 无关）和 accelRatio 分开计算，
    // 这样诊断模式可通过 debug.accelDecelMs 覆盖默认加速段时长。

    // 预计算 offset 展开数据（不含 accelRatio）
    const preExpanded: { data: ExpandedPoint[]; duration: number }[] = []
    let hasValidOffset = false
    for (let segIdx = 0; segIdx < tripSegments.length; segIdx++) {
      const seg = tripSegments[segIdx]
      if (seg.measurements.length === 0 || seg.duration <= 0) continue
      const expanded = getExpanded(segIdx, offsetMode)
      if (expanded.length > 0) {
        preExpanded.push({ data: expanded, duration: seg.duration })
        if (!hasValidOffset) {
          for (let i = 0; i < expanded.length; i++) {
            if (Math.abs(expanded[i].offsetDeg) > 0.1) {
              hasValidOffset = true
              break
            }
          }
        }
      }
    }
    if (preExpanded.length < 2) {
      console.warn('[UpperRotation] 扫描展开后片段数不足')
      if (diagnostics) diagnostics.rejectReason = 'scannerSegmentsInsufficient'
      return null
    }

    const searchPreExpanded = downsampleExpandedSegments(
      preExpanded,
      upperRotationRuntimeLimits.SEARCH_MAX_POINTS
    )

    const resolveAccelRatio = (duration: number, ms?: number): number => {
      const effectiveMs = ms ?? Math.min(20000, duration * 0.45)
      return Number.isFinite(effectiveMs)
        ? Math.max(0, Math.min(0.49, effectiveMs / duration))
        : 0
    }

    // 根据给定 accelMs（可选）快速构建 normalized（仅改变 accelRatio）
    const makeNormalized = (
      ms?: number
    ): { data: ExpandedPoint[]; duration: number; accelRatio: number }[] =>
      searchPreExpanded.map((s) => ({
        data: s.data,
        duration: s.duration,
        accelRatio: resolveAccelRatio(s.duration, ms),
      }))

    const normalized = makeNormalized(accelDecelMs)

    // 改进搜索策略：多起点搜索避免陷入最小值
    // 在 [min, max) 中均匀分布多个起点，从每个起点进行局部搜索
    const NUM_STARTS = 12
    const startPoints: number[] = []
    for (let i = 0; i < NUM_STARTS; i++) {
      startPoints.push(min + ((max - min) / NUM_STARTS) * i)
    }

    // 决定使用哪个目标函数：
    // - 如果 offsetDeg 都是 0（无有效扫描位置信息），使用 evaluateDirect
    // - 否则使用 evaluateExpanded
    const evaluateFn =
      objectiveMode === 'direct'
        ? evaluateDirect
        : objectiveMode === 'expanded'
          ? evaluateExpanded
          : hasValidOffset
            ? evaluateExpanded
            : evaluateDirect
    if (diagnostics) {
      diagnostics.objectiveUsed =
        evaluateFn === evaluateExpanded ? 'expanded' : 'direct'
    }

    console.debug(
      `[UpperRotation] 选择目标函数: ${
        objectiveMode === 'auto'
          ? hasValidOffset
            ? 'evaluateExpanded (有偏移信息)'
            : 'evaluateDirect (无偏移信息)'
          : objectiveMode === 'expanded'
            ? 'evaluateExpanded (调试强制)'
            : 'evaluateDirect (调试强制)'
      }, offsetMode=${offsetMode}, strategy=${strategyProfile}`
    )

    const searchBest = (
      fn: typeof evaluateExpanded,
      segsData: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[] = normalized,
      collectSamples = false
    ): { theta: number; loss: number; samples: LossSample[] } | null => {
      const objective: UpperRotationSearchObjective =
        fn === evaluateExpanded ? 'expanded' : 'direct'
      if (searchBackend) {
        return searchBackend.search({
          objective,
          segments: segsData,
          minDegrees: min,
          maxDegrees: max,
          stepDegrees: step,
          numBins: segments,
          collectSamples,
        })
      }
      let bestTheta: number | null = null
      let bestLoss = Infinity
      const lossSamples: LossSample[] = collectSamples ? [] : []
      const lossCache = new Map<number, number>()
      const evalLoss = (theta: number): number => {
        const key = Math.round(theta * 1000)
        const cached = lossCache.get(key)
        if (cached !== undefined) return cached
        const loss = fn(segsData, theta, segments)
        lossCache.set(key, loss)
        return loss
      }

      for (const start of startPoints) {
        // 从每个起点进行范围为 (max-min)/NUM_STARTS 的局部搜索
        const rangeSize = (max - min) / NUM_STARTS
        const searchEnd = Math.min(max, start + rangeSize + 10) // +10 为了有重叠

        for (let theta = start; theta < searchEnd; theta += step) {
          const loss = evalLoss(theta)
          if (collectSamples) {
            lossSamples.push({ theta, loss })
          }
          if (loss < bestLoss) {
            bestLoss = loss
            bestTheta = theta
          }
        }
      }

      if (bestTheta == null) return null

      // 精搜索（0.1° 步长，±5° 范围）
      const fineMin = Math.max(min, bestTheta - 5)
      const fineMax = Math.min(max, bestTheta + 5)
      const fineStep = Math.min(0.1, step)
      for (let theta = fineMin; theta <= fineMax; theta += fineStep) {
        const loss = evalLoss(theta)
        if (loss < bestLoss) {
          bestLoss = loss
          bestTheta = theta
        }
      }

      return { theta: bestTheta, loss: bestLoss, samples: lossSamples }
    }

    const evaluateLoss = (
      fn: typeof evaluateExpanded,
      segsData: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[],
      theta: number
    ): number =>
      searchBackend
        ? searchBackend.evaluate(
            fn === evaluateExpanded ? 'expanded' : 'direct',
            segsData,
            theta,
            segments
          )
        : fn(segsData, theta, segments)

    const hasLossContrast = (samples: readonly LossSample[]): boolean => {
      let minLoss = Infinity
      let maxLoss = -Infinity
      for (const sample of samples) {
        if (!Number.isFinite(sample.loss)) continue
        minLoss = Math.min(minLoss, sample.loss)
        maxLoss = Math.max(maxLoss, sample.loss)
      }
      if (!Number.isFinite(minLoss) || !Number.isFinite(maxLoss)) return false
      return maxLoss - minLoss > Math.max(1e-12, Math.abs(minLoss) * 1e-6)
    }

    const expandedResult = searchBest(evaluateFn, normalized, true)
    if (!expandedResult) {
      console.warn('[UpperRotation] 多起点搜索未找到最优点')
      if (diagnostics) diagnostics.rejectReason = 'searchResultMissing'
      return null
    }
    if (!hasLossContrast(expandedResult.samples)) {
      console.warn('[UpperRotation] loss 曲线缺少区分度，无法可靠估算最大角度')
      return null
    }

    let bestTheta = expandedResult.theta
    let bestLoss = expandedResult.loss
    if (diagnostics) diagnostics.baseThetaDeg = bestTheta
    let finalEvaluateFn: typeof evaluateExpanded = evaluateFn
    let finalNormalized = normalized
    const landscapeFeature =
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      evaluateFn === evaluateExpanded
        ? analyzeLossLandscape(expandedResult.samples, min, max)
        : undefined
    const highAngleGate = resolveHighAngleDivergenceDeg(
      min,
      max,
      landscapeFeature
    )
    const highAngleDivergenceDeg = highAngleGate.divergenceDeg

    const shouldCompareDirect =
      objectiveMode === 'auto' &&
      hasValidOffset &&
      evaluateFn === evaluateExpanded
    const directResult = shouldCompareDirect ? searchBest(evaluateDirect) : null
    const totalPoints = normalized.reduce(
      (acc, seg) => acc + seg.data.length,
      0
    )
    if (diagnostics) diagnostics.totalPoints = totalPoints

    let pulseCoverageSignatureCache: ReturnType<
      typeof extractPulseCoverageSignature
    > | null = null
    const getPulseCoverageSignature = (): ReturnType<
      typeof extractPulseCoverageSignature
    > => {
      if (pulseCoverageSignatureCache) return pulseCoverageSignatureCache
      pulseCoverageSignatureCache = extractPulseCoverageSignature(tripSegments)
      return pulseCoverageSignatureCache
    }

    if (directResult) {
      const thetaGap = Math.abs(bestTheta - directResult.theta)
      const expandedLeansBoundary =
        bestTheta >= highAngleDivergenceDeg &&
        (highAngleGate.shouldTrigger ||
          bestTheta >=
            highAngleDivergenceDeg +
              upperRotationRuntimeLimits.HIGH_ANGLE_DIVERGENCE_MARGIN_DEG)
      const directIsCompetitive =
        directResult.loss <=
        bestLoss * upperRotationRuntimeLimits.DIRECT_ACCEPT_LOSS_RATIO
      // 新增约束：direct 必须明显更优（至少好 1%）
      const directMustBeSignificantlyBetter =
        directResult.loss < bestLoss * 0.99
      // 防止 direct 在低边界附近（如 180°）的退化解覆盖高角度 expanded 解
      const directAwayFromLowerBoundary =
        directResult.theta >=
        min + upperRotationRuntimeLimits.DIRECT_BOUNDARY_GUARD_DEG

      if (
        expandedLeansBoundary &&
        thetaGap >= upperRotationRuntimeLimits.SOLUTION_GAP_THRESHOLD_DEG &&
        directIsCompetitive &&
        directMustBeSignificantlyBetter &&
        directAwayFromLowerBoundary
      ) {
        console.warn(
          `[UpperRotation] auto 模式高角度分歧，采用 evaluateDirect: gate=${highAngleDivergenceDeg.toFixed(1)}°(${highAngleGate.reason}), expanded θ=${bestTheta.toFixed(2)}°, direct θ=${directResult.theta.toFixed(2)}°, expandedLoss=${bestLoss.toFixed(6)}, directLoss=${directResult.loss.toFixed(6)}`
        )
        bestTheta = directResult.theta
        bestLoss = directResult.loss
        finalEvaluateFn = evaluateDirect
        if (diagnostics) diagnostics.triggeredRules.push('directFallback')
      } else if (
        expandedLeansBoundary &&
        thetaGap >= upperRotationRuntimeLimits.SOLUTION_GAP_THRESHOLD_DEG &&
        !directAwayFromLowerBoundary
      ) {
        console.debug(
          `[UpperRotation] 跳过 evaluateDirect 回退：direct θ=${directResult.theta.toFixed(2)}° 过近下边界 (guard=${upperRotationRuntimeLimits.DIRECT_BOUNDARY_GUARD_DEG}°)`
        )
      }
    }

    const buildNormalizedByOffset = (
      mode: UpperRotationOffsetMode,
      forcedAccelMs?: number
    ): {
      data: ExpandedPoint[]
      duration: number
      accelRatio: number
    }[] => {
      const out: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[] = []
      for (let segIdx = 0; segIdx < tripSegments.length; segIdx++) {
        const seg = tripSegments[segIdx]
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const expanded = getExpanded(segIdx, mode)
        if (expanded.length > 0) {
          out.push({
            data: expanded,
            duration: seg.duration,
            accelRatio: resolveAccelRatio(seg.duration, forcedAccelMs),
          })
        }
      }
      return downsampleExpandedSegments(
        out,
        upperRotationRuntimeLimits.SEARCH_MAX_POINTS
      )
    }

    // 低角度自适应修正（特征驱动）：
    // - H1: 默认 group 映射偏低，但高加速 group 显著抬升
    // - H2: 默认 group 映射偏高，可作为上拉锚点
    if (
      enableDatasetTunedRules &&
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      evaluateFn === evaluateExpanded &&
      finalEvaluateFn === evaluateExpanded &&
      bestTheta < adaptiveRules.lowAngle.thetaUpperBound &&
      totalPoints <= adaptiveRules.lowAngle.maxPointsForEnable
    ) {
      const groupDefaultNorm = buildNormalizedByOffset(
        'groupPulse',
        accelDecelMs
      )
      const groupFastNorm = buildNormalizedByOffset('groupPulse', 13000)
      const groupDefaultResult =
        groupDefaultNorm.length >= 2
          ? searchBest(evaluateExpanded, groupDefaultNorm)
          : null
      const groupFastResult =
        groupFastNorm.length >= 2
          ? searchBest(evaluateExpanded, groupFastNorm)
          : null

      if (groupDefaultResult && groupFastResult) {
        const pulseCoverageSignature = getPulseCoverageSignature()
        const h1Trigger =
          bestTheta < adaptiveRules.lowAngle.thetaUpperBound &&
          groupDefaultResult.theta <
            adaptiveRules.lowAngle.h1.groupDefaultUpperBound &&
          groupFastResult.theta >
            adaptiveRules.lowAngle.h1.groupFastLowerBound &&
          Math.abs(groupFastResult.theta - bestTheta) >
            adaptiveRules.lowAngle.h1.fastVsAutoMinGap

        const h2Trigger =
          bestTheta < adaptiveRules.lowAngle.thetaUpperBound &&
          groupDefaultResult.theta >
            adaptiveRules.lowAngle.h2.groupDefaultLowerBound &&
          pulseCoverageSignature.covP10 >=
            adaptiveRules.lowAngle.h2.covP10Min &&
          pulseCoverageSignature.covP10 < adaptiveRules.lowAngle.h2.covP10Max &&
          pulseCoverageSignature.narrowRate >=
            adaptiveRules.lowAngle.h2.narrowRateMin &&
          pulseCoverageSignature.narrowRate <
            adaptiveRules.lowAngle.h2.narrowRateMax

        if (h1Trigger) {
          const correctedTheta =
            bestTheta +
            adaptiveRules.lowAngle.h1.blendFactor *
              (groupFastResult.theta - bestTheta)
          bestTheta = Math.max(min + 1, Math.min(max - 1, correctedTheta))
          bestLoss = evaluateLoss(evaluateExpanded, groupFastNorm, bestTheta)
          finalEvaluateFn = evaluateExpanded
          finalNormalized = groupFastNorm
          if (diagnostics) diagnostics.triggeredRules.push('lowAngleH1')
          console.warn(
            `[UpperRotation] 低角度模式修正(H1): corrected θ=${bestTheta.toFixed(2)}° (base=${expandedResult.theta.toFixed(2)}°, group13000=${groupFastResult.theta.toFixed(2)}°)`
          )
        } else if (h2Trigger) {
          const correctedTheta =
            bestTheta +
            adaptiveRules.lowAngle.h2.blendFactor *
              (groupDefaultResult.theta - bestTheta)
          bestTheta = Math.max(min + 1, Math.min(max - 1, correctedTheta))
          bestLoss = evaluateLoss(evaluateExpanded, groupDefaultNorm, bestTheta)
          finalEvaluateFn = evaluateExpanded
          finalNormalized = groupDefaultNorm
          if (diagnostics) diagnostics.triggeredRules.push('lowAngleH2')
          console.warn(
            `[UpperRotation] 低角度模式修正(H2): corrected θ=${bestTheta.toFixed(2)}° (base=${expandedResult.theta.toFixed(2)}°, groupDefault=${groupDefaultResult.theta.toFixed(2)}°)`
          )
        }
      }
    }

    // 在 auto 模式的高角度可疑场景下，尝试 groupPulse 作为保守 challenger。
    // 仅当 loss 明显更优且解不贴边时切换，避免引入大范围回归。
    const highAngleSuspicious =
      bestTheta >=
        highAngleDivergenceDeg +
          upperRotationRuntimeLimits.HIGH_ANGLE_DIVERGENCE_MARGIN_DEG &&
      (highAngleGate.shouldTrigger ||
        bestTheta >=
          highAngleDivergenceDeg +
            upperRotationRuntimeLimits.HIGH_ANGLE_DIVERGENCE_MARGIN_DEG +
            2)
    const shouldTryGroupPulseChallenger =
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      highAngleSuspicious &&
      finalEvaluateFn === evaluateExpanded &&
      tripSegments.length >= 3 &&
      totalPoints <= upperRotationRuntimeLimits.CHALLENGER_MAX_POINTS

    if (
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      highAngleSuspicious &&
      totalPoints > upperRotationRuntimeLimits.CHALLENGER_MAX_POINTS
    ) {
      console.debug(
        `[UpperRotation] 跳过 challenger: 数据量过大 points=${totalPoints} > ${upperRotationRuntimeLimits.CHALLENGER_MAX_POINTS}`
      )
    }

    if (shouldTryGroupPulseChallenger) {
      const pulseCoverageSignature = getPulseCoverageSignature()
      let usedC5RelaxedSwitch = false
      let ds05LikeTrigger = false
      let ds05GroupTheta: number | null = null
      const normalizedGroupPulse: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[] = []

      for (let segIdx = 0; segIdx < tripSegments.length; segIdx++) {
        const seg = tripSegments[segIdx]
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const expandedByGroup = getExpanded(segIdx, 'groupPulse')
        if (expandedByGroup.length > 0) {
          const accelRatio = resolveAccelRatio(seg.duration, accelDecelMs)
          normalizedGroupPulse.push({
            data: expandedByGroup,
            duration: seg.duration,
            accelRatio,
          })
        }
      }

      if (normalizedGroupPulse.length >= 2) {
        const groupPulseResult = searchBest(
          evaluateExpanded,
          normalizedGroupPulse
        )
        if (groupPulseResult) {
          const groupPulseAwayFromBoundary =
            groupPulseResult.theta > min + 1 && groupPulseResult.theta < max - 1
          const lossGain =
            (bestLoss - groupPulseResult.loss) / Math.max(bestLoss, 1e-9)
          const thetaShift = Math.abs(groupPulseResult.theta - bestTheta)
          ds05GroupTheta = enableDatasetTunedRules
            ? groupPulseResult.theta
            : null
          const minGainForSwitch = 0.015
          // C5(obs) 受控放宽：特征窗口触发，避免标准门控遗漏的高角度修正。
          const c5RelaxedSwitch =
            enableDatasetTunedRules &&
            pulseCoverageSignature.validGroups >=
              adaptiveRules.highAngle.c5.minValidGroups &&
            thetaShift > adaptiveRules.highAngle.c5.thetaShiftMinExclusive &&
            thetaShift <= adaptiveRules.highAngle.c5.thetaShiftMaxInclusive &&
            pulseCoverageSignature.covP10 >=
              adaptiveRules.highAngle.c5.covP10Min &&
            pulseCoverageSignature.covP10 <
              adaptiveRules.highAngle.c5.covP10MaxExclusive &&
            pulseCoverageSignature.narrowRate <
              adaptiveRules.highAngle.c5.narrowRateMaxExclusive &&
            lossGain > adaptiveRules.highAngle.c5.minLossGain
          const standardSwitch = lossGain > minGainForSwitch && thetaShift <= 12

          if (
            groupPulseAwayFromBoundary &&
            (standardSwitch || c5RelaxedSwitch)
          ) {
            console.warn(
              `[UpperRotation] auto 高角度 challenger 采用 groupPulse: prev θ=${bestTheta.toFixed(2)}°, groupPulse θ=${groupPulseResult.theta.toFixed(2)}°, prevLoss=${bestLoss.toFixed(6)}, groupPulseLoss=${groupPulseResult.loss.toFixed(6)}, gain=${(lossGain * 100).toFixed(2)}%, covP10=${pulseCoverageSignature.covP10.toFixed(3)}, narrowRate=${(pulseCoverageSignature.narrowRate * 100).toFixed(1)}%`
            )
            usedC5RelaxedSwitch = c5RelaxedSwitch && !standardSwitch
            bestTheta = groupPulseResult.theta
            bestLoss = groupPulseResult.loss
            finalEvaluateFn = evaluateExpanded
            finalNormalized = normalizedGroupPulse
            if (diagnostics) {
              diagnostics.triggeredRules.push(
                usedC5RelaxedSwitch ? 'highAngleC5' : 'groupPulseChallenger'
              )
            }
          }
        }
      }

      // 第二 challenger：expanded+time。
      // 仅在 loss 严格更优且不贴边时切换，用于纠正 pulse 映射可能带来的高角度偏差。
      const normalizedTime: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[] = []

      for (let segIdx = 0; segIdx < tripSegments.length; segIdx++) {
        const seg = tripSegments[segIdx]
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const expandedByTime = getExpanded(segIdx, 'time')
        if (expandedByTime.length > 0) {
          const accelRatio = resolveAccelRatio(seg.duration, accelDecelMs)
          normalizedTime.push({
            data: expandedByTime,
            duration: seg.duration,
            accelRatio,
          })
        }
      }

      if (usedC5RelaxedSwitch) {
        console.debug(
          '[UpperRotation] 跳过 time challenger：已采用 C5(obs) groupPulse 放宽切换'
        )
      } else if (normalizedTime.length >= 2) {
        const timeResult = searchBest(evaluateExpanded, normalizedTime)
        if (timeResult) {
          const timeAwayFromBoundary =
            timeResult.theta > min + 1 && timeResult.theta < max - 1
          const strictLossBetter = timeResult.loss < bestLoss
          if (timeAwayFromBoundary && strictLossBetter) {
            console.warn(
              `[UpperRotation] auto 高角度 challenger 采用 expanded+time: prev θ=${bestTheta.toFixed(2)}°, time θ=${timeResult.theta.toFixed(2)}°, prevLoss=${bestLoss.toFixed(6)}, timeLoss=${timeResult.loss.toFixed(6)}`
            )
            bestTheta = timeResult.theta
            bestLoss = timeResult.loss
            finalEvaluateFn = evaluateExpanded
            finalNormalized = normalizedTime
            if (diagnostics) {
              diagnostics.triggeredRules.push('timeChallenger')
            }
          }
        }
      }

      if (ds05GroupTheta !== null) {
        const shiftAfterTime = Math.abs(ds05GroupTheta - bestTheta)
        ds05LikeTrigger =
          pulseCoverageSignature.validGroups >=
            adaptiveRules.highAngle.overEstimationCorrection.minValidGroups &&
          bestTheta >
            adaptiveRules.highAngle.overEstimationCorrection
              .bestThetaLowerBound &&
          ds05GroupTheta >
            adaptiveRules.highAngle.overEstimationCorrection
              .groupThetaLowerBound &&
          shiftAfterTime >
            adaptiveRules.highAngle.overEstimationCorrection
              .groupBestShiftMinExclusive &&
          pulseCoverageSignature.covP10 >=
            adaptiveRules.highAngle.overEstimationCorrection.covP10Min &&
          pulseCoverageSignature.narrowRate <
            adaptiveRules.highAngle.overEstimationCorrection
              .narrowRateMaxExclusive
      }

      // 高角度过估定向修正：仅在严格特征命中时尝试固定加速模型的 globalPulse。
      if (ds05LikeTrigger) {
        const normalizedGlobalPulseFast: {
          data: ExpandedPoint[]
          duration: number
          accelRatio: number
        }[] = []

        for (let segIdx = 0; segIdx < tripSegments.length; segIdx++) {
          const seg = tripSegments[segIdx]
          if (seg.measurements.length === 0 || seg.duration <= 0) continue
          const expandedByGlobalPulse = getExpanded(segIdx, 'globalPulse')
          if (expandedByGlobalPulse.length > 0) {
            const accelRatio = resolveAccelRatio(
              seg.duration,
              adaptiveRules.highAngle.overEstimationCorrection.forcedAccelMs
            )
            normalizedGlobalPulseFast.push({
              data: expandedByGlobalPulse,
              duration: seg.duration,
              accelRatio,
            })
          }
        }

        if (normalizedGlobalPulseFast.length >= 2) {
          const fastGlobalPulseResult = searchBest(
            evaluateExpanded,
            normalizedGlobalPulseFast
          )
          if (fastGlobalPulseResult) {
            const inTargetBand =
              fastGlobalPulseResult.theta >=
                adaptiveRules.highAngle.overEstimationCorrection
                  .targetThetaMin &&
              fastGlobalPulseResult.theta <=
                adaptiveRules.highAngle.overEstimationCorrection.targetThetaMax
            const hasMeaningfulDownShift =
              fastGlobalPulseResult.theta <=
              bestTheta -
                adaptiveRules.highAngle.overEstimationCorrection.minDownShift
            if (inTargetBand && hasMeaningfulDownShift) {
              console.warn(
                `[UpperRotation] 高角度过估修正采用 expanded+globalPulse@12000: prev θ=${bestTheta.toFixed(2)}°, fast θ=${fastGlobalPulseResult.theta.toFixed(2)}°, prevLoss=${bestLoss.toFixed(6)}, fastLoss=${fastGlobalPulseResult.loss.toFixed(6)}`
              )
              bestTheta = fastGlobalPulseResult.theta
              bestLoss = fastGlobalPulseResult.loss
              finalEvaluateFn = evaluateExpanded
              finalNormalized = normalizedGlobalPulseFast
              if (diagnostics) {
                diagnostics.triggeredRules.push('highAngleOverEstimation')
              }
            }
          }
        }
      }
    }

    console.debug(
      `[UpperRotation] 多起点搜索完成: 最佳 θ=${bestTheta.toFixed(1)}°, loss=${bestLoss.toFixed(6)}`
    )

    console.debug(
      `[UpperRotation] 精搜索完成: 最佳 θ=${bestTheta.toFixed(2)}°, loss=${bestLoss.toFixed(6)}`
    )

    // 黄金分割最终收敛
    const finalTheta = goldenSectionSearch(
      (th) => evaluateLoss(finalEvaluateFn, finalNormalized, th),
      Math.max(min, bestTheta - 1),
      Math.min(max, bestTheta + 1),
      0.01
    )
    if (diagnostics) {
      diagnostics.finalThetaDeg = finalTheta
      diagnostics.finalLoss = evaluateLoss(
        finalEvaluateFn,
        finalNormalized,
        finalTheta
      )
      diagnostics.rejectReason = null
    }
    return finalTheta
  } catch (err) {
    console.error('[UpperRotation] 扫描展开异常:', err)
    if (diagnostics) diagnostics.rejectReason = 'scannerExpansionException'
    return null
  }
}

const estimateThetaMaxWithPhaseCorrectionCore = (
  tripSegments: TripSegment[],
  {
    segments = 36,
    deltaRange: { min = 180, max = 360, step = 1 } = {},
    objectiveMode,
    debug = {},
    adaptiveRules,
    adaptiveTuning,
    searchBackend,
  }: UpperRotationEstimateOptions = {},
  diagnostics?: UpperRotationEstimateDiagnostics
): number | null => {
  const logger = createLogger()
  const validator = validateParams()

  const runtimeDebug: UpperRotationDebugOptions = objectiveMode
    ? { ...debug, objectiveMode }
    : debug
  if (diagnostics) diagnostics.inputSegments = tripSegments.length

  // 参数验证
  logger.startTimer('validation')
  if (!validator.validateSegments(tripSegments)) {
    throw new Error('[UpperRotation] 行程片段验证失败')
  }
  if (!validator.validateRange(min, max, step)) {
    throw new Error('[UpperRotation] 角度范围验证失败')
  }
  if (segments <= 0 || !Number.isInteger(segments)) {
    throw new Error(`[UpperRotation] 无效的 bin 数量: ${segments}`)
  }
  logger.endTimer('validation', 50)

  // 先过滤掉未完成的片段（duration <= 0 或 duration 未设置的片段）
  // 这通常发生在实时流数据中，当采集仍在进行时
  logger.startTimer('filterIncompleteSegments')
  const completeSegments = tripSegments.filter((seg) => seg.duration > 0)
  if (diagnostics) diagnostics.completeSegments = completeSegments.length
  logger.endTimer('filterIncompleteSegments', 10)

  if (completeSegments.length === 0) {
    console.error(
      '[UpperRotation] 无有效的已完成行程片段（所有片段 duration <= 0）'
    )
    if (diagnostics) diagnostics.rejectReason = 'completeSegmentsMissing'
    return null
  }

  // 过滤不完整的首尾片段，避免错误的时间→角度映射
  logger.startTimer('filterPartialSegments')
  const fullSegments = filterPartialSegments(completeSegments)
  if (diagnostics) diagnostics.filteredSegments = fullSegments.length
  logger.endTimer('filterPartialSegments')

  if (fullSegments.length === 0) {
    console.error('[UpperRotation] 过滤后无有效行程片段')
    if (diagnostics) diagnostics.rejectReason = 'filteredSegmentsMissing'
    return null
  }

  let signalCount = 0
  let signalMean = 0
  let signalM2 = 0
  for (const segment of fullSegments) {
    for (const point of segment.measurements) {
      if (!Number.isFinite(point.y)) continue
      signalCount++
      const delta = point.y - signalMean
      signalMean += delta / signalCount
      signalM2 += delta * (point.y - signalMean)
    }
  }
  const signalVariance = signalCount > 1 ? signalM2 / signalCount : 0
  const signalScale = Math.max(1, Math.abs(signalMean))
  if (
    signalCount < 2 ||
    !Number.isFinite(signalVariance) ||
    signalVariance <= Number.EPSILON * signalScale * signalScale
  ) {
    console.warn('[UpperRotation] 厚度信号缺少有效变化，无法估算最大角度')
    return null
  }

  // 无脉冲时改用扫描段展开法（比原始方法更鲁棒）
  logger.startTimer('estimateWithScannerExpansion')
  const result = estimateWithScannerExpansion(
    fullSegments,
    min,
    max,
    step,
    segments,
    runtimeDebug.accelDecelMs,
    runtimeDebug,
    resolveAdaptiveRules(adaptiveRules, adaptiveTuning),
    diagnostics,
    searchBackend
  )
  logger.endTimer('estimateWithScannerExpansion')
  if (result !== null) return result

  // 扫描展开失败时，退回脉冲展开路径兜底。
  logger.startTimer('estimateWithPulseExpansionFallback')
  const pulseFallback = estimateWithPulseExpansion(
    fullSegments,
    min,
    max,
    step,
    segments,
    runtimeDebug.accelDecelMs
  )
  if (diagnostics) {
    diagnostics.objectiveUsed = 'pulseFallback'
    diagnostics.finalThetaDeg = pulseFallback
    diagnostics.rejectReason =
      pulseFallback === null ? 'allEstimatorsFailed' : null
  }
  logger.endTimer('estimateWithPulseExpansionFallback')
  return pulseFallback
}

export const estimateThetaMaxWithPhaseCorrection = (
  tripSegments: TripSegment[],
  options: UpperRotationEstimateOptions = {}
): number | null =>
  estimateThetaMaxWithPhaseCorrectionCore(tripSegments, options)

export const estimateThetaMaxWithPhaseCorrectionDetailed = (
  tripSegments: TripSegment[],
  options: UpperRotationEstimateOptions = {}
): UpperRotationDetailedEstimate => {
  const startedAt = performance.now()
  const diagnostics: UpperRotationEstimateDiagnostics = {
    status: 'running',
    strategyProfile: options.debug?.strategyProfile ?? 'datasetTuned2026Q1',
    objectiveMode:
      options.objectiveMode ?? options.debug?.objectiveMode ?? 'auto',
    offsetMode: options.debug?.offsetMode ?? 'auto',
    objectiveUsed: null,
    inputSegments: tripSegments.length,
    completeSegments: 0,
    filteredSegments: 0,
    totalPoints: 0,
    baseThetaDeg: null,
    finalThetaDeg: null,
    finalLoss: null,
    triggeredRules: [],
    rejectReason: null,
    elapsedMs: 0,
  }
  const thetaMaxDeg = estimateThetaMaxWithPhaseCorrectionCore(
    tripSegments,
    options,
    diagnostics
  )
  diagnostics.status = thetaMaxDeg === null ? 'rejected' : 'success'
  diagnostics.elapsedMs = performance.now() - startedAt
  return { thetaMaxDeg, diagnostics }
}

/**
 * 显式运行生产 tuned 与 generic 影子路径，供离线/影子诊断使用。
 * 现有生产入口不会自动调用本函数，因此不会引入双倍计算开销。
 */
export const compareUpperRotationStrategies = (
  tripSegments: TripSegment[],
  options: UpperRotationEstimateOptions = {}
): UpperRotationStrategyComparison => {
  const production = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments, {
    ...options,
    debug: {
      ...(options.debug ?? {}),
      strategyProfile: 'datasetTuned2026Q1',
    },
  })
  const shadow = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments, {
    ...options,
    debug: {
      ...(options.debug ?? {}),
      strategyProfile: 'generic',
    },
  })
  const comparable =
    production.thetaMaxDeg !== null && shadow.thetaMaxDeg !== null
  const angleDeltaDeg = comparable
    ? (shadow.thetaMaxDeg ?? 0) - (production.thetaMaxDeg ?? 0)
    : null
  return {
    production,
    shadow,
    selectedThetaDeg: production.thetaMaxDeg,
    angleDeltaDeg,
    absoluteAngleDeltaDeg:
      angleDeltaDeg === null ? null : Math.abs(angleDeltaDeg),
    elapsedDeltaMs:
      shadow.diagnostics.elapsedMs - production.diagnostics.elapsedMs,
    comparable,
  }
}
