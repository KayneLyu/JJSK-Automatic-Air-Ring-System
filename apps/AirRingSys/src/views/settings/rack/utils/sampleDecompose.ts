/**
 * 单样本反解工具
 *
 * 给定一个测厚仪扫描样本 (pos, ad, ts) 与一次上旋扫描趟的 B(φ) 剖面,
 * 计算它由哪两个圆周角贡献,以及各自的厚度分量。
 *
 * 公式（与 packages/AirRingServer/algorithms/bubbleReconstruction/geometry.ts 一致）:
 *   δ              = (x / W) · 180°                (mm → 角度偏移)
 *   αC             = θ + 90°                       (压合中心)
 *   φ₁, φ₂         = αC ± δ                        (前后层圆周角)
 *   T_predicted    = η · (B(φ₁) + B(φ₂))           (η = 1.02 processDeformation)
 */

import { calcThickness, type ThicknessConfig } from '../utiles'
import { TIME_TO_ANGLE_SEGMENTS } from '../bubbleRawThickness.constants'

/**
 * 仿 packages/AirRingServer/algorithms/timeToAngle.ts::buildTimeToAngle
 * 简化版:采用与后端相同的 20/60/20 加减速分段 + S 形平滑
 *
 * 返回值单位为**度**(与 geometry.ts 的 αC=θ+90°、δ=(x/W)·180° 同单位制)
 */
export function timeToAngle(
  t: number,
  isForward: boolean,
  tHalf: number,
  thetaMaxDeg: number
): number {
  const totalAngleDeg = thetaMaxDeg
  const K = TIME_TO_ANGLE_SEGMENTS
  const segmentAngleDeg = totalAngleDeg / K

  const accelRatio = 0.2
  const constantRatio = 0.6
  const accelTime = tHalf * accelRatio
  const constantTime = tHalf * constantRatio
  const segmentTimes: number[] = []
  for (let i = 0; i < K; i++) {
    if (i < K * 0.2) {
      const accelProgress = i / (K * 0.2)
      segmentTimes.push((accelTime * (1.5 - 0.5 * accelProgress)) / (K * 0.2))
    } else if (i < K * 0.8) {
      segmentTimes.push(constantTime / (K * 0.6))
    } else {
      const decelProgress = (i - K * 0.8) / (K * 0.2)
      segmentTimes.push((accelTime * (1 + decelProgress)) / (K * 0.2))
    }
  }

  if (t <= 0) return isForward ? 0 : totalAngleDeg
  if (t >= tHalf) return isForward ? totalAngleDeg : 0

  let elapsed = 0
  for (let i = 0; i < K; i++) {
    if (t <= elapsed + segmentTimes[i]) {
      const localT = t - elapsed
      const localAngleDeg = (localT / segmentTimes[i]) * segmentAngleDeg
      const normalizedLocal = localT / segmentTimes[i]
      const smoothFactor =
        3 * normalizedLocal * normalizedLocal -
        2 * normalizedLocal * normalizedLocal * normalizedLocal
      const correctedLocalAngleDeg = localAngleDeg * smoothFactor
      return isForward
        ? i * segmentAngleDeg + correctedLocalAngleDeg
        : totalAngleDeg - (i * segmentAngleDeg + correctedLocalAngleDeg)
    }
    elapsed += segmentTimes[i]
  }
  return isForward ? totalAngleDeg : 0
}

/**
 * 角度归一化到 [0, 360)
 */
function normalizeAngle(deg: number): number {
  const m = deg % 360
  return m < 0 ? m + 360 : m
}

/**
 * 在 360 bin 的 B(φ) 上做角度插值
 * B(φ)[i] 中心角度 = i * binWidthDeg + binWidthDeg/2
 */
export function interpolateB(
  profile: number[],
  angleDeg: number
): number {
  if (profile.length === 0) return 0
  const binWidth = 360 / profile.length
  const a = normalizeAngle(angleDeg)
  // 中心是 i*binWidth + binWidth/2 → 反推 i = (a - binWidth/2) / binWidth
  const idxF = (a - binWidth / 2) / binWidth
  const n = profile.length
  // 处理环绕
  const idx0 = Math.floor(idxF)
  const idx1 = idx0 + 1
  const frac = idxF - idx0
  const v0 = profile[((idx0 % n) + n) % n]
  const v1 = profile[((idx1 % n) + n) % n]
  return v0 * (1 - frac) + v1 * frac
}

export interface DecomposeInput {
  /** 扫描样本 (pos, ad, ts) */
  pos: number
  ad: number
  ts: number
  /** 该样本所属的上旋扫描趟 */
  tripStartTime: number
  tripDurationMs: number
  isForward: boolean
  /** 几何参数 */
  mmPerPulse: number
  membraneWidthMm: number
  thetaMaxDeg: number
  /** B(φ) 剖面(360 bin) */
  profile: number[]
  /** 测厚仪计算参数 */
  thicknessCfg: ThicknessConfig
  /** 形变因子 */
  processDeformation: number
}

export interface DecomposeResult {
  ts: number
  x: number
  delta: number
  theta: number
  alphaCenter: number
  phi1: number
  phi2: number
  b1: number
  b2: number
  tMeasured: number
  tPredicted: number
  residual: number
}

/**
 * 对单个测厚仪样本做完整反解
 */
export function decomposeSample(input: DecomposeInput): DecomposeResult {
  const x = input.pos * input.mmPerPulse
  const delta = (x / input.membraneWidthMm) * 180
  const tInTrip = input.ts - input.tripStartTime
  const tHalf = input.tripDurationMs / 2
  const theta = timeToAngle(tInTrip, input.isForward, tHalf, input.thetaMaxDeg)
  const alphaCenter = theta + 90
  const phi1 = normalizeAngle(alphaCenter + delta)
  const phi2 = normalizeAngle(alphaCenter - delta)
  const b1 = interpolateB(input.profile, phi1)
  const b2 = interpolateB(input.profile, phi2)
  const tMeasured = calcThickness(input.ad, input.thicknessCfg)
  const tPredicted = input.processDeformation * (b1 + b2)
  return {
    ts: input.ts,
    x,
    delta,
    theta,
    alphaCenter,
    phi1,
    phi2,
    b1,
    b2,
    tMeasured,
    tPredicted,
    residual: tMeasured - tPredicted,
  }
}

/**
 * 在样本数组中找最接近目标 ts 的样本(用于 hover bin 时取代表样本)
 */
export function findClosestSample<T extends { ts: number }>(
  samples: T[],
  targetTs: number
): T | null {
  if (samples.length === 0) return null
  // 假设样本按 ts 升序,用二分
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].ts < targetTs) lo = mid + 1
    else hi = mid
  }
  const cand1 = samples[lo]
  const cand2 = lo > 0 ? samples[lo - 1] : null
  if (!cand2) return cand1
  return Math.abs(cand1.ts - targetTs) < Math.abs(cand2.ts - targetTs)
    ? cand1
    : cand2
}
