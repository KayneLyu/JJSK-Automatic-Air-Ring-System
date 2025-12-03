import { ThicknessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import {
  computeTractionSpeedSmooth,
  extractScanSegments,
  ScanSegment,
} from '../algorithms/thickness'
import {
  buildAngleEvents,
  evaluateDeltaTheta,
  interpolateAngle,
} from '../algorithms/upperRotation.a'
import { CalibrationConfig } from '../types'
import { getCircumference } from '@jjsk/core'

// ----------------------------
// 主函数：自动优化 Δθ 并返回调节量
// ----------------------------
export const computeAirRingAdjustment = (
  thicknessData: ThicknessData[],
  ringData: RingData[],
  L_mm: number,
  config: CalibrationConfig
): {
  maxAngleDeg: number
  adjustment: number[] | null
  scanUsed?: ScanSegment
} | null => {
  const {
    standardized: { CHANNEL_COUNT, roller },
    roller: { numCycles = 3, maxIntervalMs = 10_000 },
    upperRotation: { deltaRange: { min = 180, max = 359, step = 1 } = {} },
  } = config
  const deltaRange = { min, max, step }
  // ---------- Step 1: 计算牵引速度 ----------
  const circumference = getCircumference(roller)
  const v_mm_per_s = computeTractionSpeedSmooth(
    thicknessData,
    circumference,
    numCycles,
    maxIntervalMs
  )
  if (v_mm_per_s === null || v_mm_per_s <= 0) {
    return null
  }

  // ---------- Step 2: 提取有效扫描段 ----------
  const segments = extractScanSegments(thicknessData)
  if (segments.length === 0) return null

  const latestScan = segments[segments.length - 1]

  // ---------- Step 3: 构建角度事件（暂用默认 Δθ=270° 做初步映射）----------
  // 实际中可缓存上一次的 maxAngleDeg 作为初始猜测，加速收敛
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
      CHANNEL_COUNT
    )
    if (score > bestScore) {
      bestScore = score
      bestDelta = delta
    }
  }
  // ---------- Step 4: 计算延迟补偿 ----------
  const tau_ms = (L_mm / v_mm_per_s) * 1000
  const t_nip = latestScan.endTime - tau_ms // 用扫描结束时刻近似

  // ---------- Step 5: 重建角度序列并插值 ----------
  const angleEvents = buildAngleEvents(ringData, bestDelta)
  const thetaAtNip = interpolateAngle(angleEvents, t_nip)
  if (thetaAtNip === null) return { maxAngleDeg: bestDelta, adjustment: null }

  // ---------- Step 6: 重采样厚度剖面 ----------
  const profile = new Array(CHANNEL_COUNT).fill(0)

  // ---------- Step 7: 计算风环调节量 ----------
  const count = new Array(CHANNEL_COUNT).fill(0)

  for (const pt of latestScan.points) {
    const k = Math.floor(pt.position * (CHANNEL_COUNT - 1))
    if (k >= 0 && k < CHANNEL_COUNT) {
      profile[k] += pt.thickness
      count[k]++
    }
  }

  for (let i = 0; i < CHANNEL_COUNT; i++) {
    profile[i] = count[i] > 0 ? profile[i] / count[i] : 0
  }

  // 计算偏差
  const avg = profile.reduce((a, b) => a + b, 0) / CHANNEL_COUNT
  const deviation = profile.map((h) => h - avg)

  // 映射到风环（简化：直接用 thetaAtNip 作为中心）
  const airAdjust = new Array(CHANNEL_COUNT).fill(0)
  for (let k = 0; k < CHANNEL_COUNT; k++) {
    const phi_k =
      (thetaAtNip - 90 + (180 / (CHANNEL_COUNT - 1)) * k + 360) % 360
    const j_f = (phi_k / 360) * CHANNEL_COUNT
    const j1 = Math.floor(j_f) % CHANNEL_COUNT
    const j2 = (j1 + 1) % CHANNEL_COUNT
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
