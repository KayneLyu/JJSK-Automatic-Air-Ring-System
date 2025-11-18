import { expect, test, vi } from 'vitest'
import { mockUpperRotation } from './upperRotation.mock'

test('测试模拟上旋数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next } = mockUpperRotation({ maxAngle: 330 })
  const frame1 = next()
  expect(frame1.ForwardRotation, '正在正向旋转').toBe(true)

  // 快进 2s 看是否在加速
  vi.advanceTimersByTime(2 * 1000)
  const frame2 = next()
  expect(frame2.MotorFrequency, '电机在加速').toBeLessThan(30)

  // 快进20s 看是否已经达到最大速度
  vi.advanceTimersByTime(20 * 1000)
  const frame3 = next()
  expect(frame3.MotorFrequency, '电机已达最大速度').toBe(30)

  // 快进158s 看是否已经达到复位点
  vi.advanceTimersByTime(158 * 1000)
  const frame4 = next()
  expect(frame4.Reset, '电机已达复位点').toBe(true)

  // 快进178s 看是否在减速
  vi.advanceTimersByTime(178 * 1000)
  const frame5 = next()
  expect(frame5.MotorFrequency, '电机在减速').toBeLessThan(30)

  // 快进1.95s 看是否已在换向
  vi.advanceTimersByTime(1.95 * 1000)
  const frame6 = next()
  expect(frame6.ForwardDirectionChange, '电机在换向').toBe(true)

  // 快进10s 看是否已在反向旋转，且在加速
  vi.advanceTimersByTime(10 * 1000)
  const frame7 = next()
  expect(frame7.ReverseRotation, '正在反向旋转').toBe(true)
  expect(frame7.MotorFrequency, '电机在加速').toBeLessThan(30)

  // 快进170s 看是否已在反向旋转，且达到复位
  vi.advanceTimersByTime(170 * 1000)
  const frame8 = next()
  expect(frame8.ReverseRotation, '正在反向旋转').toBe(true)
  expect(frame8.Reset, '电机已达复位点').toBe(true)

  // 快进270s 看是否已在正向旋转
  vi.advanceTimersByTime(270 * 1000)
  const frame9 = next()
  expect(frame9.ForwardRotation, '正在正向旋转').toBe(true)
})
