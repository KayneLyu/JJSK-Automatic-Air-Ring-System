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
 */
const filterPartialSegments = (segments: TripSegment[]): TripSegment[] => {
  if (segments.length <= 2) return segments
  const durations = segments.map((s) => s.duration).filter((d) => d > 0)
  if (durations.length === 0) return segments
  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const minDuration = median * 0.8
  const filtered = segments.filter(
    (s) => s.duration >= minDuration && s.measurements.length >= 10
  )
  return filtered.length >= 2 ? filtered : segments
}

/**
 * 检测数据中是否有脉冲数据
 * 
 * ⚠️ **已禁用（2026-03-17）**：虽然测厚仪提供脉冲计数，但实验表明在每个片段内
 * 脉冲信号非单调，存在多次反向，表明测厚仪在上旋行程中完成了多次往返扫描。
 * 因此无法假设脉冲值直接映射为扫描仪偏移角度 [-90°, +90°]，改用扫描段展开法。
 */
const hasPulseData = (tripSegments: TripSegment[]): boolean => {
  // 总是返回 false，禁用脉冲路径，使用扫描段展开法或原始方法
  return false
}

/**
 * 鲁棒 theta_max 估计
 *
 * 三路策略：
 * 1. 优先使用脉冲数据：精确的扫描仪位置 → 最准确
 * 2. 有扫描间隙时：使用扫描段展开 + 梯形速度曲线
 * 3. 无间隙时：使用原始 bin 方差法（梯形映射）
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
  // 过滤不完整的首尾片段，避免错误的时间→角度映射
  const fullSegments = filterPartialSegments(tripSegments)

  // 优先使用脉冲数据（最准确）
  if (hasPulseData(fullSegments)) {
    return estimateWithPulseExpansion(fullSegments, min, max, step, segments)
  }

  // 标准化正/反向时间轴
  const normalized = fullSegments.map((seg) => ({
    data: seg.isForward
      ? seg.measurements
      : seg.measurements.map((p) => ({ ...p, t: seg.duration - p.t })),
    duration: seg.duration,
  }))

  // 检测是否有扫描间隙
  const hasGaps = detectScanGaps(normalized)

  if (hasGaps) {
    return estimateWithScannerExpansion(fullSegments, min, max, step, segments)
  } else {
    return estimateOriginal(normalized, min, max, step, segments)
  }
}

/**
 * 检测数据中是否存在扫描间隙
 */
const detectScanGaps = (
  normalized: { data: readonly ValidThicknessData[]; duration: number }[]
): boolean => {
  for (const { data } of normalized) {
    if (data.length < 50) continue
    const sorted = data
      .filter((p) => !isNaN(p.y))
      .slice()
      .sort((a, b) => a.t - b.t)
    if (sorted.length < 20) continue
    const intervals: number[] = []
    for (let i = 1; i < Math.min(sorted.length, 500); i++) {
      const dt = sorted[i].t - sorted[i - 1].t
      if (dt > 0) intervals.push(dt)
    }
    if (intervals.length === 0) continue
    intervals.sort((a, b) => a - b)
    const median = intervals[Math.floor(intervals.length / 2)]
    let gapCount = 0
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].t - sorted[i - 1].t > median * 3) gapCount++
    }
    if (gapCount >= 5) return true
  }
  return false
}

/**
 * 原始 bin 方差法（梯形速度映射，用于无间隙数据）
 */
const estimateOriginal = (
  normalized: { data: readonly ValidThicknessData[]; duration: number }[],
  min: number,
  max: number,
  step: number,
  segments: number
): number | null => {
  let bestTheta: number | null = null
  let bestLoss = Infinity
  for (let theta = min; theta < max; theta += step) {
    const loss = evaluateOriginal(normalized, theta, segments)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }
  if (bestTheta == null) return null
  // 精搜索（0.1° 步长，±2° 范围内）
  const fineMinO = Math.max(min, bestTheta - 2)
  const fineMaxO = Math.min(max, bestTheta + 2)
  for (let theta = fineMinO; theta <= fineMaxO; theta += 0.1) {
    const loss = evaluateOriginal(normalized, theta, segments)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }
  return goldenSectionSearch(
    (th) => evaluateOriginal(normalized, th, segments),
    Math.max(min, bestTheta - 1),
    Math.min(max, bestTheta + 1),
    0.01
  )
}

