// ============================================================
// 膜泡厚度重建算法
//
// 【几何模型】
//   膜泡半径 R, 压平膜宽 W = πR (半周长)
//   压合中心 αC = θ(t) + 90°
//   扫描偏移 δ = (x / W) × 180°
//   前层角 φ₁ = (αC + δ) mod 360°
//   后层角 φ₂ = (αC − δ) mod 360°
//
//   φ₁ − φ₂ = 2δ, 仅在边缘 (|x|=W/2, δ=±90°) 时分离角 = 180°
//   内点不满足 φ₂ = φ₁ + 180°  —— 旧简化模型是错误的
//
// 【测量模型】
//   T_k = processFactor × (B(φ₁_k) + B(φ₂_k))
//   B(φ) 离散为 N 个 bin, 线性插值
//
// 【重建方法】
//   1. Batch 模式: (AᵀA + λI + μ·D₂ᵀD₂) x = Aᵀb, 高斯消元
//   2. RLS 模式: 对角协方差递推最小二乘, 遗忘因子 λ_forget
//
// 【参数分类】
//   物理确定: W=πR, δ=x/W×180°, φ=αC±δ
//   标定参数: W (膜宽), τ (运输延迟)
//   经验参数: processFactor=1, λ=1e-4, μ=0.1
//   在线辨识: θ(t) — 上旋角
// ============================================================

// ---- 导出类型 ----

export type MeasurementTriple = {
  upperAngleDeg: number
  scannerPosMm: number
  thickness: number
}

export type BubbleReconstructionOptions = {
  /** 角度分箱数 N (默认 360, 1°/bin) */
  numBins?: number
  /** L2 正则化系数 (默认 1e-4) */
  lambda?: number
  /** 二阶差分平滑系数 (Tikhonov D₂, 默认 0.1) */
  mu?: number
  /** 工艺变形因子 (默认 1) */
  processDeformationFactor?: number
  /** RLS 遗忘因子 λ ∈ (0,1] (默认 0.995) */
  forgettingFactor?: number
  /** RLS 二阶差分平滑系数 (默认 0.1, 每 200 步应用) */
  smoothMu?: number
  /** 求解模式 (默认 'batch') */
  solverMode?: 'batch' | 'rls'
}

export type BubbleReconstructionResult = {
  profile: number[]
  numBins: number
  binWidthDeg: number
  rmsError: number
  maxError: number
  numMeasurements: number
  binCoverage: number[]
  predictedThickness?: number[]
}

// ---- 内部工具 ----

const ZERO = 1e-14

const normalizeAngle = (deg: number): number => {
  const a = ((deg % 360) + 360) % 360
  return a >= 360 ? 0 : a
}

interface PhiPair {
  phi1Deg: number
  phi2Deg: number
  deltaDeg: number
  alphaCenterDeg: number
}

/** φ₁ = αC+δ, φ₂ = αC−δ, αC = θ+90°, δ = (x/W)×180° */
const computePhiPair = (
  upperAngleDeg: number,
  scannerPosMm: number,
  membraneWidthMm: number
): PhiPair => {
  const deltaDeg = (scannerPosMm / membraneWidthMm) * 180
  const alphaCenterDeg = normalizeAngle(upperAngleDeg + 90)
  const phi1Deg = normalizeAngle(alphaCenterDeg + deltaDeg)
  const phi2Deg = normalizeAngle(alphaCenterDeg - deltaDeg)
  return { phi1Deg, phi2Deg, deltaDeg, alphaCenterDeg }
}

// ---- CSR 稀疏矩阵 ----

interface SparseSystem {
  M: number
  N: number
  rowPtr: Int32Array
  colInd: Int32Array
  values: Float64Array
  b: Float64Array
  rawThickness: Float64Array
}

/** 从测量三元组构建 CSR 稀疏线性系统 A·x = b, b[k] = T_k / processFactor */
const buildSparseSystem = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number
): SparseSystem => {
  const M = measurements.length
  const N = numBins
  const binWidth = 360 / N

  const rows: Array<Map<number, number>> = []
  const b = new Float64Array(M)
  const rawThickness = new Float64Array(M)

  for (let k = 0; k < M; k++) {
    const { upperAngleDeg, scannerPosMm, thickness } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    const row = new Map<number, number>()
    const addPair = (phiDeg: number) => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      row.set(lo, (row.get(lo) ?? 0) + (1 - w))
      row.set(hi, (row.get(hi) ?? 0) + w)
    }
    addPair(phi1Deg)
    addPair(phi2Deg)

    rows.push(row)
    b[k] = thickness / processDeformationFactor
    rawThickness[k] = thickness
  }

  let nnz = 0
  for (const row of rows) nnz += row.size

  const rowPtr = new Int32Array(M + 1)
  const colInd = new Int32Array(nnz)
  const values = new Float64Array(nnz)

  let offset = 0
  for (let k = 0; k < M; k++) {
    rowPtr[k] = offset
    for (const [col, val] of rows[k]) {
      colInd[offset] = col
      values[offset] = val
      offset++
    }
  }
  rowPtr[M] = offset

  return { M, N, rowPtr, colInd, values, b, rawThickness }
}

