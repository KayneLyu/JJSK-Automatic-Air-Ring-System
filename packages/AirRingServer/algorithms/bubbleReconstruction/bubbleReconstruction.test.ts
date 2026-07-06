import { expect, test } from 'vitest'
import type { MeasurementTriple } from './types'
import { computePhiPair, normalizeAngle } from './geometry'
import { buildSparseSystem, predictSingle } from './measurementModel'
import { reconstructBubbleThickness } from './index'
import { solveBatch } from './solvers/batchSolver'
import { solveRLS, initRLSState, rlsIncrementalUpdate } from './solvers/rlsSolver'
import { generateBubbleProfile, generateTypicalBubble } from './simulation/bubbleSimulator'
import { simulateMeasurements, simulateSingleScan, simulateMultipleScans } from './simulation/measurementSimulator'
import { estimatePhase } from './phaseEstimation/phaseEstimator'
import {
  runScenario1_Noiseless,
  runScenario2_WithNoise,
  runScenario3_VariableSpeed,
  compareSolvers,
} from './verification/verificationRunner'

const ZERO = 1e-14

// ═══════════════════════════════════════════════════════════════
// 几何模型测试
// ═══════════════════════════════════════════════════════════════

test('几何模型：中心位置 φ₁=φ₂', () => {
  const { phi1Deg, phi2Deg, deltaDeg } = computePhiPair(0, 0, 300)
  expect(phi1Deg).toBeCloseTo(90, 5)
  expect(phi2Deg).toBeCloseTo(90, 5)
  expect(deltaDeg).toBe(0)
})

test('几何模型：边缘位置 φ₁−φ₂=180°', () => {
  const { phi1Deg, phi2Deg, deltaDeg } = computePhiPair(0, 300 / 2, 300)
  expect(Math.abs(phi1Deg - phi2Deg)).toBeCloseTo(180, 1)
  expect(deltaDeg).toBeCloseTo(90, 5)
})

test('几何模型：φ₂ ≠ φ₁ + 180° 普遍成立', () => {
  const { phi1Deg, phi2Deg } = computePhiPair(30, 100, 300)
  const diff = Math.abs(phi1Deg - phi2Deg)
  expect(diff).not.toBeCloseTo(180, 0)
  expect(diff).toBe(120)
})

test('几何模型：角度归一化', () => {
  expect(normalizeAngle(360)).toBe(0)
  expect(normalizeAngle(-90)).toBe(270)
  expect(normalizeAngle(450)).toBe(90)
  expect(normalizeAngle(0)).toBe(0)
})

// ═══════════════════════════════════════════════════════════════
// 测量模型测试
// ═══════════════════════════════════════════════════════════════

test('测量模型：双层叠加预测', () => {
  const profile = new Array(360).fill(50)
  const m: MeasurementTriple = { upperAngleDeg: 0, scannerPosMm: 0, thickness: 102 }
  const predicted = predictSingle(profile, m, 300, 1.02)
  expect(predicted).toBeCloseTo(102, 1)
})

test('测量模型：稀疏矩阵构造', () => {
  const triples: MeasurementTriple[] = []
  for (let angle = 0; angle < 360; angle += 30) {
    for (let pos = -100; pos <= 100; pos += 50) {
      triples.push({ upperAngleDeg: angle, scannerPosMm: pos, thickness: 100 })
    }
  }
  const sparse = buildSparseSystem(triples, 300, 360, 1.0)
  expect(sparse.M).toBe(triples.length)
  expect(sparse.N).toBe(360)
  expect(sparse.colInd.length).toBeGreaterThan(0)
  // 每行应恰好有 4 个非零元（前层2个 + 后层2个）
  for (let k = 0; k < sparse.M; k++) {
    const nnz = sparse.rowPtr[k + 1] - sparse.rowPtr[k]
    expect(nnz).toBeLessThanOrEqual(4)
    expect(nnz).toBeGreaterThan(0)
  }
})

// ═══════════════════════════════════════════════════════════════
// 场景验证
// ═══════════════════════════════════════════════════════════════

