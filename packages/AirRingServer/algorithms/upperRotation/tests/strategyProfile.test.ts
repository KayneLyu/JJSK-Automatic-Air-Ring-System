import { mockRoller } from '@jjsk/simulation'
import { describe, expect, test, vi } from 'vitest'
import type { TripSegment } from '../../../types'
import { buildTripSegment } from '../../buildTripSegment'
import {
  compareUpperRotationStrategies,
  estimateThetaMaxWithPhaseCorrection,
  estimateThetaMaxWithPhaseCorrectionDetailed,
} from '../upperRotation'

const loadTripSegments = async (
  dsName: '01' | '05'
): Promise<TripSegment[]> => {
  const thicknessData = (
    await import(`../data/${dsName}/thickness.json`, {
      assert: { type: 'json' },
    })
  ).default as Array<{
    HorizontalPulse: number
    ProbeValue: number
    timestamp: number
  } | null>
  const upper = (
    await import(`../data/${dsName}/upper.json`, {
      assert: { type: 'json' },
    })
  ).default as Array<{
    ForwardRotation: boolean
    ReverseRotation: boolean
    timestamp: number
  } | null>

  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next: buildTripSegmentNext } = buildTripSegment()
  let tripSegments: TripSegment[] = []
  for (let i = 0; i < upper.length; i++) {
    const upperRotationValue = upper[i]
    const thicknessGaugeValue = thicknessData[i]
    if (upperRotationValue && thicknessGaugeValue) {
      tripSegments = buildTripSegmentNext({
        airRing: upperRotationValue,
        thickness: { ...rollerNext(), ...thicknessGaugeValue },
      })
    }
  }
  return tripSegments
}

describe('上旋策略 profile 隔离', () => {
  test.each([
    ['01', '低角度模式修正'],
    ['05', '高角度过估修正'],
  ] as const)(
    '数据集 %s 的定向修正仅在 datasetTuned2026Q1 启用',
    async (dsName, targetedMessage) => {
      const tripSegments = await loadTripSegments(dsName)
      const warnings: string[] = []
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation((message?: unknown) => {
          warnings.push(String(message))
        })

      try {
        const defaultResult = estimateThetaMaxWithPhaseCorrection(tripSegments)
        const defaultWarnings = warnings.splice(0)
        const tunedResult = estimateThetaMaxWithPhaseCorrection(tripSegments, {
          debug: { strategyProfile: 'datasetTuned2026Q1' },
        })
        const tunedWarnings = warnings.splice(0)
        estimateThetaMaxWithPhaseCorrection(tripSegments, {
          debug: { strategyProfile: 'generic' },
        })
        const genericWarnings = warnings.splice(0)

        expect(defaultResult).not.toBeNull()
        expect(tunedResult).toBeCloseTo(defaultResult ?? 0, 6)
        expect(
          defaultWarnings.some((message) => message.includes(targetedMessage))
        ).toBe(true)
        expect(
          tunedWarnings.some((message) => message.includes(targetedMessage))
        ).toBe(true)
        expect(
          genericWarnings.some((message) => message.includes(targetedMessage))
        ).toBe(false)
      } finally {
        warnSpy.mockRestore()
      }
    }
  )

  test('详细结果提供结构化策略诊断且不改变原接口', async () => {
    const tripSegments = await loadTripSegments('01')
    const legacyResult = estimateThetaMaxWithPhaseCorrection(tripSegments)
    const tuned = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments)
    const generic = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments, {
      debug: { strategyProfile: 'generic' },
    })

    expect(tuned.thetaMaxDeg).toBeCloseTo(legacyResult ?? 0, 6)
    expect(tuned.diagnostics).toMatchObject({
      status: 'success',
      strategyProfile: 'datasetTuned2026Q1',
      objectiveUsed: 'expanded',
      inputSegments: tripSegments.length,
      triggeredRules: ['lowAngleH1'],
      rejectReason: null,
    })
    expect(tuned.diagnostics.baseThetaDeg).not.toBeNull()
    expect(tuned.diagnostics.finalThetaDeg).toBeCloseTo(
      tuned.thetaMaxDeg ?? 0,
      6
    )
    expect(tuned.diagnostics.finalLoss).toBeGreaterThan(0)
    expect(tuned.diagnostics.elapsedMs).toBeGreaterThan(0)

    expect(generic.diagnostics).toMatchObject({
      status: 'success',
      strategyProfile: 'generic',
      objectiveUsed: 'expanded',
      triggeredRules: [],
      rejectReason: null,
    })
  })

  test('详细结果为不可估计数据提供结构化拒绝原因', async () => {
    const tripSegments = await loadTripSegments('01')
    const rejected = estimateThetaMaxWithPhaseCorrectionDetailed(
      tripSegments.map((segment) => ({ ...segment, duration: 0 }))
    )

    expect(rejected.thetaMaxDeg).toBeNull()
    expect(rejected.diagnostics).toMatchObject({
      status: 'rejected',
      inputSegments: tripSegments.length,
      completeSegments: 0,
      filteredSegments: 0,
      finalThetaDeg: null,
      rejectReason: 'completeSegmentsMissing',
    })
  })

  test('影子对照保持 tuned 为生产选择并报告 generic 差异', async () => {
    const tripSegments = await loadTripSegments('01')
    const comparison = compareUpperRotationStrategies(tripSegments)

    expect(comparison.comparable).toBe(true)
    expect(comparison.selectedThetaDeg).toBeCloseTo(
      comparison.production.thetaMaxDeg ?? 0,
      6
    )
    expect(comparison.production.diagnostics).toMatchObject({
      strategyProfile: 'datasetTuned2026Q1',
      triggeredRules: ['lowAngleH1'],
    })
    expect(comparison.shadow.diagnostics).toMatchObject({
      strategyProfile: 'generic',
      triggeredRules: [],
    })
    expect(comparison.angleDeltaDeg).toBeCloseTo(
      (comparison.shadow.thetaMaxDeg ?? 0) -
        (comparison.production.thetaMaxDeg ?? 0),
      6
    )
    expect(comparison.absoluteAngleDeltaDeg).toBeGreaterThan(20)
  })
})
