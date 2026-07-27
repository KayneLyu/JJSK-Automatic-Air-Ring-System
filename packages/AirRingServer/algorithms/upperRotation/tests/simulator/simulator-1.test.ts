import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 1', async () => {
  await fn(1)
}, 150000)