// ---- 前向预测 (µm 空间) ----

const predictAll = (
  profile: number[],
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  processDeformationFactor: number
): number[] => {
  const N = profile.length
  const binWidth = 360 / N
  const predicted = new Array<number>(measurements.length)

  for (let k = 0; k < measurements.length; k++) {
    const { upperAngleDeg, scannerPosMm } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)

    const interp = (phiDeg: number): number => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      return profile[lo] * (1 - w) + profile[hi] * w
    }
    predicted[k] = (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor
  }

  return predicted
}

// ---- Batch 求解: (AᵀA + λI + μ·D₂ᵀD₂) x = Aᵀb ----

const solveBatch = (sparse: SparseSystem, lambda: number, mu: number): number[] => {
  const { M, N, rowPtr, colInd, values, b } = sparse

  const ATA: Float64Array[] = Array.from({ length: N }, () => new Float64Array(N))
  const ATb = new Float64Array(N)

  for (let k = 0; k < M; k++) {
    const start = rowPtr[k]
    const end = rowPtr[k + 1]
    for (let p = start; p < end; p++) {
      const colP = colInd[p]
      const valP = values[p]
      ATb[colP] += valP * b[k]
      for (let q = p; q < end; q++) {
        ATA[colP][colInd[q]] += valP * values[q]
      }
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) ATA[j][i] = ATA[i][j]
  }

  for (let i = 0; i < N; i++) ATA[i][i] += lambda

  if (mu > ZERO) {
    for (let i = 0; i < N; i++) {
      ATA[i][i] += mu * 6
      ATA[i][(i + 1) % N] += mu * -4
      ATA[i][(i - 1 + N) % N] += mu * -4
      ATA[i][(i + 2) % N] += mu * 1
      ATA[i][(i - 2 + N) % N] += mu * 1
    }
  }

  const aug: Float64Array[] = Array.from({ length: N }, (_, i) => {
    const row = new Float64Array(N + 1)
    row.set(ATA[i])
    row[N] = ATb[i]
    return row
  })

  for (let col = 0; col < N; col++) {
    let maxRow = col, maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < N; row++) {
      const v = Math.abs(aug[row][col])
      if (v > maxVal) { maxVal = v; maxRow = row }
    }
    if (maxVal < ZERO) continue
    if (maxRow !== col) { const t = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = t }
    const pivot = aug[col][col]
    for (let row = col + 1; row < N; row++) {
      const fac = aug[row][col] / pivot
      for (let c = col; c <= N; c++) aug[row][c] -= fac * aug[col][c]
    }
  }

  const x = new Array<number>(N).fill(0)
  for (let i = N - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < ZERO) continue
    let sum = aug[i][N]
    for (let j = i + 1; j < N; j++) sum -= aug[i][j] * x[j]
    x[i] = sum / aug[i][i]
  }
  return x
}

// ---- RLS 在线求解 (对角协方差) ----

const solveRLS = (
  sparse: SparseSystem,
  forgettingFactor: number,
  smoothMu: number,
  nominal: number = 50
): number[] => {
  const { M, N, rowPtr, colInd, values, b } = sparse
  const B = new Float64Array(N)
  for (let i = 0; i < N; i++) B[i] = nominal

  const invStep = new Float64Array(N)
  for (let i = 0; i < N; i++) invStep[i] = 1e-2

  for (let k = 0; k < M; k++) {
    const start = rowPtr[k], end = rowPtr[k + 1]

    let predicted = 0
    for (let p = start; p < end; p++) predicted += values[p] * B[colInd[p]]
    const e = b[k] - predicted

    for (let p = start; p < end; p++) {
      const col = colInd[p], a = values[p]
      invStep[col] = forgettingFactor * invStep[col] + a * a
      B[col] += (1 / Math.max(1e-10, invStep[col])) * a * e
    }

    if (smoothMu > ZERO && (k + 1) % 200 === 0) {
      const s = new Float64Array(N)
      for (let i = 0; i < N; i++) {
        const lap =
          1 * B[(i - 2 + N) % N] + -4 * B[(i - 1 + N) % N] + 6 * B[i] +
          -4 * B[(i + 1) % N] + 1 * B[(i + 2) % N]
        s[i] = B[i] - smoothMu * 0.03 * lap
      }
      for (let i = 0; i < N; i++) B[i] = s[i]
    }
  }
  return Array.from(B)
}

