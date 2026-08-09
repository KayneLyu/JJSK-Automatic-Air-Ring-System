import { describe, expect, test } from 'vitest'
import { solveBubbleBatch as solveBubbleBatchNative } from '../../../AirRingNative'
import {
  buildSparseSystem,
  compareBubbleProfiles,
  solveBatch,
  solveBubbleBatchWithNative,
  type BubbleNativeBinding,
} from '../bubbleReconstruction'
import { generateTypicalBubble } from '../bubbleReconstruction/simulation/bubbleSimulator'
import { simulateMeasurements } from '../bubbleReconstruction/simulation/measurementSimulator'

const binding: BubbleNativeBinding = {
  solveBubbleBatch: solveBubbleBatchNative,
}

describe.sequential('膜泡 Batch Rust Node-API 数值等价', () => {
  for (const numBins of [48, 96, 180, 360]) {
    test(`${numBins} bins 与 TypeScript 求解结果等价`, () => {
      const profile = generateTypicalBubble(50, numBins)
      const measurements = simulateMeasurements(profile, {
        membraneWidthMm: 300,
        rotationSpeedDegPerSec: 10,
        scanPeriodSec: 5,
        numScanPoints: 120,
        transportDelaySec: 30,
        totalTimeSec: 50,
        processDeformationFactor: 1.02,
        measurementNoiseStdDev: 0.2,
      })
      const sparse = buildSparseSystem(measurements, 300, numBins, 1.02)
      const tsProfile = solveBatch(sparse, 1e-4, 0.0005)
      const rustProfile = solveBubbleBatchWithNative(
        binding,
        sparse,
        1e-4,
        0.0005
      )
      const comparison = compareBubbleProfiles(tsProfile, rustProfile)

      expect(rustProfile).toHaveLength(numBins)
      expect(rustProfile.every(Number.isFinite)).toBe(true)
      expect(comparison.maxAbsProfileDelta).toBeLessThanOrEqual(1e-8)
      expect(comparison.rmsProfileDelta).toBeLessThanOrEqual(1e-9)
    })
  }

  test('非法 CSR TypedArray 返回错误', () => {
    expect(() =>
      solveBubbleBatchNative(
        new Int32Array([0, 2]),
        new Int32Array([0]),
        new Float64Array([1]),
        new Float64Array([50]),
        48,
        1e-4,
        0.0005
      )
    ).toThrow(/rowPtr/)
  })
})
