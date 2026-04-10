import { Client as OPCUAClient } from './opcua'
import { Client as ModbusClient } from './modbus'

export interface ThicknessConnectionOptions {
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
 * 测厚仪连接
 * */
export const ThicknessConnection = (options: ThicknessConnectionOptions) => {
  const { type, url } = options
  if (type === 'opcua') {
    return OPCUAClient(url)
  }
  if (type === 'modbus') {
    return ModbusClient(url)
  }
  throw new Error('Thickness connection type not supported')
}
