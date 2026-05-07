import { Client as OPCUAClient } from './opcua'
import { Client as ModbusClient } from './modbus'
import { createUpperRotationS7Connection } from './s7'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'

export * from './types'
export * from './s7'

export interface RingConnectionOptions {
  /**
   * 连接类型
   * */
  type: 'opcua' | 'modbus' | 's7'
  /**
   * 连接地址
   * */
  url: string
  /**
   * 日志配置
   */
  logger?: ConnectionLoggerOptions
}

export type AirRingOpcuaConnection = ReturnType<typeof OPCUAClient>
export type AirRingModbusConnection = ReturnType<typeof ModbusClient>
export type AirRingS7Connection = ReturnType<
  typeof createUpperRotationS7Connection
>

export function AirRingConnection(options: {
  type: 'opcua'
  url: string
  logger?: ConnectionLoggerOptions
}): AirRingOpcuaConnection
export function AirRingConnection(options: {
  type: 'modbus'
  url: string
  logger?: ConnectionLoggerOptions
}): AirRingModbusConnection
export function AirRingConnection(options: {
  type: 's7'
  url: string
  logger?: ConnectionLoggerOptions
}): AirRingS7Connection

/**
 * 上旋及风环连接（上旋与风环使用同一个PLC连接）
 * */
export function AirRingConnection(options: RingConnectionOptions) {
  const { type, url, logger } = options
  if (type === 'opcua') {
    return OPCUAClient(url, logger)
  }
  if (type === 'modbus') {
    return ModbusClient(url, logger)
  }
  if (type === 's7') {
    const parsed = new URL(url.includes('://') ? url : `s7://${url}`)
    return createUpperRotationS7Connection({
      host: parsed.hostname,
      port: Number(parsed.port || 102),
      logger,
    })
  }
  throw new Error('AirRing connection type not supported')
}
