import { Client as OPCUAClient } from './opcua'
import { Client as ModbusClient } from './modbus'

export interface RingConnectionOptions {
  /**
   * 连接类型
   * */
  type: 'opcua' | 'modbus'
  /**
   * 连接地址
   * */
  url: string
}

/**
 * 上旋及风环连接（上旋与风环使用同一个PLC连接）
 * */
export const AirRingConnection = (options: RingConnectionOptions) => {
  const { type, url } = options
  if (type === 'opcua') {
    return OPCUAClient(url)
  }
  if (type === 'modbus') {
    return ModbusClient(url)
  }
  throw new Error('AirRing connection type not supported')
}
