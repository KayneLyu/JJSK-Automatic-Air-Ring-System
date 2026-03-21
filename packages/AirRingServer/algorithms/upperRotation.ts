/**
 * 上旋相关算法
 * */

import { goldenSectionSearch } from '../utils'
import {
  TripSegment,
  UpperRotationDeltaRange,
  ValidThicknessData,
} from '../types'

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
    deltaRange: { min = 180, max = 359, step = 1 } = {},
  }: {
    harmonics?: number
    segments?: number
    deltaRange?: UpperRotationDeltaRange
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
    console.error('[UpperRotation] 无有效的已完成行程片段（所有片段 duration <= 0）')
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
    segments
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
    segments
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
  accelDecelMs?: number
): number | null => {
  try {
    const normalized: {
      data: ExpandedPoint[]
      duration: number
      accelRatio: number
    }[] = []
    for (const seg of tripSegments) {
      if (seg.measurements.length === 0 || seg.duration <= 0) continue
      const flipped = seg.isForward
        ? seg.measurements
        : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t }))
      const expanded = expandWithScannerOffset(flipped)
      if (expanded.length > 0) {
        const accelMs = accelDecelMs ?? Math.min(20000, seg.duration * 0.45)
        const accelRatio = Math.max(0, Math.min(1, accelMs / seg.duration))
        normalized.push({ data: expanded, duration: seg.duration, accelRatio })
      }
    }
    if (normalized.length < 2) {
      console.warn('[UpperRotation] 扫描展开后片段数不足')
      return null
    }

    // 改进搜索策略：多起点搜索避免陷入最小值
    // 在 [min, max) 中均匀分布多个起点，从每个起点进行局部搜索
    const NUM_STARTS = 8
    const startPoints: number[] = []
    for (let i = 0; i < NUM_STARTS; i++) {
      startPoints.push(min + ((max - min) / NUM_STARTS) * i)
    }

    // 决定使用哪个目标函数：
    // - 如果 offsetDeg 都是 0（无有效扫描位置信息），使用 evaluateDirect
    // - 否则使用 evaluateExpanded
    const hasValidOffset = normalized.some(seg =>
      seg.data.some(p => Math.abs(p.offsetDeg) > 0.1)
    )
    const evaluateFn = hasValidOffset ? evaluateExpanded : evaluateDirect

    console.debug(
      `[UpperRotation] 选择目标函数: ${hasValidOffset ? 'evaluateExpanded (有偏移信息)' : 'evaluateDirect (无偏移信息)'}`
    )

    const searchBest = (
      fn: typeof evaluateExpanded
    ): { theta: number; loss: number } | null => {
      let bestTheta: number | null = null
      let bestLoss = Infinity

      for (const start of startPoints) {
        // 从每个起点进行范围为 (max-min)/NUM_STARTS 的局部搜索
        const rangeSize = (max - min) / NUM_STARTS
        const searchEnd = Math.min(max, start + rangeSize + 10) // +10 为了有重叠

        for (let theta = start; theta < searchEnd; theta += 0.5) {
          const loss = fn(normalized, theta, segments)
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
        const loss = fn(normalized, theta, segments)
        if (loss < bestLoss) {
          bestLoss = loss
          bestTheta = theta
        }
      }

      return { theta: bestTheta, loss: bestLoss }
    }

    const expandedResult = searchBest(evaluateFn)
    if (!expandedResult) {
      console.warn('[UpperRotation] 多起点搜索未找到最优点')
      return null
    }

    let bestTheta = expandedResult.theta
    let bestLoss = expandedResult.loss
    let finalEvaluateFn: typeof evaluateExpanded = evaluateFn

    // 偏移模型若收敛到搜索边界，说明 offsetDeg 质量可疑；
    // 此时回退比较无偏移目标函数，避免“黏住 180°”的退化情况。
    const isNearBoundary = bestTheta <= min + 1 || bestTheta >= max - 1
    if (hasValidOffset && isNearBoundary) {
      const directResult = searchBest(evaluateDirect)
      if (directResult && directResult.theta > min + 1 && directResult.theta < max - 1) {
        console.warn(
          `[UpperRotation] evaluateExpanded 在边界收敛 θ=${bestTheta.toFixed(2)}°，回退 evaluateDirect θ=${directResult.theta.toFixed(2)}°`
        )
        bestTheta = directResult.theta
        bestLoss = directResult.loss
        finalEvaluateFn = evaluateDirect
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
      (th) => finalEvaluateFn(normalized, th, segments),
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
        const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad
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
  measurements: readonly ValidThicknessData[]
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
  const hasGlobalPulseRange = isFinite(globalPulseRange) && globalPulseRange > 100

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
      console.debug(`[UpperRotation] 未检测到间隙，直接使用时间位置映射 offsetDeg`)
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

    // 策略一：优先使用全局 pulse 映射，避免每组局部范围缩放带来的系统偏差
    const withPulse = group.filter(
      (p) => p.pulse !== undefined && isFinite(p.pulse)
    )
    if (withPulse.length >= group.length * 0.5 && hasGlobalPulseRange) {
      for (const m of group) {
        const pulse = m.pulse !== undefined ? m.pulse : (globalPulseMin + globalPulseMax) / 2
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

    // 策略二：无 pulse，退回奇偶方向假设（首组方向可能错误）
    // 改进：使用信号变化趋势推断扫描方向，而不是单纯的奇偶索引
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
