import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 2', async () => {
  await fn(2)
}, 150000)
