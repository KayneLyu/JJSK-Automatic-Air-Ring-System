import { TripSegment, ValidThicknessData } from '../../types'
import { type UpperRotationOffsetMode } from './upperRotation.config'
import { type ExpandedPoint } from './upperRotation.evaluation'

export type PulseCoverageSignature = {
  covP10: number
  narrowRate: number
  validGroups: number
}

// 提取可观测覆盖签名，用于受控 challenger 放宽门控。
export const extractPulseCoverageSignature = (
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
 * 扫描段展开：排序 → 按间隙分组 → 分配偏移
 *
 * **位置映射策略（优先级从高到低）**
 *
 * 1. **每组 pulse 归一化**（推荐，方向无歧义）
 * 2. **奇偶交替方向**（回退，精度较低）
 */
export const expandWithScannerOffset = (
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
  const gapThreshold = Math.max(medianInterval * 3, 100)

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

  if (groups.length <= 1) {
    const midIdx = Math.floor(valid.length / 2)
    if (midIdx > 0 && midIdx < valid.length) {
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
    }
    return valid.map((p) => ({ ...p, offsetDeg: 0 }))
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

    const firstHalf = group.slice(0, Math.floor(group.length * 0.3))
    const lastHalf = group.slice(Math.floor(group.length * 0.7))

    const firstMean = firstHalf.reduce((a, p) => a + p.y, 0) / firstHalf.length
    const lastMean = lastHalf.reduce((a, p) => a + p.y, 0) / lastHalf.length

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
