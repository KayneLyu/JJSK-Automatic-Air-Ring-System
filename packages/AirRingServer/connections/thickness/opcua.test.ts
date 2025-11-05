import { expect, test, vi } from 'vitest'
import { startServer } from '@jjsk/thickness-gauge-simulation'
import { Client } from './opcua'

const url = 'opc.tcp://localhost:4334' // 你的 OPC UA 服务器地址

test('连接测试', async () => {
  await startServer()
  const { testConnect } = Client(url)
  const connected = await testConnect()
  expect(connected).toBe(true)
})

test('监听数据变化', async () => {
  await startServer()

  const callback = vi.fn()
  const { subscribe } = Client(url)
  await subscribe(callback)

  await vi.waitFor(
    () => {
      expect(callback).toHaveBeenCalled()
      const { calls } = callback.mock
      const hasExpectedCall = calls.some(
        ([arg]) => arg && typeof arg === 'object' && arg.rightLimit === false
      )
      expect(hasExpectedCall).toBe(true)
    },
    { timeout: 5000 }
  )
})
