import type { ThicknessData } from '../connections/thickness/types'
/**
 * 膜泡原始厚度重建算法（Phase 1）
 *
 * 正模型：测厚仪读数是双层膜之和
 *   T_k = f(α_k) + f((α_k + 180) mod 360)
 *   其中 α_k = upperAngle_k + (scannerPos_k / membraneWidth) × 180°
 *
 * 反模型：收集足够多的 (α, T) 对，构建 N 元线性方程组求解 f(θ)
 *   → 稀疏线性系统 A·x = b，最小二乘求解
 *
 * 输入：
 *   measurements: (upperAngle, scannerPos, thickness) 三元组
 *   membraneWidthMm: 膜宽（mm），由扫描仪行程标定
 *   options.numBins: 角度分箱数（默认 = channelCount 对应的 N）
 *   options.lambda: L2 正则化系数（默认 1e-4）
 *   options.mu: 二阶差分平滑正则系数（默认 0.1，mu=0 关闭）
 *
 * 输出：
 *   profile[i]: 膜泡第 i 个分箱处的单层厚度（µm）
 */

export type MeasurementTriple = {
  upperAngleDeg: number
  scannerPosMm: number
  thickness: number
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
  binTimestamps?: number[] // 每个 bin center 对应的采集时间戳 (ms)
}

const normalizeAngle = (deg: number): number => {
  let a = deg - Math.floor(deg / 360) * 360
  if (a >= 360) a -= 360
  if (a < 0) a += 360
  return a
}

/**
 * 构建正向模型矩阵
 * 每个测量产生一行：T_k = w_α·f(bin_α) + w_α'·f(bin_α+1) + w_β·f(bin_β) + w_β'·f(bin_β'+1)
 * 使用线性插值，每行最多 4 个非零元素
 */
const buildLinearSystem = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number,
  processDeformationFactor: number
): { A: number[][]; b: number[] } => {
  const M = measurements.length
  const N = numBins
  const binWidth = 360 / N

  const A: number[][] = Array.from({ length: M }, () => new Array(N).fill(0))
  const b: number[] = new Array(M).fill(0)

  for (let k = 0; k < M; k++) {
    const { upperAngleDeg, scannerPosMm, thickness } = measurements[k]

    const scannerOffset = (scannerPosMm / membraneWidthMm) * 180
    const alpha = normalizeAngle(upperAngleDeg + scannerOffset)
    const beta = normalizeAngle(alpha + 180)

    const alphaIdx = alpha / binWidth
    const betaIdx = beta / binWidth

    const alphaLo = Math.floor(alphaIdx) % N
    const alphaHi = (alphaLo + 1) % N
    const betaLo = Math.floor(betaIdx) % N
    const betaHi = (betaLo + 1) % N

    const alphaWeight = alphaIdx - Math.floor(alphaIdx)
    const betaWeight = betaIdx - Math.floor(betaIdx)

    A[k][alphaLo] += 1 - alphaWeight
    A[k][alphaHi] += alphaWeight
    A[k][betaLo] += 1 - betaWeight
    A[k][betaHi] += betaWeight

    b[k] = thickness / processDeformationFactor
  }

  return { A, b }
}

/**
 * 给定重建后的单层厚度 profile，预测单个测量点的双层厚度 T_k
 *
 * 物理模型：
 *   α_k = upperAngle_k + (scannerPos_k / membraneWidth) × 180°
 *   T_k = processDeformationFactor × (f(α_k) + f(α_k + 180°))
 *
 * 使用与 `buildLinearSystem` 一致的双线性插值，保证预测与内部残差计算一致。
 *
 * @param profile 重建出的 N 维单层厚度数组（已含非负投影）
 * @param measurement 单个测量三元组
 * @param membraneWidthMm 膜宽（mm）
 * @param processDeformationFactor 工艺变形因子（默认 1.02）
 * @returns 预测的双层厚度
 */
export const predictMeasuredThickness = (
  profile: number[],
  measurement: MeasurementTriple,
  membraneWidthMm: number,
  processDeformationFactor: number = 1.02
): number => {
  const numBins = profile.length
  const binWidth = 360 / numBins
  const alpha = normalizeAngle(
    measurement.upperAngleDeg + (measurement.scannerPosMm / membraneWidthMm) * 180
  )
  const beta = normalizeAngle(alpha + 180)

  const alphaIdx = alpha / binWidth
  const betaIdx = beta / binWidth
  const alphaLo = Math.floor(alphaIdx) % numBins
  const alphaHi = (alphaLo + 1) % numBins
  const betaLo = Math.floor(betaIdx) % numBins
  const betaHi = (betaLo + 1) % numBins
  const alphaWeight = alphaIdx - Math.floor(alphaIdx)
  const betaWeight = betaIdx - Math.floor(betaIdx)

  const fAlpha =
    profile[alphaLo] * (1 - alphaWeight) + profile[alphaHi] * alphaWeight
  const fBeta =
    profile[betaLo] * (1 - betaWeight) + profile[betaHi] * betaWeight

  return (fAlpha + fBeta) * processDeformationFactor
}

