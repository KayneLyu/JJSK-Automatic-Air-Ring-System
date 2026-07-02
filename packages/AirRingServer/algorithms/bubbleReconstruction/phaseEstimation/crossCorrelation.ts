// ============================================================
// 膜泡重建 — 互相关相位估计
//
// 原理：相邻扫描的 T(x) 剖面通过互相关估计平移量 Δθ
//
// 双层折叠映射下：
//   T(x) = B(αC + δ(x)) + B(αC − δ(x))
//   其中 αC = θ + 90°
//
// 当 θ 变化 Δθ 时，αC 变化 Δθ，T(x) 剖面近似平移但非精确。
//
// 互相关法提供粗估计，用于种子 Bin Variance 精搜索。
//
// 复杂度：O(M²) 时域 / O(M log M) FFT 频域
// ============================================================

import { fft, ifft, util as fftUtil } from 'fft-js'

/**
 * 时域互相关估计两条扫描剖面之间的相位偏移
 *
 * @param scan1 第一条扫描的厚度值 T₁[i]
 * @param scan2 第二条扫描的厚度值 T₂[i]
 * @param membraneWidthMm 膜宽 W (mm)
 * @returns 估计的 Δθ (°)，正值为 scan2 超前 scan1
 */
export const estimatePhaseByCrossCorrelation = (
  scan1: number[],
  scan2: number[],
  membraneWidthMm: number
): {
  deltaThetaDeg: number
  correlation: number
  shiftPixels: number
  method: 'crossCorrelation'
} => {
  const M = Math.min(scan1.length, scan2.length)
  if (M < 10) {
    return { deltaThetaDeg: 0, correlation: 0, shiftPixels: 0, method: 'crossCorrelation' }
  }

  const mean1 = scan1.slice(0, M).reduce((a, b) => a + b, 0) / M
  const mean2 = scan2.slice(0, M).reduce((a, b) => a + b, 0) / M

  let maxCorr = -Infinity
  let bestShift = 0
  const maxShift = Math.floor(M / 4)

  // 预计算分母
  let norm1 = 0, norm2 = 0
  for (let i = 0; i < M; i++) {
    norm1 += (scan1[i] - mean1) ** 2
    norm2 += (scan2[i] - mean2) ** 2
  }
  const normDenom = Math.sqrt(Math.max(norm1 * norm2, 1e-10))

  for (let shift = -maxShift; shift <= maxShift; shift++) {
    let corr = 0
    let n = 0
    for (let i = 0; i < M; i++) {
      const j = i - shift
      if (j >= 0 && j < M) {
        corr += (scan1[i] - mean1) * (scan2[j] - mean2)
        n++
      }
    }
    if (n > 0) {
      corr = corr / normDenom
    }
    if (corr > maxCorr) {
      maxCorr = corr
      bestShift = shift
    }
  }

  const deltaThetaDeg = bestShift * (180 / M)

  return {
    deltaThetaDeg: Math.round(deltaThetaDeg * 100) / 100,
    correlation: Math.round(maxCorr * 1000) / 1000,
    shiftPixels: bestShift,
    method: 'crossCorrelation',
  }
}

/**
 * FFT 频域互相关（更快，O(M log M)）
 *
 * R(k) = IFFT{ FFT{scan1} · conj(FFT{scan2}) }
 */
export const estimatePhaseByFFTCrossCorrelation = (
  scan1: number[],
  scan2: number[],
  membraneWidthMm: number
): {
  deltaThetaDeg: number
  correlation: number
  shiftPixels: number
  method: 'fftPhaseShift'
} => {
  const M = Math.min(scan1.length, scan2.length)
  if (M < 16) {
    const result = estimatePhaseByCrossCorrelation(scan1, scan2, membraneWidthMm)
    return {
      deltaThetaDeg: result.deltaThetaDeg,
      correlation: result.correlation,
      shiftPixels: result.shiftPixels,
      method: 'fftPhaseShift',
    }
  }

  const N = Math.pow(2, Math.ceil(Math.log2(M)))
  const padded1 = new Array<number>(N).fill(0)
  const padded2 = new Array<number>(N).fill(0)

  const mean1 = scan1.slice(0, M).reduce((a, b) => a + b, 0) / M
  const mean2 = scan2.slice(0, M).reduce((a, b) => a + b, 0) / M
  for (let i = 0; i < M; i++) {
    padded1[i] = scan1[i] - mean1
    padded2[i] = scan2[i] - mean2
  }

  // FFT returns [[real, imag], ...]
  const phasors1 = fft(padded1) as Array<[number, number]>
  const phasors2 = fft(padded2) as Array<[number, number]>

  // Cross-spectrum: conj(FFT1) * FFT2
  const crossPhasors: Array<[number, number]> = []
  for (let i = 0; i < N; i++) {
    const [aRe, aIm] = phasors1[i]
    const [bRe, bIm] = phasors2[i]
    crossPhasors.push([
      aRe * bRe + aIm * bIm,   // real part of conj(A)*B
      aIm * bRe - aRe * bIm,    // imag part of conj(A)*B
    ])
  }

  // IFFT → cross-correlation
  const corr = ifft(crossPhasors) as number[]

  // Find peak
  let maxCorr = -Infinity
  let bestIdx = 0
  const maxShift = Math.floor(N / 4)
  for (let i = 0; i <= maxShift; i++) {
    if (corr[i] > maxCorr) { maxCorr = corr[i]; bestIdx = i }
  }
  for (let i = Math.max(N - maxShift, maxShift + 1); i < N; i++) {
    if (corr[i] > maxCorr) { maxCorr = corr[i]; bestIdx = -(N - i) }
  }

  const deltaThetaDeg = bestIdx * (180 / M)

  return {
    deltaThetaDeg: Math.round(deltaThetaDeg * 100) / 100,
    correlation: Math.round(Math.min(maxCorr / N, 1) * 1000) / 1000,
    shiftPixels: bestIdx,
    method: 'fftPhaseShift',
  }
}

/**
 * 利用连续多条扫描剖面估计上旋角速度
 */
export const estimatePhaseFromMultipleScans = (
  scans: number[][],
  membraneWidthMm: number,
  method: 'crossCorrelation' | 'fftPhaseShift' = 'crossCorrelation'
): number[] => {
  const deltaThetas: number[] = []
  for (let i = 1; i < scans.length; i++) {
    const result =
      method === 'fftPhaseShift'
        ? estimatePhaseByFFTCrossCorrelation(scans[i - 1], scans[i], membraneWidthMm)
        : estimatePhaseByCrossCorrelation(scans[i - 1], scans[i], membraneWidthMm)
    deltaThetas.push(result.deltaThetaDeg)
  }
  return deltaThetas
}
