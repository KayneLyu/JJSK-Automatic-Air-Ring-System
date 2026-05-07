import { Client as OPCUAClient } from './opcua'
import { Client as ModbusClient } from './modbus'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'

export * from './types'
export * from './batchModbus'

export interface ThicknessConnectionOptions {
  /**
   * 连接类型
   * */
  type: 'opcua' | 'modbus'
  /**
   * 连接地址
   * */
  url: string
  /**
   * 日志配置
   */
  logger?: ConnectionLoggerOptions
}

/**
 * 测厚仪连接
 * */
export const ThicknessConnection = (options: ThicknessConnectionOptions) => {
  const { type, url, logger } = options
  if (type === 'opcua') {
    return OPCUAClient(url, logger)
  }
  if (type === 'modbus') {
    return ModbusClient(url, logger)
  }
  throw new Error('Thickness connection type not supported')
}
