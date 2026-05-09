import { type TripSegment } from '../../types'
import { goldenSectionSearch } from '../thicknessReverseCalculation'
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
    for (const seg of tripSegments) {
      if (seg.measurements.length === 0 || seg.duration <= 0) continue

      const flipped = buildFlippedMeasurements(seg)
      const withPulse = flipped.filter((p) => p.pulse !== undefined)

      if (withPulse.length < 5) continue

      const pMin = Math.min(...withPulse.map((p) => p.pulse as number))
      const pMax = Math.max(...withPulse.map((p) => p.pulse as number))
      if (!(pMax > pMin)) continue

      const expanded = withPulse.map((p) => ({
        t: p.t,
        y: p.y,
        offsetDeg: (((p.pulse as number) - pMin) / (pMax - pMin) - 0.5) * 180,
      }))

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

    const normalized = preExpanded.map((s) => ({
      data: s.data,
      duration: s.duration,
      accelRatio: resolveAccelRatio(s.duration),
    }))

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
    const normalized = tripSegments
      .filter((seg) => seg.measurements.length > 0 && seg.duration > 0)
      .map((seg) => {
        const data = buildFlippedMeasurements(seg).map((p) => ({
          t: p.t,
          y: p.y,
          offsetDeg: 0,
        }))
        const effectiveMs = accelDecelMs ?? Math.min(20000, seg.duration * 0.45)
        const accelRatio = Math.max(0, Math.min(1, effectiveMs / seg.duration))
        return {
          data,
          duration: seg.duration,
          accelRatio,
        }
      })
      .filter((s) => s.data.length > 0)

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
