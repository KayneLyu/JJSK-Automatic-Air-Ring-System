/**
 * 黄金分割搜索：在 [a, b] 上最小化 f(x)
 */
export const goldenSectionSearch = (
  f: (x: number) => number,
  a: number,
  b: number,
  tol: number = 0.1 // 0.1° tolerance
): number => {
  const gr = (1 + Math.sqrt(5)) / 2 // golden ratio
  let c = b - (b - a) / gr
  let d = a + (b - a) / gr
  let fc = f(c)
  let fd = f(d)

  while (Math.abs(b - a) > tol) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - (b - a) / gr
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + (b - a) / gr
      fd = f(d)
    }
  }
  return (b + a) / 2
}

/**
 * 自动识别跳变点并裁剪数据（保留中间稳定段）
 * @param {number[]} data - 输入数组（Y轴值）
 * @param {number} threshold - 差分阈值（可调，默认 1000）
 * @returns {{start: number, end: number, filtered: number[]}}
 */
export const trimByJumpEdges = (data: number[], threshold = 1000) => {
  if (!Array.isArray(data) || data.length < 3) {
    return { start: 0, end: 0, filtered: [] }
  }

  const diff = []
  for (let i = 1; i < data.length; i++) {
    diff.push(Math.abs(data[i] - data[i - 1]))
  }

  // 查找第一个显著跳变（左边界）
  let leftEdge = -1
  for (let i = 0; i < diff.length; i++) {
    if (diff[i] > threshold && leftEdge === -1) {
      leftEdge = i
      break
    }
  }

  // 查找最后一个显著跳变（右边界）
  let rightEdge = -1
  for (let i = diff.length - 1; i >= 0; i--) {
    if (diff[i] > threshold && rightEdge === -1) {
      rightEdge = i
      break
    }
  }

  // 如果没找到有效跳变，返回原数据
  if (leftEdge === -1 || rightEdge === -1) {
    return { start: 0, end: data.length, filtered: data }
  }

  // 修正边界：确保跳变点在合理范围内
  // 通常我们希望保留的是跳变之间“平坦”的部分
  const startIdx = leftEdge + 1 // 跳变后开始
  const endIdx = rightEdge // 跳变前结束

  // 确保索引合法
  const start = Math.max(0, startIdx)
  const end = Math.min(data.length, endIdx)

  const filtered = data.slice(start, end)

  return {
    start,
    end,
    filtered,
  }
}

/**
 * 快速自相关函数（使用时域，小数据量足够快）
 */
export function autocorr(x: number[]): number[] {
  const n = x.length
  const acf = new Array(n).fill(0)
  const mean = x.reduce((a, b) => a + b, 0) / n
  const xCentered = x.map((v) => v - mean)
  const denom = xCentered.reduce((a, b) => a + b * b, 0)

  if (denom === 0) return acf

  for (let lag = 0; lag < n; lag++) {
    let corr = 0
    for (let i = 0; i < n - lag; i++) {
      corr += xCentered[i] * xCentered[i + lag]
    }
    acf[lag] = corr / denom
  }
  return acf
}

/**
 * 线性插值到均匀时间网格
 */
export function resampleToUniform(
  times: number[],
  values: number[],
  dt: number = 5
): { t: number[]; y: number[] } {
  if (times.length < 2) return { t: [], y: [] }
  const tStart = Math.ceil(times[0] / dt) * dt
  const tEnd = Math.floor(times[times.length - 1] / dt) * dt
  const tUniform: number[] = []
  const yUniform: number[] = []

  for (let t = tStart; t <= tEnd; t += dt) {
    tUniform.push(t)
    // 线性插值
    let y = values[0]
    for (let i = 0; i < times.length - 1; i++) {
      if (times[i] <= t && t <= times[i + 1]) {
        const w = (t - times[i]) / (times[i + 1] - times[i])
        y = values[i] * (1 - w) + values[i + 1] * w
        break
      }
    }
    yUniform.push(y)
  }
  return { t: tUniform, y: yUniform }
}

