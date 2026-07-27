import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 8', async () => {
  await fn(8)
}, 150000)
