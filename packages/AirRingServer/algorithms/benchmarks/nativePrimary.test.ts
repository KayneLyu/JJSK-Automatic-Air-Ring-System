import { describe, expect, test } from 'vitest'
import {
  configureThreadPool,
  evaluateDirect,
  evaluateExpanded,
  searchBestDirect,
  searchBestExpanded,
} from '../../../AirRingNative'
import {
  createUpperRotationNativeSearchBackend,
  estimateThetaMaxWithPhaseCorrectionDetailed,
  type UpperRotationNativeBinding,
} from '../upperRotation/upperRotation'
import { loadTripSegments } from './upperRotationNativeFixtures'

const nativeBinding: UpperRotationNativeBinding = {
  configureThreadPool,
  evaluateDirect,
  evaluateExpanded,
  searchBestDirect,
  searchBestExpanded,
}

describe.sequential('上旋 Rust Native 主计算后端', () => {
  for (const dataset of ['01', '02', '03', '04', '05'] as const) {
    test(`DS${dataset} 最终角度与规则诊断等价`, () => {
      const tripSegments = loadTripSegments(dataset)
      const options = {
        deltaRange: { min: 180, max: 360, step: 1 },
      }
      const typescript = estimateThetaMaxWithPhaseCorrectionDetailed(
        tripSegments,
        options
      )
      const rust = estimateThetaMaxWithPhaseCorrectionDetailed(tripSegments, {
        ...options,
        searchBackend: createUpperRotationNativeSearchBackend(nativeBinding, 4),
      })

      expect(rust.diagnostics.status).toBe(typescript.diagnostics.status)
      expect(rust.diagnostics.objectiveUsed).toBe(
        typescript.diagnostics.objectiveUsed
      )
      expect(rust.diagnostics.triggeredRules).toEqual(
        typescript.diagnostics.triggeredRules
      )
      expect(rust.diagnostics.rejectReason).toBe(
        typescript.diagnostics.rejectReason
      )
      expect(rust.diagnostics.baseThetaDeg).toBeCloseTo(
        typescript.diagnostics.baseThetaDeg ?? Number.NaN,
        10
      )
      expect(rust.thetaMaxDeg).toBeCloseTo(
        typescript.thetaMaxDeg ?? Number.NaN,
        10
      )
    })
  }
})
