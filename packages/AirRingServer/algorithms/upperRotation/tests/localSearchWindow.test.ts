import { describe, expect, test } from 'vitest'
import { buildDynamicLocalSearchWindow } from '../upperRotation.localSearchWindow'

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('动态局部搜索窗口', () => {
  test('随机候选窗口包含特征角度且半径来自显式不确定度', () => {
    const random = createRandom(0xc2a9317d)
    for (let scenario = 0; scenario < 64; scenario++) {
      const featureAngleDeg = 200 + random() * 140
      const components = [random() * 2, random() * 3, random() * 4]
      const minimumRadiusDeg = random() * 2
      const result = buildDynamicLocalSearchWindow({
        featureAngleDeg,
        uncertaintyComponentsDeg: components,
        minimumRadiusDeg,
        globalMinimumAngleDeg: 180,
        globalMaximumAngleDeg: 360,
        searchStepDeg: 0.1,
        maximumSearchPoints: 1000,
      })
      const expectedUncertainty = components.reduce(
        (sum, component) => sum + component,
        0
      )

      expect(result.accepted).toBe(true)
      expect(result.totalUncertaintyDeg).toBeCloseTo(expectedUncertainty, 12)
      expect(result.requestedRadiusDeg).toBeCloseTo(
        Math.max(minimumRadiusDeg, expectedUncertainty),
        12
      )
      expect(result.minimumAngleDeg as number).toBeLessThanOrEqual(
        featureAngleDeg
      )
      expect(result.maximumAngleDeg as number).toBeGreaterThanOrEqual(
        featureAngleDeg
      )
    }
  })

  test('靠近全局边界时只裁剪越界一侧并保留诊断', () => {
    const result = buildDynamicLocalSearchWindow({
      featureAngleDeg: 182,
      uncertaintyComponentsDeg: [3, 4],
      minimumRadiusDeg: 1,
      globalMinimumAngleDeg: 180,
      globalMaximumAngleDeg: 360,
      searchStepDeg: 0.5,
      maximumSearchPoints: 100,
    })

    expect(result.accepted).toBe(true)
    expect(result.minimumAngleDeg).toBe(180)
    expect(result.maximumAngleDeg).toBe(189)
    expect(result.actualLeftRadiusDeg).toBe(2)
    expect(result.actualRightRadiusDeg).toBe(7)
    expect(result.clippedAtMinimum).toBe(true)
    expect(result.clippedAtMaximum).toBe(false)
  })

  test('搜索点数超过调用方预算时拒绝但保留窗口', () => {
    const result = buildDynamicLocalSearchWindow({
      featureAngleDeg: 300,
      uncertaintyComponentsDeg: [10],
      minimumRadiusDeg: 0,
      globalMinimumAngleDeg: 180,
      globalMaximumAngleDeg: 360,
      searchStepDeg: 0.01,
      maximumSearchPoints: 100,
    })

    expect(result.accepted).toBe(false)
    expect(result.minimumAngleDeg).toBe(290)
    expect(result.maximumAngleDeg).toBe(310)
    expect(result.plannedSearchPointCount).toBe(2001)
    expect(result.rejectReason).toBe('searchBudgetExceeded')
  })

  test('拒绝全局范围外的特征候选和退化窗口', () => {
    expect(
      buildDynamicLocalSearchWindow({
        featureAngleDeg: 170,
        uncertaintyComponentsDeg: [2],
        minimumRadiusDeg: 1,
        globalMinimumAngleDeg: 180,
        globalMaximumAngleDeg: 360,
        searchStepDeg: 0.1,
        maximumSearchPoints: 100,
      }).rejectReason
    ).toBe('featureAngleOutOfRange')
    expect(
      buildDynamicLocalSearchWindow({
        featureAngleDeg: 180,
        uncertaintyComponentsDeg: [0],
        minimumRadiusDeg: 0,
        globalMinimumAngleDeg: 180,
        globalMaximumAngleDeg: 360,
        searchStepDeg: 0.1,
        maximumSearchPoints: 100,
      }).rejectReason
    ).toBe('degenerateWindow')
  })

  test('拒绝空不确定度、负分量和非法搜索参数', () => {
    const valid = {
      featureAngleDeg: 300,
      uncertaintyComponentsDeg: [2],
      minimumRadiusDeg: 1,
      globalMinimumAngleDeg: 180,
      globalMaximumAngleDeg: 360,
      searchStepDeg: 0.1,
      maximumSearchPoints: 100,
    }
    expect(
      buildDynamicLocalSearchWindow({
        ...valid,
        uncertaintyComponentsDeg: [],
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      buildDynamicLocalSearchWindow({
        ...valid,
        uncertaintyComponentsDeg: [-1],
      }).rejectReason
    ).toBe('invalidOptions')
    expect(
      buildDynamicLocalSearchWindow({
        ...valid,
        searchStepDeg: 0,
      }).rejectReason
    ).toBe('invalidOptions')
  })
})
