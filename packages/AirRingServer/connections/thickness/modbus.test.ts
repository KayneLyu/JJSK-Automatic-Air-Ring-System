import { expect, test } from 'vitest'
import { ThicknessConnection } from './index'

test('modbus 测厚连接接口与 opcua 保持一致', () => {
  const client = ThicknessConnection({
    type: 'modbus',
    url: '127.0.0.1:502',
  })

  expect(typeof client.testConnect).toBe('function')
  expect(typeof client.subscribe).toBe('function')
  expect(typeof client.read).toBe('function')
  expect(client.state).toBeDefined()
})

