/**
 * 上旋相关算法实现
 */

import { goldenSectionSearch } from '../../utils'
import { TripSegment, UpperRotationDeltaRange } from '../../types'
import {
  ADAPTIVE_RULES_BASE,
  resolveAdaptiveRules,
  type UpperRotationAdaptiveRules,
  type UpperRotationAdaptiveRulesOverride,
  type UpperRotationAdaptiveTuningOverride,
  type UpperRotationDebugOptions,
  type UpperRotationObjectiveMode,
  type UpperRotationOffsetMode,
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
  buildFlippedMeasurements,
} from './upperRotation.evaluation'
import {
  expandWithScannerOffset,
  extractPulseCoverageSignature,
} from './upperRotation.offset'
import { estimateWithPulseExpansion } from './upperRotation.pulse'

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
    if (min < 0 || max > 360 || min >= max) {
      console.error(
        `[UpperRotation] 角度范围无效: [${min}, ${max}]，应为 [0, 360) 且 min < max`
      )
      return false
    }
    if (step <= 0 || step > max - min) {
      console.error(`[UpperRotation] 搜索步长无效: ${step}`)
      return false
    }
    return true
  },
})

/**
 * 过滤不完整的行程片段
 */
const filterPartialSegments = (
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
    const durations = segments.map((s) => s.duration).filter((d) => d > 0)

    if (durations.length === 0) {
      console.warn('[UpperRotation] 无有效的行程时长，返回全量片段')
      return segments
    }

    const sorted = [...durations].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const minDuration = median * minThreshold

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

    const result = filtered.length >= 2 ? filtered : segments
    console.info(
      `[UpperRotation] 片段过滤完成: ${segments.length} → ${result.length} 个有效片段`
    )
    return result
  } catch (err) {
    console.error('[UpperRotation] 片段过滤异常:', err)
    return segments
  }
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
  adaptiveRules: UpperRotationAdaptiveRules = ADAPTIVE_RULES_BASE
): number | null => {
  try {
    const objectiveMode = debugOptions.objectiveMode ?? 'auto'
    const offsetMode = debugOptions.offsetMode ?? 'auto'
    const strategyProfile = debugOptions.strategyProfile ?? 'generic'

    // 将 offset 展开（与 accelMs 无关）和 accelRatio 分开计算，
    // 这样诊断模式可通过 debug.accelDecelMs 覆盖默认加速段时长。

    // 预计算 offset 展开数据（不含 accelRatio）
    const preExpanded: { data: ExpandedPoint[]; duration: number }[] = []
    for (const seg of tripSegments) {
      if (seg.measurements.length === 0 || seg.duration <= 0) continue
      const flipped = seg.isForward
        ? seg.measurements
        : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
      const expanded = expandWithScannerOffset(flipped, offsetMode)
      if (expanded.length > 0) {
        preExpanded.push({ data: expanded, duration: seg.duration })
      }
    }
    if (preExpanded.length < 2) {
      console.warn('[UpperRotation] 扫描展开后片段数不足')
      return null
    }

    const resolveAccelRatio = (duration: number, ms?: number): number => {
      const effectiveMs = ms ?? Math.min(20000, duration * 0.45)
      return Math.max(0, Math.min(1, effectiveMs / duration))
    }

    // 根据给定 accelMs（可选）快速构建 normalized（仅改变 accelRatio）
    const makeNormalized = (
      ms?: number
    ): { data: ExpandedPoint[]; duration: number; accelRatio: number }[] =>
      preExpanded.map((s) => ({
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
    const hasValidOffset = normalized.some((seg) =>
      seg.data.some((p) => Math.abs(p.offsetDeg) > 0.1)
    )
    const evaluateFn =
      objectiveMode === 'direct'
        ? evaluateDirect
        : objectiveMode === 'expanded'
          ? evaluateExpanded
          : hasValidOffset
            ? evaluateExpanded
            : evaluateDirect

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
      }[] = normalized
    ): { theta: number; loss: number; samples: LossSample[] } | null => {
      let bestTheta: number | null = null
      let bestLoss = Infinity
      const lossSamples: LossSample[] = []

      for (const start of startPoints) {
        // 从每个起点进行范围为 (max-min)/NUM_STARTS 的局部搜索
        const rangeSize = (max - min) / NUM_STARTS
        const searchEnd = Math.min(max, start + rangeSize + 10) // +10 为了有重叠

        for (let theta = start; theta < searchEnd; theta += 0.5) {
          const loss = fn(segsData, theta, segments)
          lossSamples.push({ theta, loss })
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
      for (let theta = fineMin; theta <= fineMax; theta += 0.1) {
        const loss = fn(segsData, theta, segments)
        if (loss < bestLoss) {
          bestLoss = loss
          bestTheta = theta
        }
      }

      return { theta: bestTheta, loss: bestLoss, samples: lossSamples }
    }

    const expandedResult = searchBest(evaluateFn)
    if (!expandedResult) {
      console.warn('[UpperRotation] 多起点搜索未找到最优点')
      return null
    }

    let bestTheta = expandedResult.theta
    let bestLoss = expandedResult.loss
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
      for (const seg of tripSegments) {
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const flipped = buildFlippedMeasurements(seg)
        const expanded = expandWithScannerOffset(flipped, mode)
        if (expanded.length > 0) {
          out.push({
            data: expanded,
            duration: seg.duration,
            accelRatio: resolveAccelRatio(seg.duration, forcedAccelMs),
          })
        }
      }
      return out
    }

    // 低角度自适应修正（特征驱动）：
    // - H1: 默认 group 映射偏低，但高加速 group 显著抬升
    // - H2: 默认 group 映射偏高，可作为上拉锚点
    if (
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      evaluateFn === evaluateExpanded &&
      finalEvaluateFn === evaluateExpanded &&
      bestTheta < adaptiveRules.lowAngle.thetaUpperBound &&
      totalPoints <= adaptiveRules.lowAngle.maxPointsForEnable
    ) {
      const coverage = extractPulseCoverageSignature(tripSegments)
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
          coverage.covP10 >= adaptiveRules.lowAngle.h2.covP10Min &&
          coverage.covP10 < adaptiveRules.lowAngle.h2.covP10Max &&
          coverage.narrowRate >= adaptiveRules.lowAngle.h2.narrowRateMin &&
          coverage.narrowRate < adaptiveRules.lowAngle.h2.narrowRateMax

        if (h1Trigger) {
          const correctedTheta =
            bestTheta +
            adaptiveRules.lowAngle.h1.blendFactor *
              (groupFastResult.theta - bestTheta)
          bestTheta = Math.max(min + 1, Math.min(max - 1, correctedTheta))
          bestLoss = evaluateExpanded(groupFastNorm, bestTheta, segments)
          finalEvaluateFn = evaluateExpanded
          finalNormalized = groupFastNorm
          console.warn(
            `[UpperRotation] 低角度模式修正(H1): corrected θ=${bestTheta.toFixed(2)}° (base=${expandedResult.theta.toFixed(2)}°, group13000=${groupFastResult.theta.toFixed(2)}°)`
          )
        } else if (h2Trigger) {
          const correctedTheta =
            bestTheta +
            adaptiveRules.lowAngle.h2.blendFactor *
              (groupDefaultResult.theta - bestTheta)
          bestTheta = Math.max(min + 1, Math.min(max - 1, correctedTheta))
          bestLoss = evaluateExpanded(groupDefaultNorm, bestTheta, segments)
          finalEvaluateFn = evaluateExpanded
          finalNormalized = groupDefaultNorm
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
    const pulseCoverageSignature =
      objectiveMode === 'auto' && offsetMode === 'auto' && hasValidOffset
        ? extractPulseCoverageSignature(tripSegments)
        : { covP10: 0, narrowRate: 1, validGroups: 0 }
    const shouldTryGroupPulseChallenger =
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      highAngleSuspicious &&
      finalEvaluateFn === evaluateExpanded &&
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
      let usedC5RelaxedSwitch = false
      let ds05LikeTrigger = false
      let ds05GroupTheta: number | null = null
      const normalizedGroupPulse: {
        data: ExpandedPoint[]
        duration: number
        accelRatio: number
      }[] = []

      for (const seg of tripSegments) {
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const flipped = buildFlippedMeasurements(seg)
        const expandedByGroup = expandWithScannerOffset(flipped, 'groupPulse')
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
          ds05GroupTheta = groupPulseResult.theta
          const minGainForSwitch = 0.015
          // C5(obs) 受控放宽：特征窗口触发，避免标准门控遗漏的高角度修正。
          const c5RelaxedSwitch =
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

      for (const seg of tripSegments) {
        if (seg.measurements.length === 0 || seg.duration <= 0) continue
        const flipped = buildFlippedMeasurements(seg)
        const expandedByTime = expandWithScannerOffset(flipped, 'time')
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

        for (const seg of tripSegments) {
          if (seg.measurements.length === 0 || seg.duration <= 0) continue
          const flipped = buildFlippedMeasurements(seg)
          const expandedByGlobalPulse = expandWithScannerOffset(
            flipped,
            'globalPulse'
          )
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
    return goldenSectionSearch(
      (th) => finalEvaluateFn(finalNormalized, th, segments),
      Math.max(min, bestTheta - 1),
      Math.min(max, bestTheta + 1),
      0.01
    )
  } catch (err) {
    console.error('[UpperRotation] 扫描展开异常:', err)
    return null
  }
}

export const estimateThetaMaxWithPhaseCorrection = (
  tripSegments: TripSegment[],
  {
    segments = 36,
    deltaRange: { min = 180, max = 360, step = 1 } = {},
    objectiveMode,
    debug = {},
    adaptiveRules,
    adaptiveTuning,
  }: {
    harmonics?: number
    segments?: number
    deltaRange?: UpperRotationDeltaRange
    objectiveMode?: UpperRotationObjectiveMode
    debug?: UpperRotationDebugOptions
    adaptiveRules?: UpperRotationAdaptiveRulesOverride
    adaptiveTuning?: UpperRotationAdaptiveTuningOverride
  } = {}
): number | null => {
  const logger = createLogger()
  const validator = validateParams()

  const runtimeDebug: UpperRotationDebugOptions = objectiveMode
    ? { ...debug, objectiveMode }
    : debug

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
  logger.endTimer('filterIncompleteSegments', 10)

  if (completeSegments.length === 0) {
    console.error(
      '[UpperRotation] 无有效的已完成行程片段（所有片段 duration <= 0）'
    )
    return null
  }

  // 过滤不完整的首尾片段，避免错误的时间→角度映射
  logger.startTimer('filterPartialSegments')
  const fullSegments = filterPartialSegments(completeSegments)
  logger.endTimer('filterPartialSegments')

  if (fullSegments.length === 0) {
    console.error('[UpperRotation] 过滤后无有效行程片段')
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
    resolveAdaptiveRules(adaptiveRules, adaptiveTuning)
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
  logger.endTimer('estimateWithPulseExpansionFallback')
  return pulseFallback
}
