import { expect, test, vi } from 'vitest'
import { mockUpperRotation } from '@jjsk/simulation/mocks/upperRotation.mock'
import { buildTripSegment } from './buildTripSegment'
import { BaseTripSegment } from '../types'

test('验证生成旋转单程片段数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: BuildTripSegmentNext } = buildTripSegment()
  let tripSegment: BaseTripSegment[] = []
  setInterval(() => {
    const timestamp = Date.now()
    const upperRotationValues = upperRotationNext()

    tripSegment = BuildTripSegmentNext({
      ...upperRotationValues,
      timestamp,
    })
  }, 10)

  // 快进 20分钟 生成数据
  vi.advanceTimersByTime(20 * 60 * 1000)
  expect(tripSegment.length).toBe(4)
})
