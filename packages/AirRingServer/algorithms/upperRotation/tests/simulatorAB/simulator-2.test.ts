import { test } from 'vitest'
import { fn } from '../runSimulator'

const UpperMaxAngle = 350

test(
  `A/B 对照 (模拟器 ${UpperMaxAngle}°)`,
  async () => {
    await fn(UpperMaxAngle)
  },
  30000
)
