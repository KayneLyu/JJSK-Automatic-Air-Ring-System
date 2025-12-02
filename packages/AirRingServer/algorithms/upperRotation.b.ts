/**
 * 上旋相关算法 最优搜索
 * */
import { RingData } from '../connections/airRing/opcua'
import { goldenSectionSearch } from '../utils'
import { WithRequired } from '@jjsk/core'
import { BaseTripSegment, ThetaMaxEstimateResult, TripSegment } from '../types'

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
    isForward: Boolean(sorted[0].ForwardRotation) && !sorted[0].ReverseRotation,
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