/**
 * 求解稀疏线性系统最小二乘 (A^T A + λI + μ·D^T D) x = A^T b
 *
 * - λI: L2 正则化，保证数值稳定
 * - μ·D^T D: 圆周方向二阶差分平滑，D 是循环三对角差分算子
 *   D[i][i-1]=1, D[i][i]=-2, D[i][i+1]=1 (mod N)
 *   D^T D 是循环五对角，模式 [1, -4, 6, -4, 1]
 *   对均匀 profile 零贡献，对相邻 bin 突变（高频噪声）强惩罚
 *
 * 使用高斯消元（部分主元选取）
 */
const solveNormalEquations = (
  A: number[][],
  b: number[],
  lambda: number,
  mu: number
): number[] => {
  const M = A.length
  const N = A[0].length

  const ATA: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  const ATb: number[] = new Array(N).fill(0)

  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let sum = 0
      for (let k = 0; k < M; k++) {
        sum += A[k][i] * A[k][j]
      }
      ATA[i][j] = sum
      ATA[j][i] = sum
    }
    let sumB = 0
    for (let k = 0; k < M; k++) {
      sumB += A[k][i] * b[k]
    }
    ATb[i] = sumB
  }

  for (let i = 0; i < N; i++) {
    ATA[i][i] += lambda
  }

  // 二阶差分平滑：D^T D 循环五对角 [1, -4, 6, -4, 1]
  if (mu > 0) {
    for (let i = 0; i < N; i++) {
      ATA[i][i] += mu * 6
      const i1 = (i + 1) % N
      const im1 = (i - 1 + N) % N
      const i2 = (i + 2) % N
      const im2 = (i - 2 + N) % N
      ATA[i][i1] += mu * -4
      ATA[i][im1] += mu * -4
      ATA[i][i2] += mu * 1
      ATA[i][im2] += mu * 1
    }
  }

  const aug: number[][] = Array.from({ length: N }, (_, i) => [
    ...ATA[i],
    ATb[i],
  ])

  for (let col = 0; col < N; col++) {
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < N; row++) {
      const v = Math.abs(aug[row][col])
      if (v > maxVal) {
        maxVal = v
        maxRow = row
      }
    }
    if (maxVal < 1e-14) continue
    if (maxRow !== col) {
      const tmp = aug[col]
      aug[col] = aug[maxRow]
      aug[maxRow] = tmp
    }
    const pivot = aug[col][col]
    for (let row = col + 1; row < N; row++) {
      const factor = aug[row][col] / pivot
      for (let c = col; c <= N; c++) {
        aug[row][c] -= factor * aug[col][c]
      }
    }
  }

  const x = new Array(N).fill(0)
  for (let i = N - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-14) continue
    let sum = aug[i][N]
    for (let j = i + 1; j < N; j++) {
      sum -= aug[i][j] * x[j]
    }
    x[i] = sum / aug[i][i]
  }

  return x
}

/** 统计每个分箱被测量覆盖的次数 */
const computeBinCoverage = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  numBins: number
): number[] => {
  const binWidth = 360 / numBins
  const coverage = new Array(numBins).fill(0)

  for (const { upperAngleDeg, scannerPosMm } of measurements) {
    const alpha = normalizeAngle(
      upperAngleDeg + (scannerPosMm / membraneWidthMm) * 180
    )
    const beta = normalizeAngle(alpha + 180)
    coverage[Math.floor(alpha / binWidth) % numBins] += 0.5
    coverage[Math.floor(beta / binWidth) % numBins] += 0.5
  }

  return coverage
}

/**
 * 从双层测厚数据重建膜泡圆周厚度分布
 *
 * 工作原理：
 * 1. 每次测量 T_k = f(α_k) + f(α_k+180°) 是膜泡上两个相距 180° 位置的单层厚度之和
 * 2. 随着上旋旋转和扫描仪扫描，α_k 在 [0, 360°] 全范围变化
 * 3. 收集大量不同 α 值的测量后，N 元线性系统变为满秩，可唯一求解
 * 4. 最小二乘求解 f(θ) 的离散值（N 个角度分箱）
 *
 * 约束：
 * - 测量必须覆盖 α 的全范围（上旋行程越完整越好）
 * - 扫描仪位置变化提供 α 的多样性（单一 scannerPos 下系统欠定）
 * - 建议 numBins ≤ 测量数 / 5 以保证稳定求解
 */
