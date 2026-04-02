/**
 * 上旋相关算法
 * */

import { goldenSectionSearch } from '../../utils'
import {
  TripSegment,
  UpperRotationDeltaRange,
  ValidThicknessData,
} from '../../types'

export type UpperRotationObjectiveMode = 'auto' | 'direct' | 'expanded'
export type UpperRotationOffsetMode =
  | 'auto'
  | 'globalPulse'
  | 'groupPulse'
  | 'time'

export type UpperRotationDebugOptions = {
  objectiveMode?: UpperRotationObjectiveMode
  offsetMode?: UpperRotationOffsetMode
  /** 强制指定加速段时长（毫秒），用于诊断 RC-2 accelRatio 影响 */
  accelDecelMs?: number
  /**
   * 策略配置：
   * - generic: 通用优先（默认）
   * - datasetTuned2026Q1: 启用历史数据集定向修正分支
   */
  strategyProfile?: UpperRotationStrategyProfile
}

export type UpperRotationStrategyProfile = 'generic' | 'datasetTuned2026Q1'
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

const HIGH_ANGLE_DIVERGENCE_BASE_DEG = 330
const HIGH_ANGLE_DIVERGENCE_MARGIN_DEG = 3
const SOLUTION_GAP_THRESHOLD_DEG = 15 // 提高门槛：高角度分歧判定更严格
const DIRECT_ACCEPT_LOSS_RATIO = 1.0 // 收紧容差：direct 损失值不能更高
const DIRECT_BOUNDARY_GUARD_DEG = 10
const CHALLENGER_MAX_POINTS = 40000

const ADAPTIVE_RULES = {
  lowAngle: {
    thetaUpperBound: 315,
    maxPointsForEnable: 20000,
    h1: {
      groupDefaultUpperBound: 315,
      groupFastLowerBound: 342,
      fastVsAutoMinGap: 30,
      blendFactor: 0.72,
    },
    h2: {
      groupDefaultLowerBound: 330,
      covP10Min: 0.94,
      covP10Max: 0.95,
      narrowRateMin: 0.06,
      narrowRateMax: 0.1,
      blendFactor: 0.44,
    },
  },
  highAngle: {
    c5: {
      minValidGroups: 20,
      thetaShiftMinExclusive: 18,
      thetaShiftMaxInclusive: 22,
      covP10Min: 0.94,
      covP10MaxExclusive: 0.975,
      narrowRateMaxExclusive: 0.06,
      minLossGain: 0.0005,
    },
    overEstimationCorrection: {
      minValidGroups: 20,
      bestThetaLowerBound: 330,
      groupThetaLowerBound: 350,
      groupBestShiftMinExclusive: 20,
      covP10Min: 0.94,
      narrowRateMaxExclusive: 0.06,
      forcedAccelMs: 12000,
      targetThetaMin: 315,
      targetThetaMax: 325,
      minDownShift: 8,
    },
  },
} as const

export type UpperRotationAdaptiveRules = typeof ADAPTIVE_RULES
export type UpperRotationAdaptiveRulesOverride =
  DeepPartial<UpperRotationAdaptiveRules>

const resolveAdaptiveRules = (
  override?: UpperRotationAdaptiveRulesOverride
): UpperRotationAdaptiveRules => {
  if (!override) return ADAPTIVE_RULES
  return {
    lowAngle: {
      ...ADAPTIVE_RULES.lowAngle,
      ...(override.lowAngle ?? {}),
      h1: {
        ...ADAPTIVE_RULES.lowAngle.h1,
        ...(override.lowAngle?.h1 ?? {}),
      },
      h2: {
        ...ADAPTIVE_RULES.lowAngle.h2,
        ...(override.lowAngle?.h2 ?? {}),
      },
    },
    highAngle: {
      ...ADAPTIVE_RULES.highAngle,
      ...(override.highAngle ?? {}),
      c5: {
        ...ADAPTIVE_RULES.highAngle.c5,
        ...(override.highAngle?.c5 ?? {}),
      },
      overEstimationCorrection: {
        ...ADAPTIVE_RULES.highAngle.overEstimationCorrection,
        ...(override.highAngle?.overEstimationCorrection ?? {}),
      },
    },
  }
}

