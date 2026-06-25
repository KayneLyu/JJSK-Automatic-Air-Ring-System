// ============================================================
// 膜泡重建 — 测量仿真器
//
// 模拟测厚仪工作过程：从真实膜泡厚度分布 B(φ) 生成测量序列 T(x,t)
//
// 物理过程：
//   1. 膜泡 B(φ) 固定不变（或缓慢变化）
//   2. 上旋以 ω 角速度连续旋转，θ(t) = ω·t mod 360°
//   3. 压合中心 αC(t) = θ(t) + 90°
//   4. 横扫测厚仪以周期 Ts 在 x∈[0,W] 上往返扫描
//   5. 每个采样点 x 的测量值：
//        T(x,t) = η × [ B(φ₁(x,t)) + B(φ₂(x,t)) ] + noise
//     其中 φ₁ = αC + δ, φ₂ = αC − δ, δ = (x/W)×180°
//   6. 运输延迟 τ：t_measurement = t_formation + τ
//       即 θ_eff(t_measurement) = θ(t_measurement − τ)
//
// 离散化：
//   时间步长 Δt = Ts / M (M 个采样点每扫描)
//   扫描方向交替（正向/反向）
// ============================================================

import type { MeasurementTriple, MeasurementSimulatorParams } from '../types'
import { computePhiPair } from '../geometry'

/**
 * 简易伪随机数生成器
 */
class LCG {
  private state: number
  constructor(seed: number) {
    this.state = seed === 0 ? Date.now() : seed
  }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0x7fffffff
    return this.state / 0x7fffffff
  }
  gaussian(mean: number = 0, stdDev: number = 1): number {
    let u = 0, v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

/**
 * 生成横扫测厚仪仿真测量序列
 *
 * @param profile        膜泡真实厚度分布 B(φ) [μm]
 * @param params         仿真参数
 * @param timeVaryingFn  可选：B(φ,t) 随时间变化的函数
 * @returns 测量三元组序列
 */
export const simulateMeasurements = (
  profile: number[],
  params: MeasurementSimulatorParams,
  timeVaryingFn?: (profile: number[], t: number) => number[]
): MeasurementTriple[] => {
  const {
    membraneWidthMm,
    rotationSpeedDegPerSec,
    scanPeriodSec,
    numScanPoints,
    transportDelaySec,
    totalTimeSec,
    processDeformationFactor,
    measurementNoiseStdDev,
  } = params

  const rng = new LCG(42)
  const N = profile.length
  const binWidth = 360 / N
  const dt = scanPeriodSec / numScanPoints

  const measurements: MeasurementTriple[] = []

  for (let t = 0; t < totalTimeSec; t += dt) {
    // 当前时间对应的上旋角（考虑运输延迟）
    const tFormation = t - transportDelaySec
    const upperAngleDeg = ((rotationSpeedDegPerSec * Math.max(0, tFormation)) % 360 + 360) % 360

    // 当前扫描方向（往返）
    const scanCycle = Math.floor(t / scanPeriodSec)
    const scanProgress = (t % scanPeriodSec) / scanPeriodSec // [0, 1]
    const isForward = scanCycle % 2 === 0
    const effectiveProgress = isForward ? scanProgress : 1 - scanProgress

    // 扫描仪位置
    const scannerPosMm = effectiveProgress * membraneWidthMm

    // 获取当前时刻的 profile（支持时变）
    const currentProfile = timeVaryingFn ? timeVaryingFn(profile, t) : profile

    // 计算 φ₁, φ₂
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    // 线性插值 B(φ)
    const interp = (phiDeg: number): number => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      return currentProfile[lo] * (1 - w) + currentProfile[hi] * w
    }

    const trueThickness =
      (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor +
      rng.gaussian(0, measurementNoiseStdDev)

    measurements.push({
      upperAngleDeg,
      scannerPosMm,
      thickness: Math.max(0, trueThickness),
    })
  }

  return measurements
}

/**
 * 生成单个完整扫描的测量（用于扫描剖面分析）
 *
 * @returns 单次扫描的厚度剖面 T[i], i=0..M-1
 */
export const simulateSingleScan = (
  profile: number[],
  upperAngleDeg: number,
  membraneWidthMm: number,
  numScanPoints: number,
  processDeformationFactor: number,
  measurementNoiseStdDev: number
): number[] => {
  const rng = new LCG(98765)
  const N = profile.length
  const binWidth = 360 / N
  const scan: number[] = []

  for (let i = 0; i < numScanPoints; i++) {
    const scannerPosMm = (i / (numScanPoints - 1)) * membraneWidthMm
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    const interp = (phiDeg: number): number => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      return profile[lo] * (1 - w) + profile[hi] * w
    }

    const thickness =
      (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor +
      rng.gaussian(0, measurementNoiseStdDev)

    scan.push(Math.max(0, thickness))
  }

  return scan
}

/**
 * 连续多扫描生成（每条扫描是一个完整的膜宽剖面）
 *
 * @returns M 条扫描剖面，每条有 numScanPoints 个厚度值
 */
export const simulateMultipleScans = (
  profile: number[],
  params: MeasurementSimulatorParams,
  timeVaryingFn?: (profile: number[], t: number) => number[]
): number[][] => {
  const {
    membraneWidthMm,
    rotationSpeedDegPerSec,
    scanPeriodSec,
    numScanPoints,
    transportDelaySec,
    totalTimeSec,
    processDeformationFactor,
    measurementNoiseStdDev,
  } = params

  const numScans = Math.floor(totalTimeSec / scanPeriodSec)
  const scans: number[][] = []

  for (let scanIdx = 0; scanIdx < numScans; scanIdx++) {
    const tMid = scanIdx * scanPeriodSec + scanPeriodSec / 2
    const tFormation = tMid - transportDelaySec
    const upperAngleDeg =
      ((rotationSpeedDegPerSec * Math.max(0, tFormation)) % 360 + 360) % 360

    const currentProfile = timeVaryingFn ? timeVaryingFn(profile, tMid) : profile

    const scan = simulateSingleScan(
      currentProfile,
      upperAngleDeg,
      membraneWidthMm,
      numScanPoints,
      processDeformationFactor,
      measurementNoiseStdDev
    )
    scans.push(scan)
  }

  return scans
}

/**
 * 生成上旋角的真实时间序列（用于验证）
 */
export const generateTrueAngles = (
  params: MeasurementSimulatorParams
): { t: number; theta: number }[] => {
  const { rotationSpeedDegPerSec, totalTimeSec, transportDelaySec } = params
  const dt = 1.0 // 每秒一个采样
  const angles: { t: number; theta: number }[] = []

  for (let t = 0; t <= totalTimeSec; t += dt) {
    const tFormation = t - transportDelaySec
    const theta = ((rotationSpeedDegPerSec * Math.max(0, tFormation)) % 360 + 360) % 360
    angles.push({ t, theta })
  }

  return angles
}