/**
 * 在指定区间内查找第一个显著峰值
 */
export function findFirstSignificantPeak(
  signal: number[],
  lags: number[],
  minLag: number,
  maxLag: number,
  noiseFactor: number = 2
): { lag: number | null; value: number } {
  // 获取噪声水平（取首尾10%作为背景）
  const n = signal.length
  const tailLen = Math.min(10, Math.floor(n * 0.1))
  const noiseSamples = [...signal.slice(0, tailLen), ...signal.slice(-tailLen)]
  const noiseMean =
    noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length
  const noiseStd = Math.sqrt(
    noiseSamples.reduce((a, b) => a + (b - noiseMean) ** 2, 0) /
      noiseSamples.length
  )

  let bestLag: number | null = null
  let bestVal = -Infinity

  for (let i = 0; i < lags.length; i++) {
    if (lags[i] >= minLag && lags[i] <= maxLag) {
      if (signal[i] > bestVal) {
        bestVal = signal[i]
        bestLag = lags[i]
      }
    }
  }

  const threshold = noiseMean + noiseFactor * noiseStd
  if (bestLag !== null && bestVal > threshold) {
    return { lag: bestLag, value: bestVal }
  }
  return { lag: null, value: bestVal }
}

// 替换 findPeakInLagRange 为以下版本
export function findPeakInLagRange(
  acf: number[],
  lags: number[],
  minLag: number,
  maxLag: number
): { lag: number | null; value: number } {
  console.log(
    '🔍 findPeakInLagRange called with acf.length=',
    acf.length,
    'lags.length=',
    lags.length
  )
  if (acf.length === 0 || acf.length !== lags.length) {
    return { lag: null, value: -Infinity }
  }

  const candidates = []
  for (let i = 0; i < acf.length; i++) {
    if (lags[i] >= minLag && lags[i] <= maxLag) {
      candidates.push({ i, lag: lags[i], acf: acf[i] })
    }
  }
  console.log(`Candidates count: ${candidates.length}`)
  if (candidates.length > 0) {
    const maxCand = candidates.reduce((a, b) => (a.acf > b.acf ? a : b))
    console.log(
      `Max candidate: i=${maxCand.i}, lag=${maxCand.lag}, acf=${maxCand.acf}`
    )
  } else {
    console.log('No candidates in range!')
  }

  let bestLag: number | null = null
  let bestValue = -Infinity

  for (let i = 0; i < acf.length; i++) {
    const currentLag = lags[i] // ← 从 lags 数组取
    const currentValue = acf[i] // ← 从 acf 数组取

    if (currentLag >= minLag && currentLag <= maxLag) {
      if (currentValue > bestValue) {
        bestValue = currentValue
        bestLag = currentLag // ← 只能是 currentLag！
      }
    }
  }

  // 调试阶段：先接受任何非 null 结果
  return { lag: bestLag, value: bestValue }
}
export function detrend(y: number[]): number[] {
  const n = y.length
  const x = Array.from({ length: n }, (_, i) => i)
  // 简单线性拟合 y = a*x + b
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((a, _, i) => a + x[i] * y[i], 0)
  const sumXX = x.reduce((a, b) => a + b * b, 0)
  const a = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const b = (sumY - a * sumX) / n
  return y.map((val, i) => val - (a * x[i] + b))
}
export function highpassDiff(y: number[]): number[] {
  const dy = []
  for (let i = 1; i < y.length; i++) {
    dy.push(y[i] - y[i - 1])
  }
  return dy
}

export function highpassMA(y: number[], window: number = 5): number[] {
  const ma = y.map((_, i) => {
    const start = Math.max(0, i - Math.floor(window / 2))
    const end = Math.min(y.length, i + Math.ceil(window / 2))
    return y.slice(start, end).reduce((a, b) => a + b, 0) / (end - start)
  })
  return y.map((val, i) => val - ma[i])
}
