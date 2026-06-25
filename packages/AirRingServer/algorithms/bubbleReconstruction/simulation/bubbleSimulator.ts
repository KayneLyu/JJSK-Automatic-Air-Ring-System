// ============================================================
// 膜泡重建 — 膜泡厚度分布仿真器
//
// 生成合成膜泡厚度分布 B(φ)：
//   B(φ) = B₀ + A_low · sin(2π·h_low·φ/360 + φ_low)
//          + A_high · sin(2π·h_high·φ/360 + φ_high)
//          + defects(φ)
//          + noise(σ)
//
// 参数：
//   B₀        — 基准厚度 (μm)
//   A_low     — 低频波动幅值 (μm)
//   h_low     — 低频谐波数（完整正弦周期数）
//   A_high    — 高频扰动幅值 (μm)
//   h_high    — 高频谐波数
//   σ         — 随机噪声标准差 (μm)
//   defects   — 局部缺陷（可选）
// ============================================================

import type { BubbleSimulatorParams } from '../types'

/**
 * 简易伪随机数生成器（线性同余）
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
 * 生成合成膜泡厚度分布
 *
 * @param params  仿真参数
 * @param N       输出点数（默认 360）
 * @returns B[0..N-1] (μm)
 */
export const generateBubbleProfile = (
  params: BubbleSimulatorParams,
  N: number = 360
): number[] => {
  const {
    baseThickness,
    lowFreqAmplitude,
    lowFreqHarmonics,
    highFreqAmplitude,
    highFreqHarmonics,
    noiseStdDev,
    withDefects = false,
    seed = 0,
  } = params

  const rng = new LCG(seed)
  const profile = new Array<number>(N)

  for (let i = 0; i < N; i++) {
    const phiRad = (2 * Math.PI * i) / N

    let thickness = baseThickness

    // 低频波动
    thickness += lowFreqAmplitude * Math.sin(lowFreqHarmonics * phiRad)

    // 高频扰动
    thickness += highFreqAmplitude * Math.sin(highFreqHarmonics * phiRad)

    // 随机噪声
    thickness += rng.gaussian(0, noiseStdDev)

    profile[i] = Math.max(0, thickness)
  }

  // 局部缺陷（厚点或薄点）
  if (withDefects) {
    const numDefects = 2 + Math.floor(rng.next() * 4)
    for (let d = 0; d < numDefects; d++) {
      const center = Math.floor(rng.next() * N)
      const amplitude = (rng.next() - 0.5) * baseThickness * 0.4 // ±20% 基准厚度
      const width = 3 + Math.floor(rng.next() * 8) // 3-10°

      for (let i = -width; i <= width; i++) {
        const idx = ((center + i) % N + N) % N
        const w = Math.exp(-(i * i) / (2 * (width / 3) ** 2))
        profile[idx] += amplitude * w
      }
    }
  }

  return profile
}

/**
 * 生成理想均匀膜泡（基准厚度 + 极小的均匀噪声）
 */
export const generateUniformBubble = (
  thickness: number = 50,
  N: number = 360
): number[] => {
  const rng = new LCG(42)
  return Array.from({ length: N }, () =>
    thickness + rng.gaussian(0, 0.05)
  )
}

/**
 * 生成典型的吹膜不对称厚度分布
 *
 * 模拟真实吹膜中常见的：一侧偏厚、另一侧偏薄、
 * 以及风道不均匀导致的局部波动。
 */
export const generateTypicalBubble = (
  baseThickness: number = 50,
  N: number = 360
): number[] => {
  const rng = new LCG(12345)
  const profile = new Array<number>(N)

  for (let i = 0; i < N; i++) {
    const phiRad = (2 * Math.PI * i) / N

    // 基础不均匀性（对径厚度差）
    const asymmetry = 3 * Math.cos(phiRad)

    // 风道周期波动（假定 24 风道）
    const channelRipple = 1.5 * Math.sin(24 * phiRad)

    // 二次谐波（椭圆度）
    const ovality = 2 * Math.sin(2 * phiRad + 0.5)

    // 随机噪声
    const noise = rng.gaussian(0, 0.3)

    profile[i] = baseThickness + asymmetry + channelRipple + ovality + noise
  }

  return profile
}

/**
 * 将膜泡 profile 转换为 0° 起始角度（用于后续处理）
 */
export const normalizeProfile = (profile: number[]): number[] => {
  // 复制以保证不可变性
  return [...profile]
}
