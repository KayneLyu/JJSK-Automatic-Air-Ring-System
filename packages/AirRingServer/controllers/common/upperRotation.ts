/**
 * 上旋相关算法
 * */
import { RingData } from '../../connections/airRing/opcua'
import { ScanSegment, ValidThicknessData } from './thickness'
import { UpperRotationDeltaRange } from '../types'
import { goldenSectionSearch } from '../../utils'
import { ThicknessData } from '../../connections/thickness/opcua'
import { WithRequired } from '@jjsk/core'

export interface AngleEvent {
  timestamp: number
  angleDeg: number
}
/**
 * 构建候选角度事件（假设 Δθ）
 * */
export const buildAngleEvents = (
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
export const interpolateAngle = (
  events: AngleEvent[],
  t: number
): number | null => {
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
export const evaluateDeltaTheta = (
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

export type BaseTripSegment = {
  startTime: number
  duration: number
  isForward: boolean
}
export type TripSegment = BaseTripSegment & {
  measurements: readonly ValidThicknessData[]
}
export type ThetaMaxEstimateResult = {
  thetaMaxDeg: number
  rSquared: number
  residual: number
  validPoints: number
}
/**
 * 从正向+反向行程联合估计人字架最大旋转角度
 * @param forwardTrip 正向行程（0° → θ_max）
 * @param backwardTrip 反向行程（θ_max → 0°）
 * @returns 估计结果
 */
export const estimateMaxAngle = (
  forwardTrip: TripSegment,
  backwardTrip: TripSegment
): ThetaMaxEstimateResult | null => {
  // 校验周期一致性
  const dt = Math.abs(forwardTrip.duration - backwardTrip.duration)
  if (dt > 2000) {
    console.warn(`Half-cycle mismatch: ${dt} ms`)
    return null
  }
  const dataF = forwardTrip.measurements
  const dataB = backwardTrip.measurements
  if (dataF.length === 0 || dataB.length === 0) {
    return null
  }
  const allData = [
    ...dataF.map((p) => ({ ...p, isForward: true })),
    ...dataB.map((p) => ({ ...p, isForward: false })),
  ]
  // 目标函数：给定 theta_deg，返回标准化残差
  const objective = (thetaDeg: number): number => {
    return computeWeightedResidual(allData, thetaDeg, forwardTrip.duration)
  }
  // 黄金分割搜索最优 theta_max ∈ [180, 360]
  const thetaOpt = goldenSectionSearch(objective, 180, 360, 0.1)
  // 计算最终 R²
  const finalResidual = computeWeightedResidual(
    allData,
    thetaOpt,
    forwardTrip.duration,
    true
  )
  const totalPoints = allData.length
  const meanY = allData.reduce((sum, p) => sum + p.y, 0) / totalPoints
  const ssTot = allData.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0)
  const rSquared = ssTot > 0 ? 1 - finalResidual / ssTot : 0
  return {
    thetaMaxDeg: thetaOpt,
    rSquared,
    residual: finalResidual,
    validPoints: totalPoints,
  }
}

/**
 * 内部：计算给定 theta_max 下的加权残差
 */
const computeWeightedResidual = (
  data: Array<{ t: number; y: number; isForward: boolean }>,
  thetaDeg: number,
  T_half_sec: number,
  returnRawResidual: boolean = false
): number => {
  const thetaRad = (thetaDeg * Math.PI) / 180
  const omega = thetaRad / T_half_sec // rad/s

  // 构造线性系统: y = a + b*cos(2φ) + c*sin(2φ)
  let sumY = 0,
    sumC = 0,
    sumS = 0,
    sumCC = 0,
    sumSS = 0,
    sumCS = 0,
    sumYC = 0,
    sumYS = 0
  let n = 0

  const features: Array<{ cos2: number; sin2: number; y: number }> = []

  for (const pt of data) {
    let phi: number
    if (pt.isForward) {
      phi = omega * pt.t // 0 → θ_max
    } else {
      phi = thetaRad - omega * pt.t // θ_max → 0
    }

    const cos2 = Math.cos(2 * phi)
    const sin2 = Math.sin(2 * phi)

    features.push({ cos2, sin2, y: pt.y })
    sumY += pt.y
    sumC += cos2
    sumS += sin2
    sumCC += cos2 * cos2
    sumSS += sin2 * sin2
    sumCS += cos2 * sin2
    sumYC += pt.y * cos2
    sumYS += pt.y * sin2
    n++
  }

  if (n < 3) return Infinity

  // 解正规方程（3x3 线性系统）
  // Matrix:
  // [ n     sumC   sumS ] [a]   [sumY ]
  // [ sumC  sumCC  sumCS] [b] = [sumYC]
  // [ sumS  sumCS  sumSS] [c]   [sumYS]

  const det =
    n * (sumCC * sumSS - sumCS * sumCS) -
    sumC * (sumC * sumSS - sumCS * sumS) +
    sumS * (sumC * sumCS - sumCC * sumS)

  if (Math.abs(det) < 1e-12) return Infinity

  const a =
    (sumY * (sumCC * sumSS - sumCS * sumCS) -
      sumC * (sumYC * sumSS - sumYS * sumCS) +
      sumS * (sumYC * sumCS - sumCC * sumYS)) /
    det

  const b =
    (n * (sumYC * sumSS - sumYS * sumCS) -
      sumY * (sumC * sumSS - sumS * sumCS) +
      sumS * (sumC * sumYS - sumY * sumCS)) /
    det

  const c =
    (n * (sumCC * sumYS - sumYC * sumCS) -
      sumC * (sumC * sumYS - sumY * sumCS) +
      sumY * (sumC * sumCS - sumCC * sumS)) /
    det

  // 计算总残差
  let ssRes = 0
  for (const f of features) {
    const pred = a + b * f.cos2 + c * f.sin2
    ssRes += Math.pow(f.y - pred, 2)
  }

  return returnRawResidual ? ssRes : ssRes / n
}

/**
 * 生成旋转单程片段数据
 * */
export const buildTripSegment = (
  upperRotation: RingData[]
): BaseTripSegment[] => {
  const sorted = (
    upperRotation.filter((d) => !!d.timestamp) as WithRequired<
      RingData,
      'timestamp'
    >[]
  ).sort((a, b) => a.timestamp! - b.timestamp!)

  if (sorted.length === 0) return []

  let currentSegment: BaseTripSegment = {
    startTime: sorted[0].timestamp,
    duration: 0,
    isForward: !!sorted[0].ForwardRotation && !sorted[0].ReverseRotation,
  }
  const segments: BaseTripSegment[] = []
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    const currentSignal = !!item.ForwardRotation && !item.ReverseRotation

    if (currentSignal != currentSegment.isForward) {
      segments.push({
        ...currentSegment,
        duration: item.timestamp - currentSegment.startTime,
      })
      currentSegment = {
        startTime: item.timestamp,
        duration: 0,
        isForward: currentSignal,
      }
    }
  }
  segments.push({
    ...currentSegment,
    duration: sorted[sorted.length - 1].timestamp - currentSegment.startTime,
  })
  return segments
}
