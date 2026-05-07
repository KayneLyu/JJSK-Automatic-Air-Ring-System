import type { ConnectionLoggerOptions } from '../base'
import { createS7Connector, type S7ConnectorOptions } from '../base/s7'

export type ThicknessS7ControlKey = 'FWD' | 'REV' | 'STOP' | 'HOME' | 'MEASURE'

export type ThicknessS7ControlState = Record<ThicknessS7ControlKey, boolean>

export interface ThicknessS7ConnectionOptions
  extends Omit<S7ConnectorOptions, 'logger'> {
  loggerDirPath?: string
  logger?: ConnectionLoggerOptions
  controlAddressMap?: Partial<Record<ThicknessS7ControlKey, string | undefined>>
}

const DEFAULT_THICKNESS_S7_CONTROL_ADDRESS_MAP: Record<
  ThicknessS7ControlKey,
  string
> = {
  FWD: 'DB4,X0.0',
  REV: 'DB4,X0.1',
  STOP: 'DB4,X0.2',
  HOME: 'DB4,X0.3',
  MEASURE: 'DB4,X0.4',
}

const buildThicknessS7LoggerOptions = (
  loggerDirPath?: string,
  logger?: ConnectionLoggerOptions
): ConnectionLoggerOptions => {
  return {
    deviceType: 'thickness',
    deviceName: '测厚仪',
    filePrefix: 'thickness',
    ...logger,
    dirPath: logger?.dirPath || loggerDirPath,
    source: logger?.source || 'thickness/s7',
  }
}

const getDefinedThicknessControlAddressMap = (
  controlAddressMap?: Partial<Record<ThicknessS7ControlKey, string | undefined>>
) => {
  const merged = {
    ...DEFAULT_THICKNESS_S7_CONTROL_ADDRESS_MAP,
    ...controlAddressMap,
  }

  return Object.fromEntries(
    Object.entries(merged).filter(([, address]) => {
      return typeof address === 'string' && address.trim().length > 0
    })
  ) as Record<ThicknessS7ControlKey, string>
}

const normalizeThicknessS7ControlState = (
  values: Partial<Record<ThicknessS7ControlKey, unknown>>
): ThicknessS7ControlState => {
  return {
    FWD: Boolean(values.FWD),
    REV: Boolean(values.REV),
    STOP: Boolean(values.STOP),
    HOME: Boolean(values.HOME),
    MEASURE: Boolean(values.MEASURE),
  }
}

export const createThicknessS7Connection = ({
  host,
  port,
  rack,
  slot,
  loggerDirPath,
  logger,
  controlAddressMap,
}: ThicknessS7ConnectionOptions) => {
  const connector = createS7Connector({
    host,
    port,
    rack,
    slot,
    logger: buildThicknessS7LoggerOptions(loggerDirPath, logger),
  })
  let operationQueue = Promise.resolve()

  const enqueueOperation = <T>(task: () => Promise<T>) => {
    const result = operationQueue.then(task)
    operationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  const connect = () => connector.connectIfNeeded()

  const readControlState = async () => {
    return enqueueOperation(async () => {
      const items = getDefinedThicknessControlAddressMap(controlAddressMap)
      connector.defineItems(items)
      const values =
        await connector.readAll<
          Partial<Record<ThicknessS7ControlKey, unknown>>
        >()
      return normalizeThicknessS7ControlState(values)
    })
  }

  const readParams = async <T extends Record<string, string>>(
    addressMap: T
  ) => {
    return enqueueOperation(async () => {
      connector.defineItems(addressMap)
      return await connector.readAll<Record<keyof T, number | string | boolean>>()
    })
  }

  const writeValue = (address: string, value: unknown) => {
    return enqueueOperation(() => connector.writeItems(address, value))
  }

  const writeValues = (address: string[], value: unknown[]) => {
    return enqueueOperation(() => connector.writeItems(address, value))
  }

  return {
    connect,
    disconnect: () => connector.disconnect(),
    readControlState,
    readParams,
    writeValue,
    writeValues,
  }
}
