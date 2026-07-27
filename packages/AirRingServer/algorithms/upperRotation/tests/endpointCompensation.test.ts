import { describe, expect, test } from 'vitest'
import {
  analyzeLinearEndpointSensitivity,
  calculateLinearEndpointCompensatedAngle,
  resolveTrustedEndpointTiming,
} from '../upperRotation.endpointCompensation'

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('线性端部补偿', () => {
  test('只接受可追溯的设备配置或证据完整的实测端部时间', () => {
    expect(
      resolveTrustedEndpointTiming({
        source: 'deviceConfiguration',
        provenanceId: 'plc-recipe:upper-rotation-v1',
        accelerationDurationMs: 12_000,
        decelerationDurationMs: 13_000,
      })
    ).toMatchObject({
      accepted: true,
      accelerationDurationMs: 12_000,
      decelerationDurationMs: 13_000,
      rejectReason: null,
    })

    expect(
      resolveTrustedEndpointTiming({
        source: 'measuredMotorFrequency',
        provenanceId: 'rotation-raw:trip-42',
        accelerationDurationMs: 11_500,
        decelerationDurationMs: 12_500,
        measuredSampleCount: 240,
        observedMaximumFrequency: 30,
        frequencyUnitConfirmed: true,
      }).accepted
    ).toBe(true)
  })

  test('拒绝仿真、历史启发式和证据不足的频率测量', () => {
    for (const source of ['simulation', 'historicalHeuristic'] as const) {
      expect(
        resolveTrustedEndpointTiming({
          source,
          provenanceId: 'offline-only',
          accelerationDurationMs: 20_000,
          decelerationDurationMs: 20_000,
        }).rejectReason
      ).toBe('untrustedSource')
    }

    expect(
      resolveTrustedEndpointTiming({
        source: 'measuredMotorFrequency',
        provenanceId: 'rotation-raw:current-datasets',
        accelerationDurationMs: 20_000,
        decelerationDurationMs: 20_000,
        measuredSampleCount: 100,
        observedMaximumFrequency: 0,
        frequencyUnitConfirmed: false,
      }).rejectReason
    ).toBe('insufficientMeasurementEvidence')
  })

  test('可信来源仍必须具有标识和合法非负时间', () => {
    expect(
      resolveTrustedEndpointTiming({
        source: 'deviceConfiguration',
        provenanceId: '   ',
        accelerationDurationMs: 10_000,
        decelerationDurationMs: 10_000,
      }).rejectReason
    ).toBe('missingProvenance')
    expect(
      resolveTrustedEndpointTiming({
        source: 'deviceConfiguration',
        provenanceId: 'plc-recipe:invalid',
        accelerationDurationMs: -1,
        decelerationDurationMs: 10_000,
      }).rejectReason
    ).toBe('invalidDurations')
  })

  test('随机物理参数满足分段积分和等效时间公式', () => {
    const random = createRandom(0x73d8a104)
    for (let scenario = 0; scenario < 64; scenario++) {
      const halfTripDurationMs = 300_000 + random() * 180_000
      const accelerationDurationMs = 2_000 + random() * 18_000
      const decelerationDurationMs = 2_000 + random() * 18_000
      const constantAngularSpeedDegPerSecond = 0.7 + random() * 0.3
      const expectedAngle =
        constantAngularSpeedDegPerSecond *
        ((halfTripDurationMs -
          (accelerationDurationMs + decelerationDurationMs) / 2) /
          1000)
      const result = calculateLinearEndpointCompensatedAngle({
        constantAngularSpeedDegPerSecond,
        halfTripDurationMs,
        accelerationDurationMs,
        decelerationDurationMs,
        minimumAngleDeg: 0,
        maximumAngleDeg: 1000,
      })

      expect(result.accepted).toBe(true)
      expect(result.maximumAngleDeg).toBeCloseTo(expectedAngle, 12)
      expect(
        (result.accelerationAngleDeg as number) +
          (result.constantSpeedAngleDeg as number) +
          (result.decelerationAngleDeg as number)
      ).toBeCloseTo(expectedAngle, 12)
    }
  })

  test('零端部时间退化为全程匀速积分', () => {
    const result = calculateLinearEndpointCompensatedAngle({
      constantAngularSpeedDegPerSecond: 1,
      halfTripDurationMs: 300_000,
      accelerationDurationMs: 0,
      decelerationDurationMs: 0,
      minimumAngleDeg: 180,
      maximumAngleDeg: 360,
    })

    expect(result.accepted).toBe(true)
    expect(result.accelerationAngleDeg).toBe(0)
    expect(result.constantSpeedAngleDeg).toBe(300)
    expect(result.decelerationAngleDeg).toBe(0)
    expect(result.maximumAngleDeg).toBe(300)
  })

  test('拒绝非法物理输入、角度范围和不存在的匀速区', () => {
    const valid = {
      constantAngularSpeedDegPerSecond: 1,
      halfTripDurationMs: 300_000,
      accelerationDurationMs: 10_000,
      decelerationDurationMs: 10_000,
      minimumAngleDeg: 180,
      maximumAngleDeg: 360,
    }

    expect(
      calculateLinearEndpointCompensatedAngle({
        ...valid,
        constantAngularSpeedDegPerSecond: 0,
      }).rejectReason
    ).toBe('invalidPhysicalInputs')
    expect(
      calculateLinearEndpointCompensatedAngle({
        ...valid,
        minimumAngleDeg: 360,
      }).rejectReason
    ).toBe('invalidAngleRange')
    expect(
      calculateLinearEndpointCompensatedAngle({
        ...valid,
        accelerationDurationMs: 150_000,
        decelerationDurationMs: 150_000,
      }).rejectReason
    ).toBe('noConstantSpeedInterval')
  })

  test('角度越界时拒绝但保留完整分段诊断', () => {
    const result = calculateLinearEndpointCompensatedAngle({
      constantAngularSpeedDegPerSecond: 0.5,
      halfTripDurationMs: 300_000,
      accelerationDurationMs: 10_000,
      decelerationDurationMs: 10_000,
      minimumAngleDeg: 180,
      maximumAngleDeg: 360,
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('angleOutOfRange')
    expect(result.maximumAngleDeg).toBe(145)
    expect(result.constantSpeedDurationMs).toBe(280_000)
  })

  test('随机端部扰动满足解析灵敏度和联合最坏区间', () => {
    const random = createRandom(0xd5a7309c)
    for (let scenario = 0; scenario < 64; scenario++) {
      const speed = 0.7 + random() * 0.3
      const accelerationDurationMs = 10_000 + random() * 10_000
      const decelerationDurationMs = 10_000 + random() * 10_000
      const accelerationVariationMs = random() * accelerationDurationMs * 0.5
      const decelerationVariationMs = random() * decelerationDurationMs * 0.5
      const result = analyzeLinearEndpointSensitivity({
        baseline: {
          constantAngularSpeedDegPerSecond: speed,
          halfTripDurationMs: 400_000,
          accelerationDurationMs,
          decelerationDurationMs,
          minimumAngleDeg: 0,
          maximumAngleDeg: 1000,
        },
        accelerationVariationMs,
        decelerationVariationMs,
      })
      const expectedImpact =
        (speed * (accelerationVariationMs + decelerationVariationMs)) / 2000

      expect(result.accepted).toBe(true)
      expect(result.angleChangePerAccelerationMsDeg).toBeCloseTo(
        -speed / 2000,
        15
      )
      expect(result.combinedVariationAngleImpactDeg).toBeCloseTo(
        expectedImpact,
        12
      )
      expect(result.angleSpanDeg).toBeCloseTo(expectedImpact * 2, 12)
    }
  })

  test('拒绝超过基准端部时间或消除匀速区的扰动', () => {
    const baseline = {
      constantAngularSpeedDegPerSecond: 1,
      halfTripDurationMs: 100_000,
      accelerationDurationMs: 30_000,
      decelerationDurationMs: 30_000,
      minimumAngleDeg: 0,
      maximumAngleDeg: 200,
    }
    expect(
      analyzeLinearEndpointSensitivity({
        baseline,
        accelerationVariationMs: 31_000,
        decelerationVariationMs: 0,
      }).rejectReason
    ).toBe('invalidVariation')
    expect(
      analyzeLinearEndpointSensitivity({
        baseline,
        accelerationVariationMs: 20_000,
        decelerationVariationMs: 20_000,
      }).rejectReason
    ).toBe('noConstantSpeedIntervalUnderVariation')
  })

  test('扰动角度越界时拒绝并保留敏感性诊断', () => {
    const result = analyzeLinearEndpointSensitivity({
      baseline: {
        constantAngularSpeedDegPerSecond: 1,
        halfTripDurationMs: 320_000,
        accelerationDurationMs: 20_000,
        decelerationDurationMs: 20_000,
        minimumAngleDeg: 290,
        maximumAngleDeg: 310,
      },
      accelerationVariationMs: 15_000,
      decelerationVariationMs: 15_000,
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('perturbedAngleOutOfRange')
    expect(result.baselineAngleDeg).toBe(300)
    expect(result.minimumAngleDeg).toBe(285)
    expect(result.maximumAngleDeg).toBe(315)
    expect(result.angleSpanDeg).toBe(30)
  })
})
