import { describe, expect, test } from 'vitest'
import { buildDynamicLocalSearchWindow } from '../upperRotation.localSearchWindow'
import { scanLocalObjective } from '../upperRotation.localObjectiveScan'

const window = buildDynamicLocalSearchWindow({
  featureAngleDeg: 300,
  uncertaintyComponentsDeg: [3, 2],
  minimumRadiusDeg: 1,
  globalMinimumAngleDeg: 180,
  globalMaximumAngleDeg: 360,
  searchStepDeg: 0.5,
  maximumSearchPoints: 100,
})

describe('通用目标函数局部扫描', () => {
  test('恢复窗口内部凸目标的离散最优点', () => {
    const result = scanLocalObjective(window, (angle) => (angle - 302) ** 2)

    expect(result.accepted).toBe(true)
    expect(result.bestAngleDeg).toBe(302)
    expect(result.bestLoss).toBe(0)
    expect(result.evaluatedPointCount).toBe(window.plannedSearchPointCount)
    expect(result.invalidLossCount).toBe(0)
  })

  test('最佳点位于任一窗口边界时拒绝', () => {
    const lower = scanLocalObjective(window, (angle) => angle)
    const upper = scanLocalObjective(window, (angle) => -angle)

    expect(lower).toMatchObject({
      accepted: false,
      bestAngleDeg: window.minimumAngleDeg,
      bestAtBoundary: true,
      rejectReason: 'bestAtBoundary',
    })
    expect(upper).toMatchObject({
      accepted: false,
      bestAngleDeg: window.maximumAngleDeg,
      bestAtBoundary: true,
      rejectReason: 'bestAtBoundary',
    })
  })

  test('跳过部分非有限 loss 和异常评估', () => {
    const result = scanLocalObjective(window, (angle) => {
      if (angle < 298) return Number.NaN
      if (angle === 299) throw new Error('synthetic failure')
      return (angle - 301) ** 2
    })

    expect(result.accepted).toBe(true)
    expect(result.bestAngleDeg).toBe(301)
    expect(result.invalidLossCount).toBeGreaterThan(0)
    expect(result.validLossCount + result.invalidLossCount).toBe(
      result.evaluatedPointCount
    )
  })

  test('所有目标值无效时拒绝并保留扫描点', () => {
    const result = scanLocalObjective(window, () => Number.POSITIVE_INFINITY)

    expect(result.accepted).toBe(false)
    expect(result.validLossCount).toBe(0)
    expect(result.invalidLossCount).toBe(window.plannedSearchPointCount)
    expect(result.scores).toHaveLength(window.plannedSearchPointCount as number)
    expect(result.rejectReason).toBe('noFiniteObjective')
  })

  test('拒绝上游未接受的动态窗口', () => {
    const invalidWindow = buildDynamicLocalSearchWindow({
      featureAngleDeg: 300,
      uncertaintyComponentsDeg: [20],
      minimumRadiusDeg: 0,
      globalMinimumAngleDeg: 180,
      globalMaximumAngleDeg: 360,
      searchStepDeg: 0.01,
      maximumSearchPoints: 10,
    })

    expect(scanLocalObjective(invalidWindow, () => 0).rejectReason).toBe(
      'invalidWindow'
    )
  })
})
