// ============================================================
// 膜泡重建 — FFT 相位偏移估计
//
// 原理：频域相位差估计时域平移。
//
//   若 f₂(t) ≈ f₁(t − Δt)，则：
//     F₂(ω) = F₁(ω) · e^{−jωΔt}
//     相位差 Δφ(ω) = arg(F₂(ω) / F₁(ω)) = −ωΔt
//
// 通过线性拟合 {ω, Δφ(ω)} 的斜率估计 Δt。
//
// 适用：当扫描剖面近似平移时（小 Δθ、膜泡厚度分布缓慢变化）。
// ============================================================

import { fft } from 'fft-js'

/**
 * 通过频域相位斜率估计两条扫描间的平移量
 *
 * @param scan1 第一条扫描的厚度值
 * @param scan2 第二条扫描的厚度值
 * @returns 估计的像素偏移量
 */
export const estimateShiftByPhaseSlope = (
  scan1: number[],
  scan2: number[]
): {
  shiftPixels: number
  rSquared: number
  method: 'fftPhaseShift'
} => {
  const M = Math.min(scan1.length, scan2.length)
  if (M < 16) {
    return { shiftPixels: 0, rSquared: 0, method: 'fftPhaseShift' }
  }

  const N = Math.pow(2, Math.ceil(Math.log2(M)))
  const a = new Array<number>(N).fill(0)
  const b = new Array<number>(N).fill(0)
  for (let i = 0; i < M; i++) {
    a[i] = scan1[i]
    b[i] = scan2[i]
  }

  const phasorsA = fft(a) as Array<[number, number]>
  const phasorsB = fft(b) as Array<[number, number]>

  const frequencies: number[] = []
  const phaseDiffs: number[] = []
  const weights: number[] = []

  const halfN = Math.floor(N / 2)
  for (let k = 1; k < halfN; k++) {
    const [aRe, aIm] = phasorsA[k]
    const [bRe, bIm] = phasorsB[k]

    const magA = Math.sqrt(aRe * aRe + aIm * aIm)
    const magB = Math.sqrt(bRe * bRe + bIm * bIm)
    if (magA < 1e-6 || magB < 1e-6) continue

    // conj(A) * B
    const crossReal = aRe * bRe + aIm * bIm
    const crossImag = aIm * bRe - aRe * bIm

    const phaseDiff = Math.atan2(crossImag, crossReal)

    frequencies.push(2 * Math.PI * k / N)
    phaseDiffs.push(phaseDiff)
    weights.push(magA * magB)
  }

  if (frequencies.length < 4) {
    return { shiftPixels: 0, rSquared: 0, method: 'fftPhaseShift' }
  }

  // 加权线性回归：Δφ = α·ω
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWXX = 0
  for (let i = 0; i < frequencies.length; i++) {
    const w = weights[i]
    const x = frequencies[i]
    const y = phaseDiffs[i]
    sumW += w
    sumWX += w * x
    sumWY += w * y
    sumWXY += w * x * y
    sumWXX += w * x * x
  }

  const denominator = sumW * sumWXX - sumWX * sumWX
  if (Math.abs(denominator) < 1e-12) {
    return { shiftPixels: 0, rSquared: 0, method: 'fftPhaseShift' }
  }

  const slope = (sumW * sumWXY - sumWX * sumWY) / denominator

  // R²
  let ssRes = 0, ssTot = 0
  const meanY = sumWY / sumW
  for (let i = 0; i < frequencies.length; i++) {
    const pred = slope * frequencies[i]
    ssRes += weights[i] * (phaseDiffs[i] - pred) ** 2
    ssTot += weights[i] * (phaseDiffs[i] - meanY) ** 2
  }
  const rSquared = 1 - ssRes / Math.max(ssTot, 1e-12)

  const shiftPixels = -slope

  return {
    shiftPixels: Math.round(shiftPixels * 100) / 100,
    rSquared: Math.round(rSquared * 1000) / 1000,
    method: 'fftPhaseShift',
  }
}

/**
 * 角度偏移量：将像素偏移转换为角度偏移
 */
export const pixelsToAngle = (
  shiftPixels: number,
  membraneWidthMm: number,
  numPixels: number
): number => {
  const dx = shiftPixels * (membraneWidthMm / numPixels)
  return (dx / membraneWidthMm) * 180
}
