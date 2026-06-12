import { expect, test, vi } from 'vitest'
import { createBlowFilmSimulator } from '@jjsk/simulation'
import {
  reconstructBubbleThickness,
  type MeasurementTriple,
} from './bubbleThicknessReconstruction'

test('单元测试：均匀双层膜泡的单层分布应为 50µm', () => {
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

  const meanProfile =
    result.profile.reduce((a, b) => a + b, 0) / result.profile.length

  expect(meanProfile).toBeCloseTo(doubleLayer / 2, 0)
  expect(result.rmsError).toBeLessThan(1)
})

const runSimulatorTest = (
  label: string,
  channelCount: number,
  baseAirFlow: number[],
  maxAngle: number,
  measurementNoise: number
) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-11-18T12:00:00Z').getTime())

  const simulator = createBlowFilmSimulator({
    airRing: {
      channelCount,
      baseAirFlow,
      installationOffset: 0,
      flowDeviation: 0,
      flowPeriod: 1e9,
    },
    bubble: { nominalThickness: 100, thicknessSensitivity: -2.0, thicknessResolution: 0.5 },
    upperRotation: { maxAngle, tripDuration: 360, accelDecelTime: 20 },
    scanner: { membraneWidth: 1200, tripDuration: 30, pulseToDistance: 0.1, measurementNoise, sensorDelay: 0 },
    roller: { speed: 200, roller: { RADIUS: 100 } },
    airRingToScannerDistance: 2000,
  })

  const membraneWidthMm = 1200
  const triples: MeasurementTriple[] = []
  let groundTruthProfile: number[] = []

  const totalSteps = 30 * 60 * 100
  const sampleEvery = measurementNoise > 0 ? 5 : 10

  for (let step = 0; step < totalSteps; step++) {
    vi.advanceTimersByTime(10)
    if (step > 60 * 100 && !groundTruthProfile.length) {
      const state = simulator.next()
      groundTruthProfile = [...state.airRing.thicknessProfile]
      if (
        state.scanner.measuredThickness !== null &&
        state.scanner.measuredThickness !== undefined &&
        Math.abs(state.scanner.position) <= membraneWidthMm / 2 &&
        step % sampleEvery === 0
      ) {
        triples.push({
          upperAngleDeg: state.upperRotation.angle,
          scannerPosMm: state.scanner.position,
          thickness: state.scanner.measuredThickness,
        })
      }
      continue
    }
    const state = simulator.next()
    if (
      state.scanner.measuredThickness === null ||
      state.scanner.measuredThickness === undefined
    ) {
      continue
    }
    if (Math.abs(state.scanner.position) > membraneWidthMm / 2) continue
    if (step % sampleEvery !== 0) continue

    triples.push({
      upperAngleDeg: state.upperRotation.angle,
      scannerPosMm: state.scanner.position,
      thickness: state.scanner.measuredThickness,
    })
  }

  expect(triples.length).toBeGreaterThan(200)

  const result = reconstructBubbleThickness(triples, membraneWidthMm, {
    numBins: 48,
    lambda: 1e-3,
    processDeformationFactor: 1.02,
  })

  const meanGT =
    groundTruthProfile.reduce((a, b) => a + b, 0) / groundTruthProfile.length
  const meanRecon =
    result.profile.reduce((a, b) => a + b, 0) / result.profile.length

  console.log(`[${label}]
    测量数: ${triples.length}
    真实平均: ${meanGT.toFixed(2)} µm
    重建平均: ${meanRecon.toFixed(2)} µm
    RMS: ${result.rmsError.toFixed(3)} µm  Max: ${result.maxError.toFixed(3)} µm
    profile[0..11]: [${result.profile.slice(0, 12).map((v) => v.toFixed(1)).join(', ')}...]
  `)

  expect(Math.abs(meanRecon - meanGT)).toBeLessThan(5)
  expect(meanRecon).toBeGreaterThan(85)
  expect(meanRecon).toBeLessThan(115)

  // === Per-bin 形状精度验证 ===
  // 将 720 点 ground truth 下采样到 48 bins 与 reconstruction 对齐
  const gtSamplePoints = groundTruthProfile.length
  const gtBinned = new Array(48).fill(0).map(() => ({ sum: 0, count: 0 }))
  for (let i = 0; i < gtSamplePoints; i++) {
    const angle = (i / gtSamplePoints) * 360
    const bin = Math.floor((angle / 360) * 48) % 48
    gtBinned[bin].sum += groundTruthProfile[i]
    gtBinned[bin].count++
  }
  const gtDownsampled = gtBinned.map((b) =>
    b.count > 0 ? b.sum / b.count : 0
  )

  let maxBinError = 0
  let avgBinError = 0
  let validBins = 0
  for (let i = 0; i < 48; i++) {
    if (gtDownsampled[i] > 0) {
      const err = Math.abs(result.profile[i] - gtDownsampled[i])
      avgBinError += err
      if (err > maxBinError) maxBinError = err
      validBins++
    }
  }
  avgBinError /= validBins

  const reconVar =
    result.profile.reduce((s, v) => s + (v - meanRecon) ** 2, 0) /
    result.profile.length
  const gtVar =
    gtDownsampled.reduce((s, v) => s + (v - meanGT) ** 2, 0) /
    gtDownsampled.length

  console.log(`[${label}] 逐bin验证:
    有效 bins: ${validBins}/48
    平均 bin 误差: ${avgBinError.toFixed(3)} µm
    最大 bin 误差: ${maxBinError.toFixed(3)} µm
    重建方差: ${reconVar.toFixed(3)}, GT方差: ${gtVar.toFixed(3)}
  `)

  // 验证：重建方差 ≤ GT 方差（奇次谐波在 null space 中，会被滤掉）
  // 但不应完全为 0（除非 profile 仅含奇次谐波如纯 sin 波）
  if (gtVar > 1) {
    expect(reconVar).toBeLessThanOrEqual(gtVar * 1.1)
  }
  // 平均 bin 误差 < 5µm
  expect(avgBinError).toBeLessThan(5)

  vi.useRealTimers()
  return { meanGT, meanRecon, result, triples }
}

test('仿真器验证：单风道正弦（无噪声）', { timeout: 30000 }, () => {
  const baseAirFlow = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 2 * Math.PI
    return 20 + 1.5 * Math.sin(angle)
  })
  runSimulatorTest('单风道正弦', 12, baseAirFlow, 270, 0)
})

test('仿真器验证：多谐波（无噪声）', { timeout: 30000 }, () => {
  const baseAirFlow = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 2 * Math.PI
    return 20 + 1.5 * Math.sin(angle) + 0.8 * Math.sin(2 * angle + 0.5) + 0.6 * Math.sin(4 * angle + 1.0)
  })
  runSimulatorTest('多谐波', 24, baseAirFlow, 330, 0)
})

test('仿真器验证：多谐波 + 测量噪声 0.5µm', { timeout: 30000 }, () => {
  const baseAirFlow = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 2 * Math.PI
    return 20 + 1.5 * Math.sin(angle) + 0.8 * Math.sin(2 * angle + 0.5)
  })
  const out = runSimulatorTest('多谐波+噪声', 24, baseAirFlow, 330, 0.5)
  expect(out.result.rmsError).toBeLessThan(10)
})
