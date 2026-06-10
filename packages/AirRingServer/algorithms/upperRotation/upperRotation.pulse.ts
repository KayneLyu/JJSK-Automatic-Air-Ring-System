import { type TripSegment, type ValidThicknessData } from '../../types'
import { goldenSectionSearch } from '../../utils'
import {
  type ExpandedPoint,
  evaluateExpanded,
  buildFlippedMeasurements,
} from './upperRotation.evaluation'

/**
 * 脉冲展开法（原始逻辑的安全兜底）
 */
export const estimateWithPulseExpansion = (
  tripSegments: TripSegment[],
  min: number,
  max: number,
  step: number,
  segments: number,
  accelDecelMs?: number
): number | null => {
  try {
    const preExpanded: { data: ExpandedPoint[]; duration: number }[] = []
    for (let si = 0; si < tripSegments.length; si++) {
      const seg = tripSegments[si]
      if (seg.measurements.length === 0 || seg.duration <= 0) continue

      const flipped = buildFlippedMeasurements(seg)
      const withPulse: ValidThicknessData[] = []
      let pMin = Infinity
      let pMax = -Infinity
      for (let i = 0; i < flipped.length; i++) {
        const p = flipped[i]
        const pulse = p.pulse
        if (pulse === undefined) continue
        withPulse.push(p)
        if (pulse < pMin) pMin = pulse
        if (pulse > pMax) pMax = pulse
      }

      if (withPulse.length < 5) continue
      if (!(pMax > pMin)) continue

      const expanded: ExpandedPoint[] = []
      const pulseRange = pMax - pMin
      for (let i = 0; i < withPulse.length; i++) {
        const p = withPulse[i]
        expanded.push({
          t: p.t,
          y: p.y,
          offsetDeg: (((p.pulse as number) - pMin) / pulseRange - 0.5) * 180,
        })
      }

      preExpanded.push({ data: expanded, duration: seg.duration })
    }

    if (preExpanded.length < 2) {
      console.warn('[UpperRotation] 脉冲展开后片段数不足')
      return null
    }

    const resolveAccelRatio = (duration: number): number => {
      const effectiveMs = accelDecelMs ?? Math.min(20000, duration * 0.45)
      return Math.max(0, Math.min(1, effectiveMs / duration))
    }

    const normalized: {
      data: ExpandedPoint[]
      duration: number
      accelRatio: number
    }[] = []
    for (let i = 0; i < preExpanded.length; i++) {
      const s = preExpanded[i]
      normalized.push({
        data: s.data,
        duration: s.duration,
        accelRatio: resolveAccelRatio(s.duration),
      })
    }

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
      console.warn('[UpperRotation] 脉冲展开搜索未找到最优点')
      return null
    }

    return goldenSectionSearch(
      (th) => evaluateExpanded(normalized, th, segments),
      Math.max(min, bestTheta - step),
      Math.min(max, bestTheta + step),
      0.01
    )
  } catch (err) {
    console.error('[UpperRotation] 脉冲展开异常:', err)
    return null
  }
}

export const estimateWithTrapezoidOnly = (
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
    for (let si = 0; si < tripSegments.length; si++) {
      const seg = tripSegments[si]
      if (seg.measurements.length === 0 || seg.duration <= 0) continue
      const flipped = buildFlippedMeasurements(seg)
      const data: ExpandedPoint[] = []
      for (let i = 0; i < flipped.length; i++) {
        const p = flipped[i]
        data.push({ t: p.t, y: p.y, offsetDeg: 0 })
      }
      if (data.length === 0) continue
      const effectiveMs = accelDecelMs ?? Math.min(20000, seg.duration * 0.45)
      const accelRatio = Math.max(0, Math.min(1, effectiveMs / seg.duration))
      normalized.push({ data, duration: seg.duration, accelRatio })
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

    return goldenSectionSearch(
      (th) => evaluateExpanded(normalized, th, segments),
      Math.max(min, bestTheta - step),
      Math.min(max, bestTheta + step),
      0.01
    )
  } catch (err) {
    console.error('[UpperRotation] 梯形兜底异常:', err)
    return null
  }
}
