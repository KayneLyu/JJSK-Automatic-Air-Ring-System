/**
 * 上旋相关算法 基于谐波
 * */
import { RingData } from '../connections/airRing/opcua'
import { ScanSegment } from './thickness'
import { UpperRotationDeltaRange } from '../types'

export interface AngleEvent {
  timestamp: number
  angleDeg: number
}

/**
 * 构建候选角度事件（假设 Δθ）
 * */
const buildAngleEvents = (
  ringData: RingData[],
  deltaTheta: number
): AngleEvent[] => {
  const events: { timestamp: number; isLeft: boolean }[] = []

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

/**
 * 线性插值角度
 * */
const interpolateAngle = (events: AngleEvent[], t: number): number | null => {
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

/**
 * 评分函数（基于谐波）
 * */
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

export type InferMaxAngleOptions = {
  /**
   * 风道数量
   * */
  CHANNEL_COUNT: number
  /**
   * 最后一次有效扫描数据
   * */
  latestScan: ScanSegment
  /**
   * 上旋数据
   * */
  ringData: RingData[]
  /**
   * 上旋最大旋转角度评估范围
   * */
  deltaRange?: UpperRotationDeltaRange
}
/**
 * 推断上旋最大角度
 * */
export const inferMaxAngle = ({
  latestScan,
  ringData,
  deltaRange: { min = 180, max = 359, step = 1 } = {},
  CHANNEL_COUNT,
}: InferMaxAngleOptions): number | null => {
  // ---------- 构建角度事件（暂用默认 Δθ=270° 做初步映射）----------
  // 实际中可缓存上一次的 maxAngleDeg 作为初始猜测，加速收敛
  let bestScore = -Infinity
  let bestDelta: number | null = null

  for (let delta = min; delta <= max; delta += step) {
    const score = evaluateDeltaTheta(
      [latestScan],
      ringData,
      delta,
      CHANNEL_COUNT
    )
    if (score > bestScore) {
      bestScore = score
      bestDelta = delta
    }
  }
  return bestDelta
}
