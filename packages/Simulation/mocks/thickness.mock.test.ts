import { expect, test, vi } from 'vitest'
import { mockThickness } from './thickness.mock'

test('测试模拟测厚仪数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  // 模拟单程时长为 3分钟，最大脉冲数为 10000
  const { next } = mockThickness({})

  const frame1 = next()
  expect(frame1.MotionDirection, '收到信号').toBe(true)

  // 快进 2s 看是否收到信号
  vi.advanceTimersByTime(2 * 1000)
  const frame2 = next()
  expect(frame2.MotionDirection, '正在向右扫描').toBe(true)
  expect(frame2.HorizontalPulse).toBeGreaterThan(111)
  expect(frame2.ProbeValue).toBeGreaterThan(100)

  // 快进 178.01s 看是否收到限位
  vi.advanceTimersByTime(178.01 * 1000)
  const frame3 = next()
  expect(frame3.MotionDirection, '正在向左扫描').toBe(false)
  expect(frame3.SwapDirection, '正在换向').toBe(true)
  expect(frame3.RightLimit, '到达右限位').toBe(true)
  expect(frame3.HorizontalPulse).toBeLessThan(10000)
  expect(frame3.ProbeValue).toBeLessThan(100)

  // 快进 10s 看是否收到限位
  vi.advanceTimersByTime(10 * 1000)
  const frame4 = next()
  expect(frame4.MotionDirection, '正在向左扫描').toBe(false)
  expect(frame4.SwapDirection, '正在换向').toBe(false)
  expect(frame4.RightLimit, '到达右限位').toBe(false)
  expect(frame4.HorizontalPulse).toBeLessThan(10000)
  expect(frame4.ProbeValue).toBeLessThan(100)
})
