import { test } from 'vitest'
import { startServer } from '@jjsk/thickness-gauge-simulation'
import { runClient } from './opcua'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
test('连接测试', async () => {
  await startServer()
  await runClient()
})
