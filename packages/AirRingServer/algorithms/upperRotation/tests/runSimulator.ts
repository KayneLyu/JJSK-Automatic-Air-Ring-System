import { expect, vi } from 'vitest'
import { createBlowFilmSimulator } from '@jjsk/simulation'
import { TripSegment } from '../../../types'
import { buildTripSegment } from '../../buildTripSegment'
import { estimateThetaMaxWithPhaseCorrection } from '../upperRotation'

export const fn = async (UpperMaxAngle: number) => {
  vi.useFakeTimers()
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const speed = (20 * 1000) / 60
  const RADIUS = 15 * 10
  const CHANNEL_COUNT = 64
  const distanceFromAirRingToScanner = 25 * 1000

  // 生成有差异的各风道基础风量
  // 注意：双层测量中奇次谐波相消，只有偶次谐波可被算法利用。
  // 因此在基础风量中同时加入 2 次（0.8）和 4 次（0.6）谐波，确保信号强度。
  const baseAirFlow = Array.from({ length: CHANNEL_COUNT }, (_, i) => {
    const angle = (i / CHANNEL_COUNT) * 2 * Math.PI
    return (
      20 +
      1.5 * Math.sin(angle) +
      0.8 * Math.sin(2 * angle + 0.5) +
      0.6 * Math.sin(4 * angle + 1.0)
    )
  })
  const simulator = createBlowFilmSimulator({
    airRing: {
      channelCount: CHANNEL_COUNT,
      baseAirFlow,
      installationOffset: 0,
      flowDeviation: 0.005,
    },
    bubble: {
      nominalThickness: 100,
      thicknessSensitivity: -2.0,
      bubbleRadius: 382.2,
      thicknessResolution: 0.5,
    },
    upperRotation: {
      maxAngle: UpperMaxAngle,
      tripDuration: 360,
    },
    scanner: {
      membraneWidth: 1200,
      tripDuration: 30,
      pulseToDistance: 0.1,
      measurementNoise: 0.1,
    },
    roller: {
      speed,
      roller: { RADIUS },
    },
    airRingToScannerDistance: distanceFromAirRingToScanner,
  })

  let tripSegment: TripSegment[] = []
  const { next: buildTripSegmentNext } = buildTripSegment()
  setInterval(() => {
    const timestamp = Date.now()
    const { rollerDevice, thicknessDevice, upperRotationDevice } =
      simulator.next()
    tripSegment = buildTripSegmentNext({
      airRing: { ...upperRotationDevice, timestamp },
      thickness: { ...thicknessDevice, ...rollerDevice, timestamp },
    })
  }, 10)

  // 快进 30 分钟，获得 5 个完整单程，提升算法精度
  vi.advanceTimersByTime(30 * 60 * 1000)

  const maxAngle = estimateThetaMaxWithPhaseCorrection(tripSegment) || 0
  console.log(
    `模拟器用例 ${UpperMaxAngle}°: expected=${UpperMaxAngle}°, got=${maxAngle.toFixed(2)}°, rounded=${Math.round(maxAngle!)}`
  )
  const diff = Math.abs(UpperMaxAngle - maxAngle)
  expect(diff).toBeLessThan(5)
}
