import {
  Client as ModbusClient,
  RegisterPoint,
} from '../base/modbus'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'
import type { RingData } from './types'

// ==================== 配置 ====================

const POINT_VALUE_MAP: Record<string, RegisterPoint<RingData>> = {
  ForwardRotation: {
    address: 1002,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  ReverseRotation: {
    address: 1003,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  ForwardDirectionChange: {
    address: 1004,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  ReverseDirectionChange: {
    address: 1005,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  Reset: {
    address: 1006,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  MotorFrequency: {
    address: 1007,
    kind: 'holding',
    transform: (v) => Number(v),
  },
  Heats: {
    address: 1010,
    kind: 'holding',
    transform: (v) => [Number(v)],
  },
}

export const Client = (url: string, logger?: ConnectionLoggerOptions) => {
  const { state, subscribe, testConnect, connect } = ModbusClient<RingData>({
    url,
    pointValueMap: POINT_VALUE_MAP,
    logger: {
      deviceType: 'airRing',
      deviceName: '风环',
      filePrefix: 'air-ring',
      ...logger,
      source: logger?.source || 'airRing/modbus',
    },
  })

  /**
   * 设置热量
   * */
  const setHeats = async () => {
    const client = await connect()
    if (!client) return false

    try {
      await client.writeCoil(1011, true)
      return true
    } catch {
      return false
    }
  }

  return {
    state,
    subscribe,
    testConnect,
    setHeats,
  }
}
