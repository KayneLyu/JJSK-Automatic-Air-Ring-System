import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 3', async () => {
  await fn(3)
}, 150000)
