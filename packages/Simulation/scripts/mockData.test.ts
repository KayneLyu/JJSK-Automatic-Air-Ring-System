import { mockUpperRotation } from '../mocks/upperRotation.mock'
import { mockThickness } from '../mocks/thickness.mock'
import { mockRoller } from '../mocks/roller.mock'
import { ThicknessDevice, UpperRotationDevice } from '@jjsk/core'
import { test, vi } from 'vitest'
import { writeFile } from 'node:fs/promises'

test('生成模拟数据', async () => {
  vi.useFakeTimers()
  // 固定初始时间
  const startTime = new Date('2025-11-18T12:00:00Z').getTime()
  vi.setSystemTime(startTime)

  const { next: upperRotationNext } = mockUpperRotation({ maxAngle: 330 })
  const { next: thicknessNext } = mockThickness({
    mutationT: 1.25 * 60,
  })
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60, // 20米/分钟
    RADIUS: 15 * 10, // 15厘米
  })

  const thickness: ThicknessDevice & { timestamp: number }[] = []
  const upperRotation: UpperRotationDevice & { timestamp: number }[] = []
  // 每 10ms 秒更新一次数据
  setInterval(() => {
    const timestamp = Date.now()
    const upperRotationValues = upperRotationNext()
    upperRotation.push({
      ...upperRotationValues,
      timestamp,
    })
    const thicknessGaugeValue = thicknessNext()
    const rollerValue = rollerNext()
    thickness.push({
      ...thicknessGaugeValue,
      ...rollerValue,
      timestamp,
    })
  }, 10)

  // 快进 10分钟 生成数据
  vi.advanceTimersByTime(10 * 60 * 1000)
  writeFile('./thickness.data.json', JSON.stringify(thickness), 'utf8')
  writeFile('./upperRotation.data.json', JSON.stringify(upperRotation), 'utf8')
})
