import {
  Client as ModbusClient,
  RegisterPoint,
} from '../base/modbus'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'
import type { ThicknessData } from './types'

// ==================== 配置 ====================

const POINT_VALUE_MAP: Record<string, RegisterPoint<ThicknessData>> = {
  HorizontalPulse: {
    address: 1002,
    kind: 'holding',
    transform: (v) => Number(v),
  },
  LeftLimit: {
    address: 1003,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  RightLimit: {
    address: 1004,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  ResetSignal: {
    address: 1005,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  SwapDirection: {
    address: 1006,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  MotionDirection: {
    address: 1007,
    kind: 'coil',
    transform: (v) => Boolean(v),
  },
  ProbeValue: {
    address: 1008,
    kind: 'holding',
    transform: (v) => Number(v),
  },
  RollSpeedSignal: {
    address: 1011,
    kind: 'holding',
    transform: (v) => Number(v),
  },
}

export const Client = (url: string, logger?: ConnectionLoggerOptions) => {
  return ModbusClient<ThicknessData>({
    url,
    pointValueMap: POINT_VALUE_MAP,
    logger: {
      deviceType: 'thickness',
      deviceName: '测厚仪',
      filePrefix: 'thickness',
      ...logger,
      source: logger?.source || 'thickness/modbus',
    },
  })
}