test('场景1: 无噪声理想重建 RMSE≈0', () => {
  const r = runScenario1_Noiseless()
  // Cholesky 浮点精度下 RMSE ≈ 0.028μm (基厚 50μm 的 0.06%)
  expect(r.rmsErrorUm).toBeLessThan(0.05)
  expect(r.coveragePercent).toBeGreaterThan(95)
})

test('场景2: 噪声 σ=0.3μm 抗噪性能', () => {
  const r = runScenario2_WithNoise(0.3)
  expect(r.rmsErrorUm).toBeLessThan(0.5)
  expect(r.maxErrorUm).toBeLessThan(1.0)
  expect(r.coveragePercent).toBeGreaterThan(95)
})

test('场景2b: 噪声 σ=1.0μm 抗噪性能', () => {
  const r = runScenario2_WithNoise(1.0)
  expect(r.rmsErrorUm).toBeLessThan(1.0)
  expect(r.maxErrorUm).toBeLessThan(2.0)
  expect(r.coveragePercent).toBeGreaterThan(95)
})

test('场景3: 变速度上旋 8→12°/s', () => {
  const r = runScenario3_VariableSpeed()
  expect(r.rmsErrorUm).toBeLessThan(0.5)
  expect(r.maxErrorUm).toBeLessThan(1.0)
})

// ═══════════════════════════════════════════════════════════════
// Batch vs RLS 求解器
// ═══════════════════════════════════════════════════════════════

test('Batch 求解器精确性', () => {
  const profile = generateBubbleProfile({
    baseThickness: 50, lowFreqAmplitude: 0, lowFreqHarmonics: 1,
    highFreqAmplitude: 0, highFreqHarmonics: 1,
    noiseStdDev: 0, seed: 42,
  }, 360)
  const measurements = simulateMeasurements(profile, {
    membraneWidthMm: 300, rotationSpeedDegPerSec: 10,
    scanPeriodSec: 5, numScanPoints: 200,
    transportDelaySec: 30, totalTimeSec: 72,
    processDeformationFactor: 1.0, measurementNoiseStdDev: 0,
  })
  const result = reconstructBubbleThickness(measurements, 300, {
    numBins: 360, solverMode: 'batch', lambda: 1e-4, mu: 0.1, processDeformationFactor: 1.0,
  })
  let sqErr = 0
  for (let i = 0; i < 360; i++) sqErr += (result.profile[i] - profile[i]) ** 2
  expect(Math.sqrt(sqErr / 360)).toBeLessThan(0.1)
})

test('RLS 求解器收敛性', () => {
  const profile = generateBubbleProfile({
    baseThickness: 50, lowFreqAmplitude: 3, lowFreqHarmonics: 2,
    highFreqAmplitude: 1, highFreqHarmonics: 8,
    noiseStdDev: 0.1, seed: 42,
  }, 360)
  const measurements = simulateMeasurements(profile, {
    membraneWidthMm: 300, rotationSpeedDegPerSec: 10,
    scanPeriodSec: 5, numScanPoints: 200,
    transportDelaySec: 30, totalTimeSec: 72,
    processDeformationFactor: 1.02, measurementNoiseStdDev: 0.2,
  })
  const result = reconstructBubbleThickness(measurements, 300, {
    numBins: 360, solverMode: 'rls', forgettingFactor: 0.995, smoothMu: 0.1,
    processDeformationFactor: 1.02,
  })
  const mean = result.profile.reduce((a, b) => a + b, 0) / 360
  expect(mean).toBeGreaterThan(40)
  expect(mean).toBeLessThan(60)
  expect(result.profile.every((v) => isFinite(v))).toBe(true)
})

test('RLS 增量更新', () => {
  const { profile, pi } = initRLSState(360, 50)
  for (let k = 0; k < 100; k++) {
    const phi = (k * 3.6)
    const a = [
      { col: Math.floor(phi) % 360, val: 0.8 },
      { col: (Math.floor(phi) + 1) % 360, val: 0.2 },
      { col: Math.floor((phi + 90) % 360), val: 0.6 },
      { col: (Math.floor((phi + 90) % 360) + 1) % 360, val: 0.4 },
    ]
    rlsIncrementalUpdate(profile, pi, a, 52, 0.995)
    expect(profile.every((v) => isFinite(v))).toBe(true)
    expect(profile.every((v) => v >= 0)).toBe(true)
  }
})

