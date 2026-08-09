import { describe, expect, it } from 'vitest'
import { collectUniformSample } from '../../../../apps/AirRingSys/electron/db/uniformSampling'
import { downsampleUniform } from '../../../../apps/AirRingSys/electron/db/sweepHelpers'

describe('Bubble Query 有界均匀采样', () => {
  it('与既有 downsampleUniform 索引语义一致', () => {
    for (const sourceCount of [1, 99, 100, 2000, 2001, 10_003]) {
      const source = Array.from({ length: sourceCount }, (_, index) => index)
      expect(collectUniformSample(source, source.length, 2000)).toEqual(
        downsampleUniform(source, 2000)
      )
    }
  })

  it('只消费到最后一个目标索引，不物化迭代器尾部', () => {
    let consumed = 0
    const values = {
      *[Symbol.iterator]() {
        for (let index = 0; index < 10_000; index += 1) {
          consumed += 1
          yield index
        }
      },
    }
    const sampled = collectUniformSample(values, 10_000, 100)
    expect(sampled).toHaveLength(100)
    expect(consumed).toBeLessThan(10_000)
  })

  it('拒绝非法边界和 COUNT/迭代数量不一致', () => {
    expect(() => collectUniformSample([], -1, 10)).toThrow('sourceCount')
    expect(() => collectUniformSample([], 0, 0)).toThrow('target')
    expect(() => collectUniformSample([1, 2], 3, 10)).toThrow(
      '有序查询数量与 COUNT 不一致'
    )
  })
})
