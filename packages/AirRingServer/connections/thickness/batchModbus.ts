import {
  createConnectionLogger,
  type ConnectionLoggerOptions,
} from '../base/connectionLogger'
import { createQueuedModbusTcpClient } from '../base/modbusTcp'
import type { ThicknessBatchData } from './types'

export interface ThicknessBatchModbusConnectionOptions {
  url: string
  unitId?: number
  startAddress?: number
  registerCount?: number
  logger?: ConnectionLoggerOptions
}

const DEFAULT_THICKNESS_LOGGER: ConnectionLoggerOptions = {
  deviceType: 'thickness',
  deviceName: '测厚仪',
  filePrefix: 'thickness',
}

const parseInt32 = (reg1: number, reg2: number) => {
  return (reg1 << 16) | reg2
}

export const parseThicknessBatchRegisters = (
  data: number[]
): ThicknessBatchData => {
  const adValues: number[] = []

  for (let index = 0; index < 25; index += 1) {
    adValues.push(Number(data[index] ?? 0))
  }

  const values32: number[] = []

  for (let index = 25; index < data.length; index += 2) {
    const reg1 = Number(data[index] ?? 0)
    const reg2 = Number(data[index + 1] ?? 0)
    values32.push(parseInt32(reg1, reg2))
  }

  return {
    adValues,
    pulses: values32.slice(0, 25),
    timestamps: values32.slice(25, 50),
  }
}

export const createThicknessBatchModbusConnection = ({
  url,
  unitId = 1,
  startAddress = 100,
  registerCount = 125,
  logger,
}: ThicknessBatchModbusConnectionOptions) => {
  const client = createQueuedModbusTcpClient({
    url,
    unitId,
    logger: {
      ...DEFAULT_THICKNESS_LOGGER,
      ...logger,
      source: logger?.source || 'thickness/batch-modbus-client',
    },
  })

  const connectionLogger = createConnectionLogger({
    ...DEFAULT_THICKNESS_LOGGER,
    ...logger,
    source: logger?.source || 'thickness/batch-modbus',
  })

  let pollSeq = 0

  const read = async () => {
    pollSeq += 1

    try {
      const startedAt = Date.now()
      const rawRegisters = await client.readHoldingRegisters(
        startAddress,
        registerCount
      )
      const durationMs = Date.now() - startedAt
      const data = parseThicknessBatchRegisters(rawRegisters)
      const lengthMismatch =
        data.adValues.length !== data.pulses.length ||
        data.adValues.length !== data.timestamps.length

      connectionLogger.log({
        protocol: 'modbus',
        event: 'read',
        data,
        meta: {
          url,
          unitId,
          pollSeq,
          startAddress,
          registerCount,
          readLatencyMs: durationMs,
          adCount: data.adValues.length,
          pulseCount: data.pulses.length,
          timestampCount: data.timestamps.length,
          firstTimestamp: data.timestamps[0],
          lastTimestamp: data.timestamps[data.timestamps.length - 1],
          firstPulse: data.pulses[0],
          lastPulse: data.pulses[data.pulses.length - 1],
          lengthMismatch,
        },
      })

      return data
    } catch (error) {
      connectionLogger.log({
        protocol: 'modbus',
        event: 'subscribe_error',
        error,
        meta: {
          url,
          unitId,
          pollSeq,
          startAddress,
          registerCount,
        },
      })
      throw error
    }
  }

  return {
    connect: client.connect,
    disconnect: client.disconnect,
    read,
  }
}
