import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 5', async () => {
  await fn(5)
}, 150000)
