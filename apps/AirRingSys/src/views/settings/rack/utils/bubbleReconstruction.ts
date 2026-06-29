/**
 * bubbleThicknessReconstruction — frontend port
 *
 * 与 packages/AirRingServer/algorithms/bubbleThicknessReconstruction.ts 等价。
 * 输入一组 (θ, x, T) 三元组,求解 360 bin 圆周厚度 B(φ)。
 *
 * Forward model:
 *   T_k = η × (B(φ₁_k) + B(φ₂_k))
 *   φ₁ = αC + δ,  φ₂ = αC − δ
 *   αC = θ + 90°, δ = (x / W) × 180°
 *
 * 求解: (AᵀA + λI + μ·D₂ᵀD₂) x = Aᵀb (Gaussian elimination)
 */

export type MeasurementTriple = {
  upperAngleDeg: number
  scannerPosMm: number
  thickness: number
  /** 测量时间戳 (ms),用于计算 per-bin 平均时间 */
  timestamp: number
}

export type BubbleReconstructionOptions = {
  numBins?: number
  lambda?: number
  mu?: number
  processDeformationFactor?: number
}

export type BubbleReconstructionResult = {
  profile: number[]
  numBins: number
  binWidthDeg: number
  rmsError: number
  maxError: number
  numMeasurements: number
  binCoverage: number[]
  /** 每个 bin 的贡献样本的平均时间戳 (ms);无贡献的 bin 为 0 */
  binTimestamps: number[]
  /** 每个 bin 的代表样本反解 — 真正压合该 bin 的 (φ₁, φ₂, B₁, B₂, T_pred, T_meas, ts) */
  binDecompositions: BinDecomposition[]
  predictedThickness?: number[]
}

/** 单个 bin 的代表样本反解 — 用于 tooltip */
export interface BinDecomposition {
  ts: number
  phi1: number
  phi2: number
  b1: number
  b2: number
  tMeasured: number
  tPredicted: number
}

const ZERO = 1e-14

function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360
  return a >= 360 ? 0 : a
}

interface PhiPair {
  phi1Deg: number
  phi2Deg: number
}

function computePhiPair(
  upperAngleDeg: number,
  scannerPosMm: number,
  membraneWidthMm: number
): PhiPair {
  const deltaDeg = (scannerPosMm / membraneWidthMm) * 180
  const alphaCenterDeg = normalizeAngle(upperAngleDeg + 90)
  return {
    phi1Deg: normalizeAngle(alphaCenterDeg + deltaDeg),
    phi2Deg: normalizeAngle(alphaCenterDeg - deltaDeg),
  }
}

interface SparseSystem {
  M: number
  N: number
  rowPtr: Int32Array
  colInd: Int32Array
  values: Float64Array
  b: Float64Array
  rawThickness: Float64Array
}

function buildSparseSystem(
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number
): SparseSystem {
  const M = measurements.length
  const N = numBins
  const binWidth = 360 / N

  const rows: Map<number, number>[] = []
  const b = new Float64Array(M)
  const rawThickness = new Float64Array(M)

  for (let k = 0; k < M; k++) {
    const { upperAngleDeg, scannerPosMm, thickness } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )

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

function predictAll(
  profile: number[],
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  processDeformationFactor: number
): number[] {
  const N = profile.length
  const binWidth = 360 / N
  const predicted: number[] = new Array(measurements.length)

  const interp = (phiDeg: number, prof: number[]): number => {
    const idx = phiDeg / binWidth
    const lo = Math.floor(idx) % N
    const hi = (lo + 1) % N
    const w = idx - Math.floor(idx)
    return prof[lo] * (1 - w) + prof[hi] * w
  }

  for (let k = 0; k < measurements.length; k++) {
    const { upperAngleDeg, scannerPosMm } = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )
    predicted[k] = (interp(phi1Deg, profile) + interp(phi2Deg, profile)) * processDeformationFactor
  }
  return predicted
}

function solveBatch(sparse: SparseSystem, lambda: number, mu: number): number[] {
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
    let maxRow = col,
      maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < N; row++) {
      const v = Math.abs(aug[row][col])
      if (v > maxVal) {
        maxVal = v
        maxRow = row
      }
    }
    if (maxVal < ZERO) continue
    if (maxRow !== col) {
      const t = aug[col]
      aug[col] = aug[maxRow]
      aug[maxRow] = t
    }
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

function computeBinCoverage(
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] {
  const binWidth = 360 / numBins
  const coverage = new Array<number>(numBins).fill(0)
  for (const { upperAngleDeg, scannerPosMm } of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )
    coverage[Math.floor(phi1Deg / binWidth) % numBins] += 0.5
    coverage[Math.floor(phi2Deg / binWidth) % numBins] += 0.5
  }
  return coverage
}

/**
 * per-bin 平均时间戳: 对 bin 有贡献的样本 ts 按插值权重加权平均
 * 用于 tooltip 显示"该 bin 对应的测厚时间"
 */
