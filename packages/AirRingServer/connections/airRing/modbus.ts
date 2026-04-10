import { UpperRotationDevice } from '@jjsk/core'
import {
  Client as ModbusClient,
  ModbusData,
  RegisterPoint,
} from '../base/modbus'

export type RingData = ModbusData &
  UpperRotationDevice & {
    /**
     * 风环热量
     * */
    Heats?: number[]
  }

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

export const Client = (url: string) => {
  const { state, subscribe, testConnect, connect } = ModbusClient<RingData>({
    url,
    pointValueMap: POINT_VALUE_MAP,
    logger: {
      source: 'airRing/modbus',
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
