import { expect, test } from 'vitest'
import { mockUpperRotation } from './upperRotation.mock'
import { sleep } from '../utils'

test('测试模拟数', async () => {
  const { next } = mockUpperRotation({ maxAngle: 330 })
  const frame1 = next()

  expect(frame1.ForwardRotation, '正在正向旋转').toBe(true)
  await sleep(2 * 1000)
  const frame2 = next()
  expect(frame2.MotorFrequency, '电机还在加速').toBeLessThan(30)
  await sleep(20 * 1000)
  const frame3 = next()
  expect(frame3.MotorFrequency, '电机已达最大速度').toBe(30)
}, 500_000)

test('测试模拟数2', async () => {
  const { next } = mockUpperRotation({ maxAngle: 330 })
  const frame1 = next()

  expect(frame1.ForwardRotation).toBe(true)
})
