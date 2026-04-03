import { RollerDevice, ThicknessDevice } from '@jjsk/core'
import {
  Client as ModbusClient,
  ModbusData,
  RegisterPoint,
} from '../base/modbus'

export type ThicknessData = ModbusData & RollerDevice & ThicknessDevice

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

export const Client = (url: string) => {
  return ModbusClient<ThicknessData>({
    url,
    pointValueMap: POINT_VALUE_MAP,
    logger: {
      source: 'thickness/modbus',
    },
  })
}