const evaluateOriginal = (
  segs: { data: readonly ValidThicknessData[]; duration: number }[],
  thetaMaxDeg: number,
  NUM_BINS: number
): number => {
  if (!segs || segs.length === 0) return Infinity
  const bw = (2 * Math.PI) / NUM_BINS
  const allY: number[] = []
  let tv = 0,
    vc = 0
  const bv: number[][] = Array.from({ length: NUM_BINS }, () => [])
  for (const { data, duration } of segs) {
    if (!data || data.length === 0) continue
    // 使用梯形速度曲线映射代替线性映射，补偿加减速效应
    const accelRatio = Math.min(20000, duration * 0.45) / duration
    const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi = trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad
      const np = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      bv[Math.floor(np / bw) % NUM_BINS].push(p.y)
      allY.push(p.y)
    }
  }
  for (let i = 0; i < NUM_BINS; i++) {
    const v = bv[i]
    if (v.length < 2) continue
    let s = 0,
      sq = 0
    for (const x of v) {
      s += x
      sq += x * x
    }
    const m = s / v.length
    tv += sq / v.length - m * m
    vc++
  }
  if (vc === 0) return Infinity
  const gm = allY.reduce((a, b) => a + b, 0) / allY.length
  const gv = allY.reduce((s, y) => s + (y - gm) ** 2, 0) / allY.length
  return gv > 1 ? tv / (vc * gv) : tv / vc
}

type ExpandedPoint = { t: number; y: number; offsetDeg: number }

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
  // 只从在界（非 NaN）数据计算脉冲范围
  // 真实数据中出界点（y=NaN）的脉冲位置对应膜外缓冲区，
  // 不应参与脉冲→角度映射，否则会导致偏移角度不对称
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
  if (!isFinite(pulseRange) || pulseRange === 0) return null

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
    const accelRatio = accelMs / seg.duration
    normalized.push({ data: expanded, duration: seg.duration, accelRatio })
  }

  if (normalized.length < 2) return null

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
  if (bestTheta == null) return null

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

  // 黄金分割精确收敛（bin 方差法）
  // 虽然 evaluateSpectral 理论上优于 bin 方差法，但在实际样本数据上
  // 由于光通量的 DC/AC 比很高（5-15），谱分析的 DC 项会主导结果，导致
  // 收敛点严重偏离（误差 40-111°）。因此保持使用 bin 方差法保证稳定性。
  // 参见：upperRotation.instructions.md 第 6 节「已知问题」。
  return goldenSectionSearch(
    (th) => evaluateExpanded(normalized, th, segments),
    Math.max(min, bestTheta - 1),
    Math.min(max, bestTheta + 1),
    0.01
  )
}

/**
 * 扫描段展开法（用于有间隙数据，无脉冲信息时的回退方案）
 *
 * 使用梯形速度曲线模型映射时间→角度，交替处理正反向扫描。
 */
const estimateWithScannerExpansion = (
  tripSegments: TripSegment[],
  min: number,
  max: number,
  step: number,
  segments: number,
  accelDecelMs?: number
): number | null => {
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
      const accelRatio = accelMs / seg.duration
      normalized.push({ data: expanded, duration: seg.duration, accelRatio })
    }
  }
  if (normalized.length < 2) return null

  let bestTheta: number | null = null
  let bestLoss = Infinity
  for (let theta = min; theta < max; theta += step) {
    const loss = evaluateExpanded(normalized, theta, segments)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }
  if (bestTheta == null) return null

  // 精搜索（0.1° 步长，±2° 范围内）
  const fineMin2 = Math.max(min, bestTheta - 2)
  const fineMax2 = Math.min(max, bestTheta + 2)
  for (let theta = fineMin2; theta <= fineMax2; theta += 0.1) {
    const loss = evaluateExpanded(normalized, theta, segments)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }

  return goldenSectionSearch(
    (th) => evaluateExpanded(normalized, th, segments),
    Math.max(min, bestTheta - 1),
    Math.min(max, bestTheta + 1),
    0.01
  )
}

