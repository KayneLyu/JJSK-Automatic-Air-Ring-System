import { test } from 'vitest'
import { fn } from '../runSimulator'

const UpperMaxAngle = Math.round(180 + Math.random() * 180)

test(`测试估算最大旋转角度 (模拟器 ${UpperMaxAngle}°)`, async () => {
  await fn(UpperMaxAngle)
}, 150000)