function computeBinTimestamps(
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] {
  const N = numBins
  const binWidth = 360 / N
  const sums = new Float64Array(N)
  const counts = new Float64Array(N)
  for (const { upperAngleDeg, scannerPosMm, timestamp } of measurements) {
    const { phi1Deg, phi2Deg } = computePhiPair(
      upperAngleDeg,
      scannerPosMm,
      membraneWidthMm
    )
    const addPair = (phiDeg: number) => {
      const idx = phiDeg / binWidth
      const lo = Math.floor(idx) % N
      const hi = (lo + 1) % N
      const w = idx - Math.floor(idx)
      sums[lo] += timestamp * (1 - w)
      counts[lo] += 1 - w
      sums[hi] += timestamp * w
      counts[hi] += w
    }
    addPair(phi1Deg)
    addPair(phi2Deg)
  }
  const result = new Array<number>(N)
  for (let i = 0; i < N; i++) {
    result[i] = counts[i] > 0 ? sums[i] / counts[i] : 0
  }
  return result
}

/** 角度距离 (0~180°) */
function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

/** profile 上做角度插值 */
function interpolateB(profile: number[], phiDeg: number): number {
  const N = profile.length
  if (N === 0) return 0
  const binWidth = 360 / N
  const a = ((phiDeg % 360) + 360) % 360
  const idx = a / binWidth
  const lo = Math.floor(idx) % N
  const hi = (lo + 1) % N
  const w = idx - Math.floor(idx)
  return profile[lo] * (1 - w) + profile[hi] * w
}

/**
 * 每个 bin 找代表样本 (按 min(|φ₁-bin|, |φ₂-bin|) 最近)
 * 返回该样本的完整反解: (ts, φ₁, φ₂, B[φ₁], B[φ₂], T_pred, T_meas)
 *
 * 关键: φ₁, φ₂ 来自具体样本的 (θ, x), 不一定是 180° 关系;
 *       真正压合 = η·(B[φ₁] + B[φ₂]), 应当贴近 T_meas
 */
function buildBinDecompositions(
  measurements: MeasurementTriple[],
  profile: number[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number
): BinDecomposition[] {
  const N = numBins
  const binWidth = 360 / N
  const empty: BinDecomposition = {
    ts: 0, phi1: 0, phi2: 0, b1: 0, b2: 0,
    tMeasured: 0, tPredicted: 0,
  }
  if (measurements.length === 0) {
    return new Array<BinDecomposition>(N).fill(empty)
  }

  // 预计算每个样本的 (φ₁, φ₂, B[φ₁], B[φ₂], T_pred, T_meas)
  type PerM = {
    ts: number
    phi1: number
    phi2: number
    b1: number
    b2: number
    tMeasured: number
    tPredicted: number
  }
  const perM: PerM[] = new Array(measurements.length)
  for (let k = 0; k < measurements.length; k++) {
    const m = measurements[k]
    const { phi1Deg, phi2Deg } = computePhiPair(
      m.upperAngleDeg,
      m.scannerPosMm,
      membraneWidthMm
    )
    const b1 = interpolateB(profile, phi1Deg)
    const b2 = interpolateB(profile, phi2Deg)
    perM[k] = {
      ts: m.timestamp,
      phi1: phi1Deg,
      phi2: phi2Deg,
      b1,
      b2,
      tMeasured: m.thickness,
      tPredicted: processDeformationFactor * (b1 + b2),
    }
  }

  // 对每个 bin 找最近样本
  const result: BinDecomposition[] = new Array(N)
  for (let i = 0; i < N; i++) {
    const binAngle = i * binWidth + binWidth / 2
    let bestIdx = 0
    let bestDist = Infinity
    for (let k = 0; k < perM.length; k++) {
      const d1 = angularDistance(perM[k].phi1, binAngle)
      const d2 = angularDistance(perM[k].phi2, binAngle)
      const d = d1 < d2 ? d1 : d2
      if (d < bestDist) {
        bestDist = d
        bestIdx = k
      }
    }
    result[i] = perM[bestIdx]
  }
  return result
}

/**
 * 主入口:从 (θ, x, T) 三元组重建 B(φ)
 */
export function reconstructBubbleThickness(
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): BubbleReconstructionResult {
  const numBins = options?.numBins ?? 360
  const lambda = options?.lambda ?? 1e-4
  const mu = options?.mu ?? 0.1
  const processFactor = options?.processDeformationFactor ?? 1.02
  const binWidthDeg = 360 / numBins

  if (measurements.length < numBins * 2) {
    console.warn(
      `[bubbleReconstruction] 测量数 ${measurements.length} < 2×N=${numBins * 2}, 解可能不稳定`
    )
  }

  const sparse = buildSparseSystem(
    measurements,
    membraneWidthMm,
    numBins,
    processFactor
  )
  const rawProfile = solveBatch(sparse, lambda, mu)
  const profile = rawProfile.map((v) => (v > 0 ? v : 0))

  const predicted = predictAll(
    profile,
    measurements,
    membraneWidthMm,
    processFactor
  )

  let sumSq = 0,
    maxErr = 0
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
    binTimestamps: computeBinTimestamps(measurements, membraneWidthMm, numBins),
    binDecompositions: buildBinDecompositions(
      measurements,
      profile,
      membraneWidthMm,
      numBins,
      processFactor
    ),
    predictedThickness: predicted,
  }
}

/**
 * 用已重建的 B(φ) 预测单个测量点的双层厚度
 */
export function predictMeasuredThickness(
  profile: number[],
  measurement: MeasurementTriple,
  membraneWidthMm: number,
  processDeformationFactor: number = 1.02
): number {
  const numBins = profile.length
  const binWidth = 360 / numBins
  const { phi1Deg, phi2Deg } = computePhiPair(
    measurement.upperAngleDeg,
    measurement.scannerPosMm,
    membraneWidthMm
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
