import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 7', async () => {
  await fn(7)
}, 150000)
