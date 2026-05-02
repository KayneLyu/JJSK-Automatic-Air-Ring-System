import type { RingData } from '@jjsk/air-ring-server/connections/airRing/opcua.ts'
import ModbusTCPService from './modbus'

export async function readUpperRotationData(): Promise<RingData> {
  const modbus = ModbusTCPService.getInstance('upperRotation')

  const [coils, motorFrequency, heats] = await Promise.all([
    modbus.readCoils(1002, 5),
    modbus.readHoldingRegisters(1007, 1),
    modbus.readHoldingRegisters(1010, 1),
  ])

  return {
    ForwardRotation: Boolean(coils[0]),
    ReverseRotation: Boolean(coils[1]),
    ForwardDirectionChange: Boolean(coils[2]),
    ReverseDirectionChange: Boolean(coils[3]),
    Reset: Boolean(coils[4]),
    MotorFrequency: Number(motorFrequency[0] ?? 0),
    Heats:
      heats[0] === undefined || heats[0] === null
        ? undefined
        : [Number(heats[0])],
  }
}