type LossSample = {
  theta: number
  loss: number
}

type LossLandscapeFeature = {
  boundaryPlateau: boolean
  bimodalDivergence: boolean
  localMinimaCount: number
  secondaryMinTheta: number | null
}

type HighAngleGateDecision = {
  divergenceDeg: number
  shouldTrigger: boolean
  reason: string
}

type PulseCoverageSignature = {
  covP10: number
  narrowRate: number
  validGroups: number
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

const analyzeLossLandscape = (
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
  const globalBestLoss = Math.min(...normalized.map((s) => s.loss))
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
    Math.abs(primary.theta - secondary.theta) >= SOLUTION_GAP_THRESHOLD_DEG &&
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
const resolveHighAngleDivergenceDeg = (
  min: number,
  max: number,
  feature?: LossLandscapeFeature
): HighAngleGateDecision => {
  const span = max - min
  const adaptive = min + span * 0.8 // 关注搜索区间上 20%
  const baseline = Math.min(
    max - 12,
    Math.max(320, Math.max(HIGH_ANGLE_DIVERGENCE_BASE_DEG - 6, adaptive))
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

// 提取可观测覆盖签名，用于受控 challenger 放宽门控。
const extractPulseCoverageSignature = (
  tripSegments: TripSegment[]
): PulseCoverageSignature => {
  const ratios: number[] = []

  for (const seg of tripSegments) {
    if (!seg || seg.duration <= 0 || seg.measurements.length < 10) continue

    const valid = seg.measurements
      .filter((p) => !isNaN(p.y))
      .slice()
      .sort((a, b) => a.t - b.t)
    if (valid.length < 10) continue

    const pulseValues = valid
      .map((p) => p.pulse)
      .filter((p): p is number => p !== undefined && isFinite(p))
    if (pulseValues.length < valid.length * 0.5) continue

    const globalMin = Math.min(...pulseValues)
    const globalMax = Math.max(...pulseValues)
    const globalRange = globalMax - globalMin
    if (!isFinite(globalRange) || globalRange <= 100) continue

    const intervals: number[] = []
    for (let i = 1; i < Math.min(valid.length, 500); i++) {
      const dt = valid[i].t - valid[i - 1].t
      if (dt > 0) intervals.push(dt)
    }
    if (intervals.length === 0) continue

    intervals.sort((a, b) => a - b)
    const medianInterval = intervals[Math.floor(intervals.length / 2)]
    const gapThreshold = Math.max(medianInterval * 3, 100)

    const groups: ValidThicknessData[][] = []
    let cur: ValidThicknessData[] = [valid[0]]
    for (let i = 1; i < valid.length; i++) {
      if (valid[i].t - valid[i - 1].t > gapThreshold) {
        groups.push(cur)
        cur = []
      }
      cur.push(valid[i])
    }
    if (cur.length > 0) groups.push(cur)

    for (const g of groups) {
      if (g.length < 5) continue
      const withPulse = g.filter(
        (p) => p.pulse !== undefined && isFinite(p.pulse)
      )
      if (withPulse.length < g.length * 0.5) continue
      const gMin = Math.min(...withPulse.map((p) => p.pulse as number))
      const gMax = Math.max(...withPulse.map((p) => p.pulse as number))
      const gRange = gMax - gMin
      if (!isFinite(gRange) || gRange <= 10) continue
      ratios.push(gRange / globalRange)
    }
  }

  if (ratios.length === 0) {
    return { covP10: 0, narrowRate: 1, validGroups: 0 }
  }

  const sorted = [...ratios].sort((a, b) => a - b)
  const covP10 = sorted[Math.floor(sorted.length * 0.1)]
  const narrowCount = ratios.filter((r) => r < 0.75).length
  return {
    covP10,
    narrowRate: narrowCount / ratios.length,
    validGroups: ratios.length,
  }
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
    // 注意：不再检查 duration <= 0，因为实时流数据中可能存在未完成的片段
    // 这些片段会在后续 estimateThetaMaxWithPhaseCorrection 中被过滤掉
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
 * 梯形速度曲线归一化位置
 * @param progress 行程进度 [0, 1]
 * @param accelRatio 加速段占比
 */
const trapezoidalPosition = (progress: number, accelRatio: number): number => {
  const normFactor = 1 / (1 - accelRatio)
  let raw: number
  if (progress < accelRatio) {
    raw = 0.5 * (progress / accelRatio) ** 2 * accelRatio
  } else if (progress > 1 - accelRatio) {
    const lp = (progress - (1 - accelRatio)) / accelRatio
    raw =
      0.5 * accelRatio +
      (1 - 2 * accelRatio) +
      (lp - 0.5 * lp * lp) * accelRatio
  } else {
    raw = 0.5 * accelRatio + (progress - accelRatio)
  }
  return raw * normFactor
}

/**
 * 过滤不完整的行程片段
 *
 * 数据采集常在行程中途开始/结束，导致首尾片段只覆盖了部分行程。
 * 对这些片段直接套用"0→θ_max"角度映射会引入系统误差，必须排除。
 *
 * 判断依据：与片段中位时长相比，持续时间低于阈值（默认 80%）的片段
 * 被视为不完整片段。若过滤后片段数量不足 2 个，则回退使用全量片段。
 *
 * @param segments - 输入行程片段
 * @param minThreshold - 持续时间过滤阈值（默认 0.8，即中位时长的 80%）
 * @param minPoints - 单个片段的最少测量点数（默认 10）
 * @returns 过滤后的片段数组
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
 * 梯形速度曲线归一化位置
 *
 * 三路策略：
 * 1. 优先使用脉冲数据：精确的扫描仪位置 → 最准确
 * 2. 有扫描间隙时：使用扫描段展开 + 梯形速度曲线
 * 3. 无间隙时：使用原始 bin 方差法（梯形映射）
 *
 * @throws {Error} 当参数无效时抛出错误
 * @returns {number | null} 估计的 theta_max 值（单位：度），若无法估计则返回 null
 */
export const estimateThetaMaxWithPhaseCorrection = (
  tripSegments: TripSegment[],
  {
    segments = 36,
    deltaRange: { min = 180, max = 360, step = 1 } = {},
    debug = {},
    adaptiveRules,
  }: {
    harmonics?: number
    segments?: number
    deltaRange?: UpperRotationDeltaRange
    debug?: UpperRotationDebugOptions
    adaptiveRules?: UpperRotationAdaptiveRulesOverride
  } = {}
): number | null => {
  const logger = createLogger()
  const validator = validateParams()

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
    debug.accelDecelMs,
    debug,
    resolveAdaptiveRules(adaptiveRules)
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
    debug.accelDecelMs
  )
  logger.endTimer('estimateWithPulseExpansionFallback')
  return pulseFallback
}

/**
 * 基于脉冲数据的精确扫描仪偏移展开法
 *
 * 使用 HorizontalPulse 直接计算每个测量点的扫描仪偏移角度，
 * 自动处理正反向扫描方向，无需猜测扫描段方向。
 */
const estimateWithPulseExpansion = (
  tripSegments: TripSegment[],
  min: number,
  max: number,
  step: number,
  segments: number,
  accelDecelMs?: number
): number | null => {
  try {
    // 只从在界（非 NaN）数据计算脉冲范围
    let pulseMin = Infinity
    let pulseMax = -Infinity
    for (const seg of tripSegments) {
      for (const m of seg.measurements) {
        if (m.pulse !== undefined && isFinite(m.pulse) && !isNaN(m.y)) {
          if (m.pulse < pulseMin) pulseMin = m.pulse
          if (m.pulse > pulseMax) pulseMax = m.pulse
        }
      }
    }
    const pulseRange = pulseMax - pulseMin
    if (!isFinite(pulseRange) || pulseRange === 0) {
      console.warn('[UpperRotation] 脉冲数据范围无效或为零，退出脉冲展开')
      return null
    }

    // 构建归一化行程数据
    const normalized: {
      data: ExpandedPoint[]
      duration: number
      accelRatio: number
    }[] = []
    for (const seg of tripSegments) {
      if (seg.measurements.length < 10 || seg.duration <= 0) continue
      const flipped = seg.isForward
        ? seg.measurements
        : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))

      const expanded: ExpandedPoint[] = flipped
        .filter((p) => p.pulse !== undefined && !isNaN(p.y))
        .map((p) => ({
          t: p.t,
          y: p.y,
          offsetDeg: ((p.pulse! - pulseMin) / pulseRange - 0.5) * 180,
        }))

      if (expanded.length < 10) continue

      const accelMs = accelDecelMs ?? Math.min(20000, seg.duration * 0.45)
      const accelRatio = Math.max(0, Math.min(1, accelMs / seg.duration))
      normalized.push({ data: expanded, duration: seg.duration, accelRatio })
    }

    if (normalized.length < 2) {
      console.warn('[UpperRotation] 脉冲展开后片段数不足')
      return null
    }

    // 粗搜索（1° 步长）
    let bestTheta: number | null = null
    let bestLoss = Infinity
    for (let theta = min; theta < max; theta += step) {
      const loss = evaluateExpanded(normalized, theta, segments)
      if (loss < bestLoss) {
        bestLoss = loss
        bestTheta = theta
      }
    }
    if (bestTheta == null) {
      console.warn('[UpperRotation] 粗搜索未找到最优点')
      return null
    }

    // 精搜索（0.1° 步长，±2° 范围内），提升精度
    const fineMin = Math.max(min, bestTheta - 2)
    const fineMax = Math.min(max, bestTheta + 2)
    for (let theta = fineMin; theta <= fineMax; theta += 0.1) {
      const loss = evaluateExpanded(normalized, theta, segments)
      if (loss < bestLoss) {
        bestLoss = loss
        bestTheta = theta
      }
    }

    // 黄金分割精确收敛
    return goldenSectionSearch(
      (th) => evaluateExpanded(normalized, th, segments),
      Math.max(min, bestTheta - 1),
      Math.min(max, bestTheta + 1),
      0.01
    )
  } catch (err) {
    console.error('[UpperRotation] 脉冲展开异常:', err)
    return null
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
  adaptiveRules: UpperRotationAdaptiveRules = ADAPTIVE_RULES
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
            highAngleDivergenceDeg + HIGH_ANGLE_DIVERGENCE_MARGIN_DEG)
      const directIsCompetitive =
        directResult.loss <= bestLoss * DIRECT_ACCEPT_LOSS_RATIO
      // 新增约束：direct 必须明显更优（至少好 1%）
      const directMustBeSignificantlyBetter =
        directResult.loss < bestLoss * 0.99
      // 防止 direct 在低边界附近（如 180°）的退化解覆盖高角度 expanded 解
      const directAwayFromLowerBoundary =
        directResult.theta >= min + DIRECT_BOUNDARY_GUARD_DEG

      if (
        expandedLeansBoundary &&
        thetaGap >= SOLUTION_GAP_THRESHOLD_DEG &&
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
        thetaGap >= SOLUTION_GAP_THRESHOLD_DEG &&
        !directAwayFromLowerBoundary
      ) {
        console.debug(
          `[UpperRotation] 跳过 evaluateDirect 回退：direct θ=${directResult.theta.toFixed(2)}° 过近下边界 (guard=${DIRECT_BOUNDARY_GUARD_DEG}°)`
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
        const flipped = seg.isForward
          ? seg.measurements
          : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
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
      bestTheta < ADAPTIVE_RULES.lowAngle.thetaUpperBound &&
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
      bestTheta >= highAngleDivergenceDeg + HIGH_ANGLE_DIVERGENCE_MARGIN_DEG &&
      (highAngleGate.shouldTrigger ||
        bestTheta >=
          highAngleDivergenceDeg + HIGH_ANGLE_DIVERGENCE_MARGIN_DEG + 2)
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
      totalPoints <= CHALLENGER_MAX_POINTS

    if (
      objectiveMode === 'auto' &&
      offsetMode === 'auto' &&
      hasValidOffset &&
      highAngleSuspicious &&
      totalPoints > CHALLENGER_MAX_POINTS
    ) {
      console.debug(
        `[UpperRotation] 跳过 challenger: 数据量过大 points=${totalPoints} > ${CHALLENGER_MAX_POINTS}`
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
        const flipped = seg.isForward
          ? seg.measurements
          : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
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
        const flipped = seg.isForward
          ? seg.measurements
          : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
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
          const flipped = seg.isForward
            ? seg.measurements
            : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
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

type ExpandedPoint = { t: number; y: number; offsetDeg: number }

/**
 * 直接评估方法（不依赖 offsetDeg）
 *
 * 用于当扫描仪位置信息不可靠时的回退方案。
 * 直接使用多片段的厚度分布，在纯厚度空间中最小化方差。
 */
const evaluateDirect = (
  segs: {
    data: readonly ExpandedPoint[]
    duration: number
    accelRatio: number
  }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  if (!segs || segs.length === 0) return Infinity

  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0,
    tY2 = 0,
    tN = 0

  const add = (idx: number, y: number) => {
    const n = ++bc[idx]
    const d = y - bm[idx]
    bm[idx] += d / n
    b2[idx] += d * (y - bm[idx])
  }

  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  try {
    for (const { data, duration, accelRatio } of segs) {
      if (!data || data.length === 0) continue

      for (const p of data) {
        if (isNaN(p.y)) continue

        // 仅使用梯形速度曲线映射时间→角度，不加入 offsetDeg
        const phi =
          trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad
        const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        add(Math.floor(np / bw) % NUM_BINS, p.y)
        tY += p.y
        tY2 += p.y * p.y
        tN++
      }
    }
  } catch (err) {
    console.error('[UpperRotation] evaluateDirect 计算异常:', err)
    return Infinity
  }

  let tv = 0,
    vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue
    tv += b2[i] / bc[i]
    vc++
  }

  if (vc === 0 || tN < 2) {
    return Infinity
  }

  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

/**
 * 扫描段展开：排序 → 按间隙分组 → 分配偏移
 *
 * **位置映射策略（优先级从高到低）**
 *
 * 1. **每组 pulse 归一化**（推荐，方向无歧义）
 *    每次测厚仪单向行程内 pulse 值单调，将组内 pMin→−90°、pMax→+90° 即可。
 *    无论扫描头是从左往右还是从右往左，物理位置映射均正确。
 *    解决了全局 pulse 路径因多往返而非单调的问题。
 *
 * 2. **奇偶交替方向**（回退，精度较低）
 *    无 pulse 时使用时序位置 + 奇偶标志；首组方向未知，可能引入 180° 相位误差。
 */
const expandWithScannerOffset = (
  measurements: readonly ValidThicknessData[],
  offsetMode: UpperRotationOffsetMode = 'auto'
): ExpandedPoint[] => {
  if (measurements.length === 0) return []
  const valid = measurements
    .filter((p) => !isNaN(p.y))
    .slice()
    .sort((a, b) => a.t - b.t)
  if (valid.length < 2) {
    console.debug('[UpperRotation] 测量点不足，返回归一化结果')
    return valid.map((p) => ({ ...p, offsetDeg: 0 }))
  }

  const intervals: number[] = []
  for (let i = 1; i < Math.min(valid.length, 500); i++) {
    const dt = valid[i].t - valid[i - 1].t
    if (dt > 0) intervals.push(dt)
  }
  if (intervals.length === 0) return valid.map((p) => ({ ...p, offsetDeg: 0 }))
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]
  // 避免高频采样下偶发抖动被误判为“扫描间隙”
  const gapThreshold = Math.max(medianInterval * 3, 100)

  // 预计算全局 pulse 范围，用于“局部 span 很小”时的稳定映射
  const pulseValues = valid
    .map((p) => p.pulse)
    .filter((p): p is number => p !== undefined && isFinite(p))
  const globalPulseMin = pulseValues.length > 0 ? Math.min(...pulseValues) : NaN
  const globalPulseMax = pulseValues.length > 0 ? Math.max(...pulseValues) : NaN
  const globalPulseRange = globalPulseMax - globalPulseMin
  const hasGlobalPulseRange =
    isFinite(globalPulseRange) && globalPulseRange > 100

  const groups: ValidThicknessData[][] = []
  let cur: ValidThicknessData[] = [valid[0]]
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].t - valid[i - 1].t > gapThreshold) {
      groups.push(cur)
      cur = []
    }
    cur.push(valid[i])
  }
  if (cur.length > 0) groups.push(cur)

  console.debug(
    `[UpperRotation] expandWithScannerOffset: ${valid.length} 点, 中位间隔=${medianInterval}ms, 阈值=${gapThreshold}ms, 检测到 ${groups.length} 个间隙组, pulse全局跨度=${globalPulseRange.toFixed(1)}`
  )

  // 未检测到间隙时按时间中点分为两组（兜底，仅对无间隙结构有效）
  if (groups.length <= 1) {
    const midIdx = Math.floor(valid.length / 2)
    if (midIdx > 0 && midIdx < valid.length) {
      // 改进：不再使用分组 + 奇偶假设
      // 改为直接使用相对时间位置映射到 [-90°, +90°]
      // 这样模拟器数据也能得到合理的 offsetDeg
      console.debug(
        `[UpperRotation] 未检测到间隙，直接使用时间位置映射 offsetDeg`
      )
      return valid.map((p, i) => {
        const pos = valid.length > 1 ? i / (valid.length - 1) : 0.5
        return {
          t: p.t,
          y: p.y,
          offsetDeg: (pos - 0.5) * 180,
        }
      })
    } else {
      return valid.map((p) => ({ ...p, offsetDeg: 0 }))
    }
  }

  const result: ExpandedPoint[] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    if (group.length < 5) {
      console.debug(
        `[UpperRotation] 组 ${gi} 测点不足 (${group.length} < 5)，跳过`
      )
      continue
    }

    // 策略一：全局 pulse 映射（默认 auto 使用）
    const withPulse = group.filter(
      (p) => p.pulse !== undefined && isFinite(p.pulse)
    )
    const canUsePulse = withPulse.length >= group.length * 0.5
    const groupPulseMin =
      withPulse.length > 0
        ? Math.min(...withPulse.map((p) => p.pulse as number))
        : NaN
    const groupPulseMax =
      withPulse.length > 0
        ? Math.max(...withPulse.map((p) => p.pulse as number))
        : NaN
    const groupPulseRange = groupPulseMax - groupPulseMin
    const hasGroupPulseRange = isFinite(groupPulseRange) && groupPulseRange > 10

    const useGlobalPulse =
      canUsePulse &&
      hasGlobalPulseRange &&
      (offsetMode === 'auto' || offsetMode === 'globalPulse')
    const useGroupPulse =
      canUsePulse && hasGroupPulseRange && offsetMode === 'groupPulse'

    if (useGlobalPulse) {
      for (const m of group) {
        const pulse =
          m.pulse !== undefined
            ? m.pulse
            : (globalPulseMin + globalPulseMax) / 2
        result.push({
          t: m.t,
          y: m.y,
          offsetDeg: ((pulse - globalPulseMin) / globalPulseRange - 0.5) * 180,
        })
      }
      console.debug(
        `[UpperRotation] 组 ${gi} 使用全局 pulse 映射 (全局范围: [${globalPulseMin.toFixed(1)}, ${globalPulseMax.toFixed(1)}], 跨度=${globalPulseRange.toFixed(1)})`
      )
      continue
    }

    if (useGroupPulse) {
      const groupPulseTooNarrow =
        hasGlobalPulseRange && groupPulseRange < globalPulseRange * 0.75

      if (groupPulseTooNarrow) {
        // 组内 pulse 跨度显著偏窄时，通常是局部/截断扫描，
        // 此时回退时间位置映射以避免 groupPulse 过拟合到异常段。
        for (let i = 0; i < group.length; i++) {
          const pos = group.length > 1 ? i / (group.length - 1) : 0.5
          result.push({
            t: group[i].t,
            y: group[i].y,
            offsetDeg: (pos - 0.5) * 180,
          })
        }
        console.debug(
          `[UpperRotation] 组 ${gi} groupPulse 跨度偏窄(${groupPulseRange.toFixed(1)} < ${(globalPulseRange * 0.75).toFixed(1)})，回退时间位置映射`
        )
        continue
      }

      for (const m of group) {
        const pulse =
          m.pulse !== undefined ? m.pulse : (groupPulseMin + groupPulseMax) / 2
        result.push({
          t: m.t,
          y: m.y,
          offsetDeg: ((pulse - groupPulseMin) / groupPulseRange - 0.5) * 180,
        })
      }
      console.debug(
        `[UpperRotation] 组 ${gi} 使用组内 pulse 映射 (组范围: [${groupPulseMin.toFixed(1)}, ${groupPulseMax.toFixed(1)}], 跨度=${groupPulseRange.toFixed(1)})`
      )
      continue
    }

    if (offsetMode === 'time') {
      for (let i = 0; i < group.length; i++) {
        const pos = group.length > 1 ? i / (group.length - 1) : 0.5
        result.push({
          t: group[i].t,
          y: group[i].y,
          offsetDeg: (pos - 0.5) * 180,
        })
      }
      console.debug(`[UpperRotation] 组 ${gi} 使用时间位置映射 (调试强制)`)
      continue
    }

    // 策略二：无 pulse，退回奇偶方向假设（首组方向可能错误）
    // 改进：使用信号变化趋势推断扫描方向，而不是单純的奇偶索引
    const firstHalf = group.slice(0, Math.floor(group.length * 0.3))
    const lastHalf = group.slice(Math.floor(group.length * 0.7))

    // 计算前后部分的平均值
    const firstMean = firstHalf.reduce((a, p) => a + p.y, 0) / firstHalf.length
    const lastMean = lastHalf.reduce((a, p) => a + p.y, 0) / lastHalf.length

    // 如果后部分的平均值更大，说明是正向扫描（y 增大 → 膜越来越厚 → 扫描从薄处到厚处）
    // 反之亦然
    const isForwardScan = lastMean > firstMean

    for (let i = 0; i < group.length; i++) {
      const pos = group.length > 1 ? i / (group.length - 1) : 0.5
      const effectivePos = isForwardScan ? pos : 1 - pos
      result.push({
        t: group[i].t,
        y: group[i].y,
        offsetDeg: (effectivePos - 0.5) * 180,
      })
    }
    console.debug(
      `[UpperRotation] 组 ${gi} 使用信号趋势推断 (方向: ${isForwardScan ? '正向' : '反向'}, 前均值=${firstMean.toFixed(0)}, 后均值=${lastMean.toFixed(0)})`
    )
  }
  return result.length > 0 ? result : valid.map((p) => ({ ...p, offsetDeg: 0 }))
}

/**
 * 展开数据的 bin 方差法（带梯形速度曲线修正）
 *
 * 性能优化：
 * - 预分配数组避免动态扩展
 * - 使用类型数组（TypedArray）提高数值计算性能
 * - 单次遍历计算 bin 统计，避免多次迭代
 */
const evaluateExpanded = (
  segs: {
    data: readonly ExpandedPoint[]
    duration: number
    accelRatio: number
  }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  if (!segs || segs.length === 0) return Infinity

  const bw = (2 * Math.PI) / NUM_BINS
  const bc = new Uint32Array(NUM_BINS)
  const bm = new Float64Array(NUM_BINS)
  const b2 = new Float64Array(NUM_BINS)
  let tY = 0,
    tY2 = 0,
    tN = 0

  const add = (idx: number, y: number) => {
    const n = ++bc[idx]
    const d = y - bm[idx]
    bm[idx] += d / n
    b2[idx] += d * (y - bm[idx])
  }

  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180

  try {
    for (const { data, duration, accelRatio } of segs) {
      if (!data || data.length === 0) continue

      for (const p of data) {
        if (isNaN(p.y)) continue

        // 使用梯形速度曲线精确映射时间→角度
        const phi =
          trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad +
          (p.offsetDeg * Math.PI) / 180
        const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        add(Math.floor(np / bw) % NUM_BINS, p.y)
        tY += p.y
        tY2 += p.y * p.y
        tN++
      }
    }
  } catch (err) {
    console.error('[UpperRotation] evaluateExpanded 计算异常:', err)
    return Infinity
  }

  let tv = 0,
    vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue
    tv += b2[i] / bc[i]
    vc++
  }

  if (vc === 0 || tN < 2) {
    console.warn(`[UpperRotation] 数据不足: vc=${vc}, tN=${tN}，返回无穷值`)
    return Infinity
  }

  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}
