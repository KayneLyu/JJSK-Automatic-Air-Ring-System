import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 0', async () => {
  await fn(0)
}, 150000)
