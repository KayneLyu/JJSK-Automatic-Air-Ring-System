import { expect, test, vi } from 'vitest'
import { mockRoller } from './roller.mock'

test('测试模拟辊数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  // 模拟收卷速度为 20米/分钟
  // 模拟辊的半径为 15厘米
  const { next } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const frame1 = next()
  expect(frame1.RollSpeedSignal, '收到信号').toBe(true)

  // 快进 2s 看是否收到未到达信号
  vi.advanceTimersByTime(2 * 1000)
  const frame2 = next()
  expect(frame2.RollSpeedSignal, '收到信号').toBe(false)

  // 快进 0.85s 看是否收到到达信号
  vi.advanceTimersByTime(0.85 * 1000)
  const frame3 = next()
  expect(frame3.RollSpeedSignal, '收到信号').toBe(true)
})
