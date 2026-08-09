import { describe, expect, test } from 'vitest'
import {
  configureThreadPool,
  searchBestDirect,
  searchBestExpanded,
} from '../../../AirRingNative'
import {
  estimateThetaMaxWithPhaseCorrectionDetailed,
  type UpperRotationDetailedEstimate,
} from '../upperRotation/upperRotation.estimate'
import {
  runUpperRotationRustShadow,
  type UpperRotationNativeBinding,
} from '../upperRotation/upperRotation.nativeShadow'
import { loadTripSegments } from './upperRotationNativeFixtures'

const nativeBinding: UpperRotationNativeBinding = {
  configureThreadPool,
  searchBestDirect,
  searchBestExpanded,
}

describe.sequential('Rust 上旋 Worker 影子适配', () => {
  for (const dataset of ['01', '02', '03', '04', '05'] as const) {
    test(`DS${dataset} Native 主搜索与 TypeScript base theta 等价`, () => {
      const tripSegments = loadTripSegments(dataset)
      const estimateOptions = {
        deltaRange: { min: 180, max: 360, step: 1 },
      }
      const production = estimateThetaMaxWithPhaseCorrectionDetailed(
        tripSegments,
        estimateOptions
      )
      const telemetry = runUpperRotationRustShadow(
        tripSegments,
        production,
        nativeBinding,
        { threadLimit: 4, estimateOptions }
      )

      expect(telemetry.status).toBe('success')
      expect(telemetry.nativeThetaDeg).toBeCloseTo(
        production.diagnostics.baseThetaDeg ?? Number.NaN,
        10
      )
      expect(telemetry.absoluteAngleDeltaDeg).toBeLessThanOrEqual(1e-9)
      expect(telemetry.productionThetaDeg).toBe(production.thetaMaxDeg)
      expect(telemetry.pointCount).toBeGreaterThan(0)
      expect(telemetry.evaluations).toBeGreaterThan(0)
      expect(telemetry.threadLimit).toBe(4)
      expect(JSON.stringify(telemetry)).not.toContain('measurements')
    })
  }

  test('Direct 目标函数使用 Native direct 搜索', () => {
    const tripSegments = loadTripSegments('01')
    const estimateOptions = {
      deltaRange: { min: 180, max: 360, step: 1 },
      objectiveMode: 'direct' as const,
    }
    const production = estimateThetaMaxWithPhaseCorrectionDetailed(
      tripSegments,
      estimateOptions
    )
    const telemetry = runUpperRotationRustShadow(
      tripSegments,
      production,
      nativeBinding,
      { threadLimit: 4, estimateOptions }
    )

    expect(telemetry.status).toBe('success')
    expect(telemetry.objectiveUsed).toBe('direct')
    expect(telemetry.absoluteAngleDeltaDeg).toBeLessThanOrEqual(1e-9)
  })

  test('生产结果不可比较时不配置线程池或构建 DTO', () => {
    const production: UpperRotationDetailedEstimate = {
      thetaMaxDeg: null,
      diagnostics: {
        status: 'rejected',
        strategyProfile: 'datasetTuned2026Q1',
        objectiveMode: 'auto',
        offsetMode: 'auto',
        objectiveUsed: null,
        inputSegments: 0,
        completeSegments: 0,
        filteredSegments: 0,
        totalPoints: 0,
        baseThetaDeg: null,
        finalThetaDeg: null,
        finalLoss: null,
        triggeredRules: [],
        rejectReason: 'completeSegmentsMissing',
        elapsedMs: 0,
      },
    }
    let configured = false
    const telemetry = runUpperRotationRustShadow(
      [],
      production,
      {
        configureThreadPool: () => {
          configured = true
          return 1
        },
        searchBestDirect: () => {
          throw new Error('不应执行')
        },
        searchBestExpanded: () => {
          throw new Error('不应执行')
        },
      },
      { threadLimit: 1 }
    )

    expect(telemetry.status).toBe('notComparable')
    expect(configured).toBe(false)
    expect(telemetry.pointCount).toBe(0)
  })

  test('Native 配置或执行错误被隔离为 telemetry', () => {
    const tripSegments = loadTripSegments('01')
    const production = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments)
    const telemetry = runUpperRotationRustShadow(
      tripSegments,
      production,
      {
        configureThreadPool: () => {
          throw new Error('thread pool unavailable')
        },
        searchBestDirect: () => {
          throw new Error('不应执行')
        },
        searchBestExpanded: () => {
          throw new Error('不应执行')
        },
      },
      { threadLimit: 4 }
    )

    expect(telemetry.status).toBe('executionError')
    expect(telemetry.error).toContain('thread pool unavailable')
    expect(telemetry.productionThetaDeg).toBe(production.thetaMaxDeg)
  })
})
