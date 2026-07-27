import { describe, expect, test } from 'vitest'
import { calculateZncc } from '../upperRotation.zncc'

const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('NaN 感知逐位移 ZNCC', () => {
  test('在随机长度、位移、缩放、偏置和部分缺失下恢复平移', () => {
    const random = createRandom(0x5a17c9e3)
    for (let scenario = 0; scenario < 64; scenario++) {
      const length = 48 + Math.floor(random() * 80)
      const maxShift = Math.max(2, Math.floor(length / 6))
      const expectedShift = Math.floor(random() * (maxShift * 2 + 1)) - maxShift
      const scale = 0.25 + random() * 4
      const offset = (random() - 0.5) * 100
      const reference = Array.from({ length }, () => random() * 2 - 1)
      const candidate = new Array<number>(length).fill(Number.NaN)
      for (let index = 0; index < length; index++) {
        const shiftedIndex = index + expectedShift
        if (shiftedIndex >= 0 && shiftedIndex < length) {
          candidate[shiftedIndex] = reference[index] * scale + offset
        }
      }
      for (let index = 0; index < length; index++) {
        if (random() < 0.08) reference[index] = Number.NaN
        if (random() < 0.08) candidate[index] = Number.NaN
      }

      const result = calculateZncc(reference, candidate, {
        maxShift,
        minOverlapCount: Math.floor(length / 3),
      })

      expect(result.accepted).toBe(true)
      expect(result.bestShift).toBe(expectedShift)
      expect(result.bestCorrelation).toBeCloseTo(1, 12)
    }
  })

  test('每个位移只统计双方均有效的真实重叠点', () => {
    const result = calculateZncc(
      [Number.NaN, 1, 4, 2, 8, Number.NaN],
      [Number.NaN, Number.NaN, 3, 9, 5, 17],
      { maxShift: 2, minOverlapCount: 3 }
    )
    const positiveShift = result.scores.find(({ shift }) => shift === 1)

    expect(positiveShift?.overlapCount).toBe(4)
    expect(positiveShift?.correlation).toBeCloseTo(1, 12)
    expect(result.bestShift).toBe(1)
  })

  test('常量、重叠不足和非法配置不会产生伪相关峰', () => {
    const constant = calculateZncc([1, 1, 1, 1], [2, 2, 2, 2], {
      maxShift: 1,
      minOverlapCount: 2,
    })
    const insufficient = calculateZncc(
      [1, Number.NaN, Number.NaN, 2],
      [1, Number.NaN, Number.NaN, 2],
      { maxShift: 1, minOverlapCount: 3 }
    )
    const invalid = calculateZncc([1, 2], [1, 2], {
      maxShift: 2,
      minOverlapCount: 2,
    })

    expect(constant.rejectReason).toBe('noValidShift')
    expect(insufficient.rejectReason).toBe('noValidShift')
    expect(invalid.rejectReason).toBe('invalidOptions')
  })

  test('长度不一致时明确拒绝而非静默截断', () => {
    const result = calculateZncc([1, 2, 3], [1, 2], {
      maxShift: 1,
      minOverlapCount: 2,
    })

    expect(result.accepted).toBe(false)
    expect(result.rejectReason).toBe('lengthMismatch')
  })

  test('随机亚像素平移的抛物线峰值比整数峰更接近真实位移', () => {
    const random = createRandom(0x31bc74a9)
    const integerErrors: number[] = []
    const subpixelErrors: number[] = []
    for (let scenario = 0; scenario < 48; scenario++) {
      const length = 96
      const expectedShift = random() * 8 - 4
      const phaseA = random() * Math.PI * 2
      const phaseB = random() * Math.PI * 2
      const profile = (position: number): number =>
        Math.sin(position * 0.17 + phaseA) +
        0.45 * Math.cos(position * 0.071 + phaseB) +
        0.2 * Math.sin(position * 0.031 * (1 + position / length))
      const reference = Array.from({ length }, (_, index) => profile(index))
      const candidate = Array.from({ length }, (_, index) =>
        profile(index - expectedShift)
      )
      const result = calculateZncc(reference, candidate, {
        maxShift: 8,
        minOverlapCount: 64,
      })

      expect(result.interpolationApplied).toBe(true)
      integerErrors.push(Math.abs((result.bestShift as number) - expectedShift))
      subpixelErrors.push(
        Math.abs((result.bestShiftSubpixel as number) - expectedShift)
      )
    }

    const mean = (values: readonly number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean(subpixelErrors)).toBeLessThan(mean(integerErrors))
    expect(Math.max(...subpixelErrors)).toBeLessThan(0.1)
  })

  test('周期剖面暴露等高次峰而不是报告唯一峰', () => {
    const profile = Array.from({ length: 64 }, (_, index) =>
      Math.sin((index * Math.PI) / 4)
    )
    const result = calculateZncc(profile, profile, {
      maxShift: 12,
      minOverlapCount: 40,
    })

    expect(result.bestShift).toBe(0)
    expect(Math.abs(result.secondPeakShift as number)).toBe(8)
    expect(result.secondPeakCorrelation).toBeCloseTo(1, 12)
    expect(result.secondPeakOverlapCount).toBeGreaterThan(0)
    expect(result.peakProminence).toBeCloseTo(0, 12)
  })

  test('搜索边界上的主峰不执行缺少邻点的亚像素插值', () => {
    const reference = [3, 1, 4, 1, 5, 9, 2, 6]
    const candidate = [Number.NaN, 3, 1, 4, 1, 5, 9, 2]
    const result = calculateZncc(reference, candidate, {
      maxShift: 1,
      minOverlapCount: 6,
    })

    expect(result.bestShift).toBe(1)
    expect(result.bestShiftSubpixel).toBe(1)
    expect(result.interpolationApplied).toBe(false)
  })
})