// ---- bin 覆盖统计 ----

const computeBinCoverage = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] => {
  const binWidth = 360 / numBins
  const coverage = new Array<number>(numBins).fill(0)
  for (const { upperAngleDeg, scannerPosMm } of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(upperAngleDeg, scannerPosMm, membraneWidthMm)
    coverage[Math.floor(phi1Deg / binWidth) % numBins] += 0.5
    coverage[Math.floor(phi2Deg / binWidth) % numBins] += 0.5
  }
  return coverage
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 给定重建后的 profile B[N], 预测单个测量点的双层厚度 (µm)
 *
 * T_k = processFactor × (B(φ₁) + B(φ₂))
 * φ₁ = upperAngle + 90° + δ,  φ₂ = upperAngle + 90° − δ
 * δ  = (scannerPos / membraneWidth) × 180°
 */
export const predictMeasuredThickness = (
  profile: number[],
  measurement: MeasurementTriple,
  membraneWidthMm: number,
  processDeformationFactor: number = 1
): number => {
  const numBins = profile.length
  const binWidth = 360 / numBins
  const { phi1Deg, phi2Deg } = computePhiPair(
    measurement.upperAngleDeg, measurement.scannerPosMm, membraneWidthMm
  )
  const interp = (phiDeg: number): number => {
    const idx = phiDeg / binWidth
    const lo = Math.floor(idx) % numBins
    const hi = (lo + 1) % numBins
    const w = idx - Math.floor(idx)
    return profile[lo] * (1 - w) + profile[hi] * w
  }
  return (interp(phi1Deg) + interp(phi2Deg)) * processDeformationFactor
}

/**
 * 从双层测厚数据重建膜泡圆周厚度分布 B(φ)
 *
 * 正模型:
 *   T_k = processFactor × (B(φ₁_k) + B(φ₂_k))
 *   φ₁_k = upperAngle_k + 90° + δ_k   (前层)
 *   φ₂_k = upperAngle_k + 90° − δ_k   (后层)
 *   δ_k  = scannerPos_k / membraneWidth × 180°
 *
 * 关键性质:
 *   φ₁ − φ₂ = 2δ, 仅在边缘 (δ=±90°) 时差 180°
 *   扫描仪覆盖不同 x 打破 φ₁=φ₂ 简并 → 系统满秩
 *
 * @param measurements   (upperAngleDeg, scannerPosMm, thickness)
 * @param membraneWidthMm 膜宽 W (mm)
 */
export const reconstructBubbleThickness = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): BubbleReconstructionResult => {
  const numBins = options?.numBins ?? 360
  const lambda = options?.lambda ?? 1e-4
  const mu = options?.mu ?? 0.1
  const processFactor = options?.processDeformationFactor ?? 1
  const forgettingFactor = options?.forgettingFactor ?? 0.995
  const smoothMu = options?.smoothMu ?? 0.1
  const solverMode = options?.solverMode ?? 'batch'
  const binWidthDeg = 360 / numBins

  if (measurements.length < numBins * 2) {
    console.warn(
      `[BubbleReconstruction] 测量数 ${measurements.length} < 2×N=${numBins * 2}, 解可能不稳定`
    )
  }

  const sparse = buildSparseSystem(measurements, membraneWidthMm, numBins, processFactor)

  const rawProfile =
    solverMode === 'rls'
      ? solveRLS(sparse, forgettingFactor, smoothMu)
      : solveBatch(sparse, lambda, mu)

  const profile = rawProfile.map((v) => (v > 0 ? v : 0))

  const predicted = predictAll(profile, measurements, membraneWidthMm, processFactor)

  let sumSq = 0, maxErr = 0
  for (let k = 0; k < measurements.length; k++) {
    const err = Math.abs(measurements[k].thickness - predicted[k])
    sumSq += err * err
    if (err > maxErr) maxErr = err
  }

  return {
    profile,
    numBins,
    binWidthDeg,
    rmsError: Math.sqrt(sumSq / measurements.length),
    maxError: maxErr,
    numMeasurements: measurements.length,
    binCoverage: computeBinCoverage(measurements, membraneWidthMm, numBins),
    predictedThickness: predicted,
  }
}