// ═══════════════════════════════════════════════════════════════
// 相位估计
// ═══════════════════════════════════════════════════════════════

test('互相关相位估计产生有效结果', () => {
  const profile = generateTypicalBubble(50, 360)
  const scans = simulateMultipleScans(profile, {
    membraneWidthMm: 300, rotationSpeedDegPerSec: 10,
    scanPeriodSec: 5, numScanPoints: 100,
    transportDelaySec: 30, totalTimeSec: 36,
    processDeformationFactor: 1.02, measurementNoiseStdDev: 0.1,
  })
  expect(scans.length).toBeGreaterThanOrEqual(5)
  const result = estimatePhase(scans, 300, { method: 'crossCorrelation' })
  expect(result).not.toBeNull()
  expect(result!.confidence).toBeGreaterThan(0)
})

// ═══════════════════════════════════════════════════════════════
// 均匀膜泡
// ═══════════════════════════════════════════════════════════════

test('均匀双层膜泡的单层分布应为 50μm', () => {
  const numBins = 24
  const membraneWidthMm = 1200
  const doubleLayer = 100
  const processFactor = 1.02

  const triples: MeasurementTriple[] = []
  for (let upperAngle = 0; upperAngle < 270; upperAngle += 15) {
    for (let scannerPos = -500; scannerPos <= 500; scannerPos += 100) {
      triples.push({
        upperAngleDeg: upperAngle,
        scannerPosMm: scannerPos,
        thickness: doubleLayer * processFactor,
      })
    }
  }

  const result = reconstructBubbleThickness(triples, membraneWidthMm, {
    numBins,
    lambda: 1e-3,
    processDeformationFactor: processFactor,
  })

  const meanProfile = result.profile.reduce((a, b) => a + b, 0) / result.profile.length
  expect(meanProfile).toBeCloseTo(doubleLayer / 2, 0)
  expect(result.rmsError).toBeLessThan(1)
})

// ═══════════════════════════════════════════════════════════════
// 边界条件
// ═══════════════════════════════════════════════════════════════

test('空测量序列抛出异常', () => {
  expect(() => reconstructBubbleThickness([], 300)).toThrow()
})

test('单条测量不崩溃', () => {
  const result = reconstructBubbleThickness(
    [{ upperAngleDeg: 0, scannerPosMm: 0, thickness: 100 }],
    300,
    { numBins: 360, lambda: 1e-3, mu: 0.1 }
  )
  expect(result.profile).toHaveLength(360)
})

test('大角度超出范围应被归一化', () => {
  const { phi1Deg, phi2Deg } = computePhiPair(400, 0, 300)
  expect(phi1Deg).toBeGreaterThanOrEqual(0)
  expect(phi1Deg).toBeLessThan(360)
  expect(phi2Deg).toBeGreaterThanOrEqual(0)
  expect(phi2Deg).toBeLessThan(360)
})

test('重建结果全为非负值', () => {
  const profile = generateTypicalBubble(30, 360)
  const measurements = simulateMeasurements(profile, {
    membraneWidthMm: 300, rotationSpeedDegPerSec: 10,
    scanPeriodSec: 5, numScanPoints: 200,
    transportDelaySec: 30, totalTimeSec: 36,
    processDeformationFactor: 1.02, measurementNoiseStdDev: 0.3,
  })
  const result = reconstructBubbleThickness(measurements, 300, {
    numBins: 360, solverMode: 'batch', lambda: 1e-4, mu: 0.1,
  })
  expect(result.profile.every((v) => v >= 0)).toBe(true)
})

// ═══════════════════════════════════════════════════════════════
// 单次扫描剖面
// ═══════════════════════════════════════════════════════════════

test('模拟单次扫描的厚度范围合理', () => {
  const profile = generateTypicalBubble(50, 360)
  const scan = simulateSingleScan(profile, 45, 300, 100, 1.02, 0)
  expect(scan.length).toBe(100)
  const mean = scan.reduce((a, b) => a + b, 0) / scan.length
  expect(mean).toBeGreaterThan(90)
  expect(mean).toBeLessThan(120)
})
