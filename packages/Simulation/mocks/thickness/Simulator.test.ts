import { describe, test, expect } from 'vitest'
import Simulator from './signal'

describe('Simulator updateTick()', () => {
  test('测试返回值的结构', () => {
    const sim = new Simulator()
    const data = sim.updateTick()

    expect(data).toHaveProperty('HorizontalPulse')
    expect(data).toHaveProperty('LeftLimit')
    expect(data).toHaveProperty('RightLimit')
    expect(data).toHaveProperty('ResetSignal')
    expect(data).toHaveProperty('MotionDirection')
    expect(data).toHaveProperty('ProbeValue')
    expect(data).toHaveProperty('RollSpeedSignal')
  })

  test('脉冲值', async () => {
    const sim = new Simulator()
    const d1 = sim.updateTick()
    await new Promise((r) => setTimeout(r, 50))
    const d2 = sim.updateTick()

    expect(d2.HorizontalPulse).toBeGreaterThan(d1.HorizontalPulse)
    expect(d2.MotionDirection).toBe(true)
  })

  test('右限位触发', () => {
    const sim = new Simulator()
    // 模拟到右端
    for (let i = 0; i < 10000; i++) {
      sim.updateTick()
    }
    const out = sim.updateTick()
    expect(out.RightLimit).toBe(true)
    expect(out.MotionDirection).toBe(false)
  })

  test('检查采集值 >= 0', () => {
    const sim = new Simulator()
    const t = sim.updateTick().ProbeValue
    expect(t).toBeGreaterThanOrEqual(0)
  })

  test('辊速信号', async () => {
    const sim = new Simulator()
    const signals: boolean[] = []

    for (let i = 0; i < 100; i++) {
      signals.push(sim.updateTick().RollSpeedSignal)
      await new Promise((r) => setTimeout(r, 10))
    }

    // 检查信号在周期内出现过 true 和 false
    expect(signals.includes(true)).toBe(true)
    expect(signals.includes(false)).toBe(true)
  })
})
