import { describe, expect, test } from 'vitest'
import { createSimulatorScenario } from './runSimulator'

describe('模拟器随机场景生成器', () => {
  test('相同 seed 可重放，其他 seed 产生不同场景', () => {
    const first = createSimulatorScenario(123456789)
    const replay = createSimulatorScenario(123456789)
    const other = createSimulatorScenario(987654321)

    expect(replay).toEqual(first)
    expect(other).not.toEqual(first)
  })

  test('生成参数始终处于物理测试范围', () => {
    for (let seed = 0; seed < 100; seed++) {
      const scenario = createSimulatorScenario(seed)
      expect(scenario.maxAngleDeg).toBeGreaterThanOrEqual(181)
      expect(scenario.maxAngleDeg).toBeLessThanOrEqual(359)
      expect(scenario.upperTripDurationSec).toBeGreaterThanOrEqual(360)
      expect(scenario.upperTripDurationSec).toBeLessThanOrEqual(480)
      expect(scenario.scannerTripDurationSec).toBeGreaterThanOrEqual(25)
      expect(scenario.scannerTripDurationSec).toBeLessThanOrEqual(35)
      expect(scenario.measurementNoise).toBeGreaterThanOrEqual(0.05)
      expect(scenario.measurementNoise).toBeLessThanOrEqual(0.2)
      expect(scenario.flowDeviation).toBeGreaterThanOrEqual(0.002)
      expect(scenario.flowDeviation).toBeLessThanOrEqual(0.01)
    }
  })
})