export const reconstructBubbleThickness = (
  measurements: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): BubbleReconstructionResult => {
  const numBins = options?.numBins ?? 48
  const lambda = options?.lambda ?? 1e-4
  const mu = options?.mu ?? 0.1
  const processFactor = options?.processDeformationFactor ?? 1.02
  const binWidthDeg = 360 / numBins

  if (measurements.length < numBins * 2) {
    console.warn(
      `[BubbleReconstruction] 测量数 ${measurements.length} 少于 2×N=${numBins * 2}，` +
        `解可能不稳定`
    )
  }

  const { A, b } = buildLinearSystem(
    measurements,
    membraneWidthMm,
    numBins,
    processFactor
  )
  const rawProfile = solveNormalEquations(A, b, lambda, mu)

  // 业务级非负投影：f(θ) 是单层膜厚，物理上不能为负
  // L2 正则化不保证非负解（正定矩阵的逆可以有负元素），病态数据下原始解
  // 可能用负值 bin 去"补偿"其他 bin 的偏差——物理上无意义
  // 这里做一次非负投影 + 基于投影后的 profile 重算残差，残差才是诚实的
  const profile: number[] = rawProfile.map((v) => (v > 0 ? v : 0))

  const residuals: number[] = new Array(measurements.length).fill(0)
  let sumSq = 0
  let maxErr = 0
  for (let k = 0; k < measurements.length; k++) {
    let predicted = 0
    for (let j = 0; j < numBins; j++) {
      predicted += A[k][j] * profile[j]
    }
    const err = Math.abs(b[k] - predicted)
    residuals[k] = err
    sumSq += err * err
    if (err > maxErr) maxErr = err
  }

  const rmsError = Math.sqrt(sumSq / measurements.length)
  const binCoverage = computeBinCoverage(
    measurements,
    membraneWidthMm,
    numBins
  )

  return {
    profile,
    numBins,
    binWidthDeg,
    rmsError,
    maxError: maxErr,
    numMeasurements: measurements.length,
    binCoverage,
  }
}

/**
 * 从实际采集数据构建测量三元组
 *
 * 将 ADBox 推送的 (timestamp, ProbeValue, HorizontalPulse) 与上旋方向信号
 * 结合，推算每个测量点的上旋角度和扫描仪位置。
 *
 * @param thicknessData 测厚数据列表
 * @param upperAngleDeg 每个测量点对应的上旋角度（由上层计算传入）
 * @param horizontalPulseToMm 脉冲到毫米转换系数
 * @param scannerCenterPulse 扫描仪中心位置脉冲值
 */
export const buildMeasurementTriples = (
  thicknessData: ThicknessData[],
  upperAngleDeg: number[],
  horizontalPulseToMm: number,
  scannerCenterPulse: number
): MeasurementTriple[] => {
  const triples: MeasurementTriple[] = []

  for (let i = 0; i < thicknessData.length; i++) {
    const td = thicknessData[i]
    if (td.ProbeValue == null || !Number.isFinite(td.ProbeValue)) continue
    if (td.HorizontalPulse == null) continue
    if (td.ProbeValue <= 0) continue

    triples.push({
      upperAngleDeg: upperAngleDeg[i],
      scannerPosMm: (td.HorizontalPulse - scannerCenterPulse) * horizontalPulseToMm,
      thickness: td.ProbeValue,
    })
  }

  return triples
}

import type { TripSegment } from '../types'
import { trapezoidalPosition } from './upperRotation/upperRotation.evaluation'

/**
 * 从 TripSegment 数组提取测量三元组，用于真实数据重建。
 *
 * 利用上旋算法的梯形速度曲线将每段行程内的相对时间 t 映射到上旋角度，
 * 并利用 pulse 值换算出扫描仪位置（mm）。
 *
 * @param tripSegments 上旋行程片段（由 buildTripSegment 生成）
 * @param thetaMaxDeg  最大旋转角度（由 estimateThetaMaxWithPhaseCorrection 估计）
 * @param pulseToMm    脉冲到毫米的转换系数（如 0.1）
 * @param accelRatio   加速段占行程比例（默认与算法一致：duration*0.45 上限 20s）
 */
export const extractTriplesFromSegments = (
  tripSegments: TripSegment[],
  thetaMaxDeg: number,
  pulseToMm: number,
  accelRatio?: number
): MeasurementTriple[] => {
  const triples: MeasurementTriple[] = []

  for (const seg of tripSegments) {
    if (seg.duration <= 0 || seg.measurements.length === 0) continue

    const duration = seg.duration
    const ar =
      accelRatio ?? Math.min(20000, duration * 0.45) / duration

    for (const p of seg.measurements) {
      if (!Number.isFinite(p.y) || p.y <= 0) continue
      if (p.pulse === undefined || !Number.isFinite(p.pulse)) continue

      const progress = p.t / duration
      const pos = trapezoidalPosition(Math.max(0, Math.min(1, progress)), ar)

      const upperAngle = seg.isForward
        ? pos * thetaMaxDeg
        : thetaMaxDeg - pos * thetaMaxDeg

      triples.push({
        upperAngleDeg: upperAngle,
        scannerPosMm: p.pulse! * pulseToMm,
        thickness: p.y,
      })
    }
  }

  return triples
}
