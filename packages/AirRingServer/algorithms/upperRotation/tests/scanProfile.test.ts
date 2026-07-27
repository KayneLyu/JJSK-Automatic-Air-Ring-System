import { describe, expect, test } from 'vitest'
import { normalizeScannerProfile } from '../upperRotation.scanProfile'

const options = {
  positionRange: { min: 0, max: 100 },
  sampleCount: 11,
  minValidPoints: 3,
  minCoverageRatio: 0.6,
}

describe('扫描剖面标准化', () => {
  test('正反扫描按物理位置得到相同剖面', () => {
    const increasing = [0, 20, 50, 80, 100].map((position) => ({
      position,
      value: position * 2 + 5,
    }))
    const forward = normalizeScannerProfile(increasing, options)
    const reverse = normalizeScannerProfile([...increasing].reverse(), options)

    expect(forward.accepted).toBe(true)
    expect(reverse.accepted).toBe(true)
    expect(forward.values).toEqual(reverse.values)
    expect(forward.quality.inputDirection).toBe('increasing')
    expect(reverse.quality.inputDirection).toBe('decreasing')
  })

  test('不规则采样按位置线性重采样并合并重复位置', () => {
    const result = normalizeScannerProfile(
      [
        { position: 0, value: 5 },
        { position: 20, value: 45 },
        { position: 20, value: 45 },
        { position: 55, value: 115 },
        { position: 100, value: 205 },
      ],
      options
    )

    expect(result.quality.uniquePositionCount).toBe(4)
    expect(result.values).toEqual(
      result.positions.map((position) => position * 2 + 5)
    )
  })

  test('过滤无效值并保留覆盖范围外的缺失信息', () => {
    const result = normalizeScannerProfile(
      [
        { position: 20, value: 20 },
        { position: 40, value: 40 },
        { position: 60, value: Number.NaN },
        { position: 80, value: 80 },
        { position: Number.NaN, value: 90 },
      ],
      options
    )

    expect(result.accepted).toBe(true)
    expect(result.quality.validCount).toBe(3)
    expect(result.quality.coverageRatio).toBeCloseTo(0.6, 6)
    expect(result.quality.missingRatio).toBeGreaterThan(0)
    expect(Number.isNaN(result.values[0])).toBe(true)
    expect(Number.isNaN(result.values.at(-1))).toBe(true)
  })

  test('覆盖不足时返回结构化拒绝原因', () => {
    const result = normalizeScannerProfile(
      [
        { position: 40, value: 1 },
        { position: 50, value: 2 },
        { position: 60, value: 3 },
      ],
      options
    )

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('insufficientCoverage')
    expect(result.quality.coverageRatio).toBeCloseTo(0.2, 6)
  })

  test('可选去均值和线性去趋势只处理有效位置', () => {
    const points = [20, 40, 60, 80].map((position) => ({
      position,
      value: position * 3 + 7,
    }))
    const meanResult = normalizeScannerProfile(points, {
      ...options,
      detrend: 'mean',
    })
    const linearResult = normalizeScannerProfile(points, {
      ...options,
      detrend: 'linear',
    })
    const finiteMeanValues = meanResult.values.filter(Number.isFinite)

    expect(
      finiteMeanValues.reduce((sum, value) => sum + value, 0) /
        finiteMeanValues.length
    ).toBeCloseTo(0, 10)
    expect(
      linearResult.values
        .filter(Number.isFinite)
        .every((value) => Math.abs(value) < 1e-10)
    ).toBe(true)
    expect(Number.isNaN(linearResult.values[0])).toBe(true)
    expect(Number.isNaN(linearResult.values.at(-1))).toBe(true)
  })

  test('边缘裁剪对称保留缺失值并更新缺失率', () => {
    const result = normalizeScannerProfile(
      [0, 25, 50, 75, 100].map((position) => ({ position, value: position })),
      { ...options, edgeTrimRatio: 0.2 }
    )

    expect(result.values.slice(0, 2).every(Number.isNaN)).toBe(true)
    expect(result.values.slice(-2).every(Number.isNaN)).toBe(true)
    expect(result.quality.missingRatio).toBeCloseTo(4 / 11, 10)
  })

  test('轻度平滑降低局部脉冲且不填补缺失位置', () => {
    const points = [20, 40, 50, 60, 80].map((position) => ({
      position,
      value: position === 50 ? 10 : 0,
    }))
    const raw = normalizeScannerProfile(points, options)
    const smoothed = normalizeScannerProfile(points, {
      ...options,
      smoothingRadius: 1,
    })

    expect(smoothed.values[5]).toBeLessThan(raw.values[5])
    expect(Number.isNaN(smoothed.values[0])).toBe(true)
    expect(Number.isNaN(smoothed.values.at(-1))).toBe(true)
  })

  test('预处理后仍保持正反扫描等价', () => {
    const increasing = [0, 20, 50, 80, 100].map((position) => ({
      position,
      value: position * position + 3,
    }))
    const preprocessingOptions = {
      ...options,
      edgeTrimRatio: 0.1,
      detrend: 'linear' as const,
      smoothingRadius: 1,
    }

    expect(
      normalizeScannerProfile(increasing, preprocessingOptions).values
    ).toEqual(
      normalizeScannerProfile([...increasing].reverse(), preprocessingOptions)
        .values
    )
  })

  test('拒绝会删除全部有效信息的预处理配置', () => {
    const points = [0, 50, 100].map((position) => ({
      position,
      value: position,
    }))

    expect(
      normalizeScannerProfile(points, { ...options, edgeTrimRatio: 0.5 })
        .rejectReason
    ).toBe('invalidPreprocessingOptions')
    expect(
      normalizeScannerProfile(points, { ...options, smoothingRadius: 6 })
        .rejectReason
    ).toBe('invalidPreprocessingOptions')
  })
})
