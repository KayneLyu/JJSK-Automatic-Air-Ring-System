import { expect, test } from 'vitest'
import { AirRingConnection } from './index'

test('modbus 连接层接口与 opcua 保持一致', () => {
  const client = AirRingConnection({
    type: 'modbus',
    url: '127.0.0.1:502',
  })

  expect(typeof client.testConnect).toBe('function')
  expect(typeof client.subscribe).toBe('function')
  expect(typeof client.setHeats).toBe('function')
  expect(client.state).toBeDefined()
})

