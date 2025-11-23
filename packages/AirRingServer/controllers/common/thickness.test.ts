import { expect, test, vi } from 'vitest'
import { ThickNessData } from '../../connections/thickness/opcua'
import { mockRoller } from '@jjsk/simulation'
import { computeTractionSpeedSmooth } from './thickness'
import { getCircumference } from '@jjsk/core'

test('验证计算牵引速度算法', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  // 模拟收卷速度为 20米/分钟
  // 模拟辊的半径为 15厘米
  const speed = (20 * 1000) / 60
  const RADIUS = 15 * 10
  const { next } = mockRoller({
    speed,
    RADIUS,
  })
  const data: ThickNessData[] = []
  setInterval(() => {
    const rollerDevice = next()
    data.push({
      ...rollerDevice,
      timestamp: Date.now(),
    })
  }, 10)

  // 快进50s
  vi.advanceTimersByTime(50 * 1000)
  const circumference = getCircumference({ RADIUS })
  const v = computeTractionSpeedSmooth(data, circumference, 10, 10_100)
  if (v) {
    const delta = Math.abs(v - speed)
    expect(delta).toBeLessThanOrEqual(0.1)
  } else {
    expect(v).toBe(speed)
  }
})
