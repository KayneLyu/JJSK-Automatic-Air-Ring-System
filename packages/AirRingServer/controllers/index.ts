// ----------------------------
// Step 1: 从测厚数据提取扫描段
// ----------------------------
import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'

type TimestampMs = number
type AngleDeg = number
type ThicknessUm = number
interface ScanSegment {
  startTime: TimestampMs
  endTime: TimestampMs
  direction: 'left-to-right' | 'right-to-left'
  points: { timestamp: TimestampMs; position: number; thickness: ThicknessUm }[]
}

interface AngleEvent {
  timestamp: TimestampMs
  angleDeg: AngleDeg
}
/**
 * 提取扫描片段
 * */
const extractScanSegments = (data: ThickNessData[]): ScanSegment[] => {
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
// 自适应提取有效扫描段
const extractScanSegmentsAdaptive = (
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

// ----------------------------
// Step 2: 从 RingData 构建候选角度事件（假设 Δθ）
// ----------------------------
const buildAngleEvents = (
  ringData: RingData[],
  deltaTheta: number
): AngleEvent[] => {
  const events: { timestamp: TimestampMs; isLeft: boolean }[] = []

  let lastFDC = false
  let lastRDC = false

  for (const d of ringData) {
    if (d.timestamp == null) continue
    const ts = d.timestamp

    if (d.ReverseDirectionChange && !lastRDC) {
      events.push({ timestamp: ts, isLeft: true })
    }
    if (d.ForwardDirectionChange && !lastFDC) {
      events.push({ timestamp: ts, isLeft: false })
    }

    lastFDC = !!d.ForwardDirectionChange
    lastRDC = !!d.ReverseDirectionChange
  }

  // 转为角度
  return events
    .map((e) => ({
      timestamp: e.timestamp,
      angleDeg: e.isLeft ? 0 : deltaTheta,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

// 线性插值角度
const interpolateAngle = (
  events: AngleEvent[],
  t: TimestampMs
): AngleDeg | null => {
  if (events.length === 0) return null
  if (t <= events[0].timestamp) return events[0].angleDeg
  if (t >= events[events.length - 1].timestamp)
    return events[events.length - 1].angleDeg
  for (let i = 1; i < events.length; i++) {
    if (t <= events[i].timestamp) {
      const r =
        (t - events[i - 1].timestamp) /
        (events[i].timestamp - events[i - 1].timestamp)
      return (
        events[i - 1].angleDeg +
        r * (events[i].angleDeg - events[i - 1].angleDeg)
      )
    }
  }
  return null
}

// ----------------------------
// Step 3: 评分函数（基于谐波）
// ----------------------------
const evaluateDeltaTheta = (
  scanSegments: ScanSegment[],
  ringData: RingData[],
  deltaTheta: number,
  channelCount: number
): number => {
  const angleEvents = buildAngleEvents(ringData, deltaTheta)
  if (angleEvents.length < 2) return -Infinity

  // 重建膜泡厚度分布（简化：直方图）
  const tProfile = new Array(channelCount).fill(0)
  let totalCount = 0

  for (const seg of scanSegments) {
    const tMid = (seg.startTime + seg.endTime) / 2
    const theta = interpolateAngle(angleEvents, tMid)
    if (theta === null) continue

    // 将每个点映射到膜泡方位
    for (const pt of seg.points) {
      // pt.position ∈ [0,1] → 对应 [θ-90, θ+90]
      const phi = (theta - 90 + 180 * pt.position + 360) % 360
      const bin = Math.floor((phi / 360) * channelCount) % channelCount
      tProfile[bin] += pt.thickness
      totalCount++
    }
  }

  if (totalCount === 0) return -Infinity

  // 归一化
  const avg = tProfile.map((v) => v / (totalCount / channelCount || 1))

  // FFT 评分（简化：用离散余弦变换近似）
  let lowEnergy = 0
  let highEnergy = 0
  for (let k = 0; k < channelCount; k++) {
    let sum = 0
    for (let n = 0; n < channelCount; n++) {
      sum += avg[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * channelCount))
    }
    const energy = sum * sum
    if (k === 1 || k === 3) lowEnergy += energy
    if (k >= 10) highEnergy += energy
  }

  return lowEnergy / (highEnergy + 1e-6)
}

// ----------------------------
// 主函数：自动优化 Δθ 并返回调节量
// ----------------------------
export const computeAirRingAdjustment = (
  thicknessData: ThickNessData[],
  ringData: RingData[],
  L_mm: number,
  v_mm_per_s: number,
  channelCount: number = 64,
  deltaRange: { min: number; max: number; step: number } = {
    min: 180,
    max: 359,
    step: 1,
  }
): {
  maxAngleDeg: number
  adjustment: number[] | null
  scanUsed?: ScanSegment
} | null => {
  // 1. 提取最新完整扫描段
  const segments = extractScanSegments(thicknessData)
  if (segments.length === 0) return null

  const latestScan = segments[segments.length - 1]

  // 2. 搜索最优 Δθ
  let bestScore = -Infinity
  let bestDelta = deltaRange.min

  for (
    let delta = deltaRange.min;
    delta <= deltaRange.max;
    delta += deltaRange.step
  ) {
    const score = evaluateDeltaTheta(
      [latestScan],
      ringData,
      delta,
      channelCount
    )
    if (score > bestScore) {
      bestScore = score
      bestDelta = delta
    }
  }

  // 3. 用最优 Δθ 构建角度事件
  const angleEvents = buildAngleEvents(ringData, bestDelta)

  // 4. 映射到风环（使用最新扫描）
  const tau_ms = (L_mm / v_mm_per_s) * 1000
  const t_nip = latestScan.endTime - tau_ms // 用扫描结束时刻近似

  const thetaAtNip = interpolateAngle(angleEvents, t_nip)
  if (thetaAtNip === null) return { maxAngleDeg: bestDelta, adjustment: null }

  // 构建厚度剖面（重采样到 channelCount）
  const profile = new Array(channelCount).fill(0)
  const count = new Array(channelCount).fill(0)

  for (const pt of latestScan.points) {
    const k = Math.floor(pt.position * (channelCount - 1))
    if (k >= 0 && k < channelCount) {
      profile[k] += pt.thickness
      count[k]++
    }
  }

  for (let i = 0; i < channelCount; i++) {
    profile[i] = count[i] > 0 ? profile[i] / count[i] : 0
  }

  // 计算偏差
  const avg = profile.reduce((a, b) => a + b, 0) / channelCount
  const deviation = profile.map((h) => h - avg)

  // 映射到风环（简化：直接用 thetaAtNip 作为中心）
  const airAdjust = new Array(channelCount).fill(0)
  for (let k = 0; k < channelCount; k++) {
    const phi_k = (thetaAtNip - 90 + (180 / (channelCount - 1)) * k + 360) % 360
    const j_f = (phi_k / 360) * channelCount
    const j1 = Math.floor(j_f) % channelCount
    const j2 = (j1 + 1) % channelCount
    const w2 = j_f - j1
    const w1 = 1 - w2
    airAdjust[j1] += w1 * deviation[k]
    airAdjust[j2] += w2 * deviation[k]
  }

  return {
    maxAngleDeg: bestDelta,
    adjustment: airAdjust,
    scanUsed: latestScan,
  }
}
