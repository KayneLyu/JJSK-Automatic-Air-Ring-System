import { expect, test, vi } from 'vitest'
import { createBlowFilmSimulator } from '@jjsk/simulation'
import { calibrateTractionSpeedSmooth } from './tractionSpeedSmooth'
import { findMutation } from './findMutation'
import { calibrateMutationWindowSize } from './mutationWindowSize'
import { getCircumference } from '@jjsk/core'

test('验证突变检测算法', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  // 模拟收卷速度为 20米/分钟
  // 模拟辊的半径为 15厘米
  const speed = (20 * 1000) / 60
  const RADIUS = 15 * 10
  // 模拟气环有64个通道
  const CHANNEL_COUNT = 64
  // 模拟扫描仪距离气环25米
  const distanceFromAirRingToScanner = 25 * 1000
  const simulator = createBlowFilmSimulator({
    airRing: {
      channelCount: CHANNEL_COUNT,
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
    airRingToScannerDistance: distanceFromAirRingToScanner,
  })

  const circumference = getCircumference({ RADIUS })
  const { next: TractionSpeedSmoothNext } = calibrateTractionSpeedSmooth(
    circumference,
    10,
    10_100
  )
  const { next: MutationWindowSizeNext } = calibrateMutationWindowSize({
    CHANNEL_COUNT,
  })
  const { next: FindMutationNext, setWindowSize } = findMutation()

  let distance: number | null = null
  let disturbanceTs: number | null = null
  setInterval(() => {
    const { rollerDevice, thicknessDevice, upperRotationDevice } =
      simulator.next()
    const v = TractionSpeedSmoothNext({
      ...rollerDevice,
      timestamp: Date.now(),
    })
    const windowSize = MutationWindowSizeNext({
      thickness: {
        ...thicknessDevice,
        timestamp: Date.now(),
      },
      airRing: {
        ...upperRotationDevice,
        timestamp: Date.now(),
      },
    })
    if (windowSize.fastSize) {
      setWindowSize(windowSize.fastSize)
    }
    const mutation = FindMutationNext({
      ...thicknessDevice,
      timestamp: Date.now(),
    })
    if (mutation) {
      console.log(
        '检测到突变:',
        mutation.ProbeValue,
        '时间:',
        mutation.timestamp
      )
    }
    if (v && mutation && disturbanceTs && !distance) {
      const tau_ms = mutation.timestamp! - disturbanceTs

      distance = v * (tau_ms / 1000)
    }
  }, 10)

  // 快进50s
  vi.advanceTimersByTime(50 * 1000)
  simulator.adjustAirFlow(11, 500) // 模拟扰动
  disturbanceTs = Date.now()
  // 快进1s
  vi.advanceTimersByTime(1000)
  simulator.adjustAirFlow(11, 20) // 恢复正常

  // 再快进250s
  vi.advanceTimersByTime(250 * 1000)
  if (distance) {
    const delta = Math.abs(distance - distanceFromAirRingToScanner)
    expect(delta).toBeLessThanOrEqual(50) // 允许一定误差，单位为毫米
  } else {
    expect(distance).toBe(distanceFromAirRingToScanner)
  }
})
