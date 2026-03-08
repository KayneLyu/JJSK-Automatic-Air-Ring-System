import { expect, test, vi } from 'vitest'
import { createBlowFilmSimulator, mockRoller } from '@jjsk/simulation'
import { calibrateTractionSpeedSmooth } from './tractionSpeedSmooth'
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
  const circumference = getCircumference({ RADIUS })
  const { next: TractionSpeedSmoothNext } = calibrateTractionSpeedSmooth(
    circumference,
    10,
    10_100
  )
  let v: number | null = null
  setInterval(() => {
    const rollerDevice = next()
    v = TractionSpeedSmoothNext({
      ...rollerDevice,
      timestamp: Date.now(),
    })
  }, 10)

  // 快进50s
  vi.advanceTimersByTime(50 * 1000)

  if (v) {
    const delta = Math.abs(v - speed)
    expect(delta).toBeLessThanOrEqual(0.1)
  } else {
    expect(v).toBe(speed)
  }
})

test('验证计算牵引速度算法2', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  // 模拟收卷速度为 20米/分钟
  // 模拟辊的半径为 15厘米
  const speed = (20 * 1000) / 60
  const RADIUS = 15 * 10
  const simulator = createBlowFilmSimulator({
    airRing: {
      channelCount: 12,
      baseAirFlow: [20, 21, 20, 19, 20, 21, 20, 19, 20, 21, 20, 19],
      installationOffset: 0,
    },
    bubble: {
      nominalThickness: 100,
      thicknessSensitivity: -2.0,
      bubbleRadius: 382.2, // mm，可选，默认从膜宽反推 (membraneWidth / π)
      thicknessResolution: 0.5, // 度，默认0.5°（720个采样点），确保测厚仪能采样到足够细节
    },
    upperRotation: {
      maxAngle: 270,
      tripDuration: 360, // 6 分钟
    },
    scanner: {
      membraneWidth: 1200, // mm，约等于 πr（膜泡周长的一半）
      tripDuration: 30, // 30 秒
      pulseToDistance: 0.1,
    },
    roller: {
      speed,
      roller: { RADIUS },
    },
  })
  const circumference = getCircumference({ RADIUS })
  const { next: TractionSpeedSmoothNext } = calibrateTractionSpeedSmooth(
    circumference,
    10,
    10_100
  )
  let v: number | null = null
  setInterval(() => {
    const rollerDevice = simulator.next().rollerDevice
    v = TractionSpeedSmoothNext({
      ...rollerDevice,
      timestamp: Date.now(),
    })
  }, 10)

  // 快进50s
  vi.advanceTimersByTime(50 * 1000)

  if (v) {
    const delta = Math.abs(v - speed)
    expect(delta).toBeLessThanOrEqual(0.1)
  } else {
    expect(v).toBe(speed)
  }
})
