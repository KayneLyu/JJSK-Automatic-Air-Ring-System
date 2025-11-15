import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { extractScanSegments, ScanSegment } from './common/thickness'
import {
  buildAngleEvents,
  evaluateDeltaTheta,
  interpolateAngle,
} from './common/upperRotation'

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
