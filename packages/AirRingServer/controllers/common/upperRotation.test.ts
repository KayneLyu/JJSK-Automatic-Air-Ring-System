import { expect, test, vi } from 'vitest'
import {
  buildTripSegment,
  estimateMaxAngle,
  inferMaxAngle,
  TripSegment,
} from './upperRotation'
import { mockUpperRotation } from '@jjsk/simulation/mocks/upperRotation.mock'
import { mockThickness } from '@jjsk/simulation/mocks/thickness.mock'
import { mockRoller } from '@jjsk/simulation'
import { ThicknessDevice, UpperRotationDevice } from '@jjsk/core'
import { extractScanSegments, extractSegment } from './thickness'

test('测试估算最大旋转角度1', () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: thicknessNext } = mockThickness({
    THICKNESS_UNIT_PULSE_DIS: 0.12,
    mutationT: 1.25 * 60,
  })
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60, // 20米/分钟
    RADIUS: 15 * 10, // 15厘米
  })

  const thickness: (ThicknessDevice & { timestamp: number })[] = []
  const upperRotation: (UpperRotationDevice & { timestamp: number })[] = []
  setInterval(() => {
    const timestamp = Date.now()
    const upperRotationValues = upperRotationNext()

    upperRotation.push({
      ...upperRotationValues,
      timestamp,
    })
    const thicknessGaugeValue = thicknessNext()
    const rollerValue = rollerNext()
    thickness.push({ ...thicknessGaugeValue, ...rollerValue, timestamp })
  }, 10)

  // 快进 20分钟 生成数据
  vi.advanceTimersByTime(20 * 60 * 1000)

  const segments = extractScanSegments(thickness)
  if (segments.length === 0) {
    /* 无法提取有效扫描数据 */
    return
  }

  const latestScan = segments[segments.length - 1]
  const maxAngle = inferMaxAngle({
    CHANNEL_COUNT: 64,
    ringData: upperRotation,
    latestScan,
  })
  expect(maxAngle).toBe(330)
})

test('测试估算最大旋转角度2', () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: thicknessNext } = mockThickness({
    THICKNESS_UNIT_PULSE_DIS: 0.12,
    mutationT: 1.25 * 60,
  })
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60, // 20米/分钟
    RADIUS: 15 * 10, // 15厘米
  })

  const thickness: (ThicknessDevice & { timestamp: number })[] = []
  const upperRotation: (UpperRotationDevice & { timestamp: number })[] = []
  setInterval(() => {
    const timestamp = Date.now()
    const upperRotationValues = upperRotationNext()

    upperRotation.push({
      ...upperRotationValues,
      timestamp,
    })
    const thicknessGaugeValue = thicknessNext()
    const rollerValue = rollerNext()
    thickness.push({ ...thicknessGaugeValue, ...rollerValue, timestamp })
  }, 10)

  // 快进 20分钟 生成数据
  vi.advanceTimersByTime(20 * 60 * 1000)
  const tripSegment = buildTripSegment(upperRotation)
  if (tripSegment.length < 2) {
    return
  }
  const data = tripSegment
    .map((d) => {
      const s = extractSegment(thickness, d.startTime, d.duration)
      return {
        ...d,
        measurements: s,
      }
    })
    .filter((d) => !!d.measurements) as TripSegment[]
  if (data.length < 2) {
    return
  }
  const maxAngle = estimateMaxAngle(data[0], data[1])
  expect(maxAngle?.thetaMaxDeg).toBe(330)
})