/**
 * 扫描段展开：排序 → 分组 → 分配偏移（奇偶组交替方向）
 */
const expandWithScannerOffset = (
  measurements: readonly ValidThicknessData[]
): ExpandedPoint[] => {
  if (measurements.length === 0) return []
  const valid = measurements
    .filter((p) => !isNaN(p.y))
    .slice()
    .sort((a, b) => a.t - b.t)
  if (valid.length < 2) return valid.map((p) => ({ ...p, offsetDeg: 0 }))

  const intervals: number[] = []
  for (let i = 1; i < Math.min(valid.length, 500); i++) {
    const dt = valid[i].t - valid[i - 1].t
    if (dt > 0) intervals.push(dt)
  }
  if (intervals.length === 0) return valid.map((p) => ({ ...p, offsetDeg: 0 }))
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]
  const gapThreshold = medianInterval * 3

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

  if (groups.length <= 1) return valid.map((p) => ({ ...p, offsetDeg: 0 }))

  // 奇偶组交替方向：偶数组 -90°→+90°，奇数组 +90°→-90°
  const result: ExpandedPoint[] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]
    if (group.length < 5) continue
    const isForwardScan = gi % 2 === 0
    for (let i = 0; i < group.length; i++) {
      const pos = group.length > 1 ? i / (group.length - 1) : 0.5
      const effectivePos = isForwardScan ? pos : 1 - pos
      result.push({
        t: group[i].t,
        y: group[i].y,
        offsetDeg: (effectivePos - 0.5) * 180,
      })
    }
  }
  return result.length > 0 ? result : valid.map((p) => ({ ...p, offsetDeg: 0 }))
}

/**
 * 谐波功率法（专用于脉冲展开路径）
 *
 * 计算偶次谐波（k=2, 4）的相干功率。当角度映射正确时，各测量点在
 * 其对应角度上相干叠加，谐波功率最大。
 *
 * 相比 bin 方差法的优势：
 * - 无离散化/别名误差，精度不受 bin 数量限制
 * - Fourier 变换是最优线性滤波器，对弱信号更灵敏
 * - 对噪声鲁棒：偶次谐波信号与宽频噪声近似正交
 *
 * @returns 负的归一化谐波功率（取负以便与最小化搜索兼容）
 */
const evaluateSpectral = (
  segs: {
    data: readonly ExpandedPoint[]
    duration: number
    accelRatio: number
  }[],
  thetaMaxDeg: number
): number => {
  if (!segs || segs.length === 0) return Infinity
  const thetaMaxRad = (thetaMaxDeg * Math.PI) / 180
  let c2 = 0,
    s2 = 0,
    c4 = 0,
    s4 = 0
  let sumY = 0,
    sumY2 = 0,
    n = 0
  for (const { data, duration, accelRatio } of segs) {
    if (!data || data.length === 0) continue
    for (const p of data) {
      if (isNaN(p.y)) continue
      const phi =
        trapezoidalPosition(p.t / duration, accelRatio) * thetaMaxRad +
        (p.offsetDeg * Math.PI) / 180
      const y = p.y
      c2 += Math.cos(2 * phi) * y
      s2 += Math.sin(2 * phi) * y
      c4 += Math.cos(4 * phi) * y
      s4 += Math.sin(4 * phi) * y
      sumY += y
      sumY2 += y * y
      n++
    }
  }
  if (n < 3) return Infinity
  const gv = sumY2 / n - (sumY / n) ** 2
  if (gv <= 1) return Infinity
  // 归一化相干功率：除以 n² 消除数据量影响，再除以全局方差做尺度归一化
  const power = (c2 * c2 + s2 * s2 + c4 * c4 + s4 * s4) / (n * n)
  return -power / gv
}

/**
 * 展开数据的 bin 方差法（带梯形速度曲线修正）
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

  let tv = 0,
    vc = 0
  for (let i = 0; i < NUM_BINS; i++) {
    if (bc[i] < 2) continue
    tv += b2[i] / bc[i]
    vc++
  }
  if (vc === 0 || tN < 2) return Infinity
  const gv = tY2 / tN - (tY / tN) ** 2
  return gv > 1 ? tv / (vc * gv) : tv / vc
}
