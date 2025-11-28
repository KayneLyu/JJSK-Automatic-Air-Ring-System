import { expect, test, vi } from 'vitest'
import { mockThickness } from './thickness.mock'

test('测试模拟测厚仪数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const maxSpeed = (4 * 1000) / (60 * 1000) //最大速度 4米/分钟
  const THICKNESS_UNIT_PULSE_DIS = 0.12 // 测厚仪单位脉冲位移量 0.12毫米/脉冲
  const membraneWidth = 1200 // 膜宽 1200毫米
  const maxPulseSpeed = maxSpeed / THICKNESS_UNIT_PULSE_DIS // pulse/ms
  const inMembraneTime = membraneWidth / maxSpeed // 膜内时间
  const { next } = mockThickness({
    membraneWidth,
    maxSpeed,
    THICKNESS_UNIT_PULSE_DIS,
  })

  const frame1 = next()
  expect(frame1.MotionDirection, '收到信号').toBe(true)
  expect(frame1.ResetSignal, '收到信号').toBe(true)

  // 快进 200ms 看是正在加速
  vi.advanceTimersByTime(200)
  const frame2 = next()
  expect(frame2.MotionDirection, '正在向右扫描').toBe(true)
  expect(frame2.HorizontalPulse).toBe(Math.round(200 * maxPulseSpeed * 0.5))
  expect(frame2.ProbeValue).toBe(0)

  // 快进 900ms 看是否已经扫描到膜
  vi.advanceTimersByTime(900)
  const frame3 = next()
  expect(frame3.MotionDirection, '正在向右扫描').toBe(true)
  expect(frame3.ProbeValue).toBeGreaterThan(0)

  // 快进 18s 看是否进入缓冲区
  vi.advanceTimersByTime(18 * 1000)
  const frame4 = next()
  expect(frame4.MotionDirection, '正在向右扫描').toBe(true)
  expect(frame4.HorizontalPulse).toBe(10500)
  expect(frame4.ProbeValue).toBe(0)
})
