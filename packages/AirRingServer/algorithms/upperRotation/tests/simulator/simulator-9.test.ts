import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 9', async () => {
  await fn(9)
}, 150000)
