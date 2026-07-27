import { test } from 'vitest'
import { fn } from '../runSimulator'

test('随机模拟器场景 4', async () => {
  await fn(4)
}, 150000)
