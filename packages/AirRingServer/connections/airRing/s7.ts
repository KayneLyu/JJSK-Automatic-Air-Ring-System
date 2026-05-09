import { createS7Connector } from '../base/s7'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'
import type { RingData } from './types'

export interface UpperRotationS7ConnectionOptions {
  host: string
  port?: number
  rack?: number
  slot?: number
  addressMap?: Partial<
    Record<keyof Omit<RingData, 'timestamp'>, string | undefined>
  >
  loggerDirPath?: string
  logger?: ConnectionLoggerOptions
}

const DEFAULT_UPPER_ROTATION_S7_ADDRESS_MAP = {
  ForwardRotation: 'DB7,X0.0',
  ReverseRotation: 'DB7,X0.1',
  ForwardDirectionChange: 'DB7,X0.2',
  ReverseDirectionChange: 'DB7,X0.3',
  Reset: 'DB7,X0.4',
  MotorFrequency: 'DB7,INT2.0',
} satisfies Partial<
  Record<keyof Omit<RingData, 'timestamp'>, string | undefined>
>

const buildUpperRotationLoggerOptions = (
  loggerDirPath?: string,
  logger?: ConnectionLoggerOptions
): ConnectionLoggerOptions => {
  return {
    deviceType: 'upperRotation',
    deviceName: '上旋',
    filePrefix: 'upper-rotation-s7',
    ...logger,
    dirPath: logger?.dirPath || loggerDirPath,
    source: logger?.source || 'airRing/s7',
  }
}

const getDefinedS7Items = (
  addressMap: Partial<
    Record<keyof Omit<RingData, 'timestamp'>, string | undefined>
  >
) => {
  return Object.fromEntries(
    Object.entries(addressMap).filter(([, address]) => {
      return typeof address === 'string' && address.trim().length > 0
    })
  ) as Record<string, string>
}

const normalizeUpperRotationData = (
  values: Record<string, unknown>,
  timestamp: number
): RingData => {
  const heatsValue = values.Heats

  return {
    timestamp,
    ForwardRotation:
      values.ForwardRotation === undefined
        ? undefined
        : Boolean(values.ForwardRotation),
    ReverseRotation:
      values.ReverseRotation === undefined
        ? undefined
        : Boolean(values.ReverseRotation),
    ForwardDirectionChange:
      values.ForwardDirectionChange === undefined
        ? undefined
        : Boolean(values.ForwardDirectionChange),
    ReverseDirectionChange:
      values.ReverseDirectionChange === undefined
        ? undefined
        : Boolean(values.ReverseDirectionChange),
    Reset: values.Reset === undefined ? undefined : Boolean(values.Reset),
    MotorFrequency:
      values.MotorFrequency === undefined
        ? undefined
        : Number(values.MotorFrequency),
    Heats:
      heatsValue === undefined || heatsValue === null
        ? undefined
        : [Number(heatsValue)],
  }
}

export const createUpperRotationS7Connection = ({
  host,
  port = 102,
  rack = 0,
  slot = 1,
  addressMap = DEFAULT_UPPER_ROTATION_S7_ADDRESS_MAP,
  loggerDirPath,
  logger,
}: UpperRotationS7ConnectionOptions) => {
  const connector = createS7Connector({
    host,
    port,
    rack,
    slot,
    logger: buildUpperRotationLoggerOptions(loggerDirPath, logger),
  })

  let hasDefinedItems = false
  let hasWarnedMissingAddressMap = false

  const read = async (): Promise<RingData | null> => {
    const definedItems = getDefinedS7Items(addressMap)

    if (Object.keys(definedItems).length === 0) {
      if (!hasWarnedMissingAddressMap) {
        console.warn(
          '上旋 S7 地址映射未配置，已跳过上旋读取。请在 AirRingServer/connections/airRing/s7.ts 中补充对应地址。'
        )
        hasWarnedMissingAddressMap = true
      }

      return null
    }

    if (!hasDefinedItems) {
      connector.defineItems(definedItems)
      hasDefinedItems = true
    }

    const values = await connector.readAll()
    return normalizeUpperRotationData(values, Date.now())
  }

  return {
    connect: () => connector.connectIfNeeded(),
    disconnect: () => {
      connector.disconnect()
      hasDefinedItems = false
    },
    read,
  }
}
