import { test } from 'vitest'
import { startServer } from '@jjsk/thickness-gauge-simulation'
import { Client } from './opcua'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const url = 'opc.tcp://localhost:4334' // 你的 OPC UA 服务器地址
test('连接测试', async () => {
  await startServer()
  await Client(url)
})
