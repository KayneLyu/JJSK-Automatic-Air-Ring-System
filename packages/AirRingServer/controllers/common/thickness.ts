/**
 * 测厚仪相关算法
 * */

import { ThickNessData } from '../../connections/thickness/opcua'

export interface ScanSegment {
  startTime: number
  endTime: number
  direction: 'left-to-right' | 'right-to-left'
  points: { timestamp: number; position: number; thickness: number }[]
}

/**
 * 提取扫描片段
 * */
export const extractScanSegments = (data: ThickNessData[]): ScanSegment[] => {
  const valid = data.filter((d) => d.timestamp != null && d.ProbeValue != null)
  if (valid.length === 0) return []

  const segments: ScanSegment[] = []
  let current: Omit<ScanSegment, 'startTime' | 'endTime'> | null = null
  let lastPulse: number | null = null
  let pulses: number[] = []

  for (const d of valid) {
    const ts = d.timestamp!
    const pulse = d.HorizontalPulse ?? 0

    // 记录脉冲用于归一化
    pulses.push(pulse)

    // 检测换向或限位触发新段
    const isNewSegment =
      d.SwapDirection ||
      d.LeftLimit ||
      d.RightLimit ||
      (lastPulse !== null && Math.abs(pulse - lastPulse) > 1e5) // 脉冲跳变（归零）

    if (isNewSegment && current) {
      // 结束上一段
      if (current.points.length > 10) {
        const minP = Math.min(...pulses.slice(-current.points.length))
        const maxP = Math.max(...pulses.slice(-current.points.length))
        const normalizedPoints = current.points.map((p) => ({
          ...p,
          position:
            maxP === minP
              ? 0.5
              : (pulses[
                  pulses.length -
                    current!.points.length +
                    current!.points.indexOf(p)
                ] -
                  minP) /
                (maxP - minP),
        }))
        segments.push({
          startTime: normalizedPoints[0].timestamp,
          endTime: normalizedPoints[normalizedPoints.length - 1].timestamp,
          direction: d.MotionDirection ? 'left-to-right' : 'right-to-left',
          points: normalizedPoints,
        })
      }
      current = null
      pulses = [pulse]
    }

    if (!current) {
      current = {
        points: [],
        direction: d.MotionDirection ? 'left-to-right' : 'right-to-left',
      }
    }

    current.points.push({
      timestamp: ts,
      position: 0, // 临时，后续归一化
      thickness: d.ProbeValue!,
    })

    lastPulse = pulse
  }

  // 处理最后一段
  if (current && current.points.length > 10) {
    const pts = pulses.slice(-current.points.length)
    const minP = Math.min(...pts)
    const maxP = Math.max(...pts)
    const normalizedPoints = current.points.map((p, i) => ({
      ...p,
      position: maxP === minP ? 0.5 : (pts[i] - minP) / (maxP - minP),
    }))
    segments.push({
      startTime: normalizedPoints[0].timestamp,
      endTime: normalizedPoints[normalizedPoints.length - 1].timestamp,
      direction: current.direction,
      points: normalizedPoints,
    })
  }

  return segments
}

type ValidThickNessData = {
  ts: number
  pulse: number
  thickness: number
  leftLimit: boolean
  rightLimit: boolean
  swap: boolean
  direction: boolean
}

/**
 * 自适应提取有效扫描段
 * */
export const extractScanSegmentsAdaptive = (
  data: ThickNessData[],
  minPulseSpanRatio: number = 0.8,
  minPoints: number = 8 // 绝对下限，防止单点误判
): ScanSegment[] => {
  const valid: ValidThickNessData[] = data
    .filter(
      (d) =>
        d.timestamp != null && d.ProbeValue != null && d.HorizontalPulse != null
    )
    .map((d) => ({
      ts: d.timestamp!,
      pulse: d.HorizontalPulse!,
      thickness: d.ProbeValue!,
      leftLimit: !!d.LeftLimit,
      rightLimit: !!d.RightLimit,
      swap: !!d.SwapDirection,
      direction: !!d.MotionDirection,
    }))

  if (valid.length === 0) return []

  // 先粗分割：按 SwapDirection 或脉冲跳变
  const rawSegments: ValidThickNessData[][] = []
  let currentSeg: ValidThickNessData[] = [valid[0]]

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1]
    const curr = valid[i]

    const isSwap = curr.swap
    const isPulseJump = Math.abs(curr.pulse - prev.pulse) > 1e6 // 归零跳变

    if (isSwap || isPulseJump) {
      if (currentSeg.length >= minPoints) {
        rawSegments.push([...currentSeg])
      }
      currentSeg = [curr]
    } else {
      currentSeg.push(curr)
    }
  }
  if (currentSeg.length >= minPoints) rawSegments.push(currentSeg)

  // 计算历史最大脉冲跨度（用于归一化）
  const spans = rawSegments.map((seg) => {
    const pulses = seg.map((p) => p.pulse)
    return Math.max(...pulses) - Math.min(...pulses)
  })
  const maxSpan = spans.length > 0 ? Math.max(...spans) : 1

  // 筛选有效段：跨度足够 + 包含限位（可选）
  const segments: ScanSegment[] = []
  for (const seg of rawSegments) {
    const pulses = seg.map((p) => p.pulse)
    const span = Math.max(...pulses) - Math.min(...pulses)

    const hasLeft = seg.some((p) => p.leftLimit)
    const hasRight = seg.some((p) => p.rightLimit)
    const hasBothLimits = hasLeft && hasRight

    // 判据：要么有双限位，要么脉冲跨度足够大
    const isValid = hasBothLimits || span >= minPulseSpanRatio * maxSpan

    if (isValid && seg.length >= minPoints) {
      const minP = Math.min(...pulses)
      const maxP = Math.max(...pulses)
      const points = seg.map((p) => ({
        timestamp: p.ts,
        position: maxP === minP ? 0.5 : (p.pulse - minP) / (maxP - minP),
        thickness: p.thickness,
      }))

      segments.push({
        startTime: points[0].timestamp,
        endTime: points[points.length - 1].timestamp,
        direction: seg[0].direction ? 'left-to-right' : 'right-to-left',
        points,
      })
    }
  }

  return segments
}

/**
 * 计算牵引速度，平滑算法
 * @param data 测厚仪数据
 * @param Circumference 辊周长，单位：mm
 * @param numCycles 使用最近 N 圈计算平均速度
 * @param maxIntervalMs 最大允许脉冲间隔（防停机误判，默认 10_000 ms = 10秒）
 * @returns 速度（mm/s），若无法计算则返回 null
 * */
export const computeTractionSpeedSmooth = (
  data: ThickNessData[],
  Circumference: number,
  numCycles: number = 3, // 使用最近 N 圈计算平均速度
  maxIntervalMs: number = 10_000
): number | null => {
  const pulseTimes: number[] = data
    .filter((d) => d.RollSpeedSignal === true && d.timestamp != null)
    .sort((a, b) => a.timestamp! - b.timestamp!)
    .map((d) => d.timestamp!)

  if (pulseTimes.length < numCycles + 1) return null

  const recentPulses = pulseTimes.slice(-(numCycles + 1))
  const totalDistance = Circumference * numCycles
  const totalTime_ms = recentPulses[recentPulses.length - 1] - recentPulses[0]

  if (totalTime_ms <= 0 || totalTime_ms > maxIntervalMs * numCycles) {
    return null
  }

  return (totalDistance * 1000) / totalTime_ms // mm/s
}
