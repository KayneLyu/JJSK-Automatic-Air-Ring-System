import S7Client from 'nodes7'
import {
  createConnectionLogger,
  type ConnectionLoggerOptions,
} from './connectionLogger'

type S7ReadValues = Record<string, string | number | boolean>
type S7WritableValue = string | number | boolean

type NormalizedS7ConnectorOptions = Omit<
  S7ConnectorOptions,
  'port' | 'rack' | 'slot'
> & {
  port: number
  rack: number
  slot: number
}

export interface S7ConnectorOptions {
  host: string
  port?: number
  rack?: number
  slot?: number
  logger?: ConnectionLoggerOptions
}

export const createS7Connector = (options: S7ConnectorOptions) => {
  return new S7Connector(options)
}

const normalizeS7ConnectorOptions = (
  options: S7ConnectorOptions
): NormalizedS7ConnectorOptions => {
  return {
    ...options,
    port: options.port || 102,
    rack: options.rack || 0,
    slot: options.slot || 1,
  }
}

const buildS7LoggerOptions = (
  options: NormalizedS7ConnectorOptions
): ConnectionLoggerOptions => {
  return {
    source: options.logger?.source || `s7:${options.host}:${options.port}`,
    ...options.logger,
  }
}

const buildS7ConnectionMeta = (options: NormalizedS7ConnectorOptions) => {
  return {
    host: options.host,
    port: options.port,
    rack: options.rack,
    slot: options.slot,
  }
}

const buildS7ReadMeta = (
  options: NormalizedS7ConnectorOptions,
  success: boolean
) => {
  return {
    host: options.host,
    success,
  }
}

const wrapS7Error = (action: '连接' | '读取' | '写入', error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`S7 ${action}失败: ${message}`)
}

const createTranslationCallback = (defs: Record<string, string>) => {
  return (tag: string) => defs[tag]
}

const getS7ItemNames = (defs: Record<string, string>) => {
  return Object.keys(defs)
}

const normalizeWriteRequest = (
  address: string | string[],
  value: unknown | unknown[]
): {
  address: string | string[]
  value: S7WritableValue | S7WritableValue[]
} => {
  const ensureValidAddress = (input: unknown, index?: number) => {
    if (typeof input !== 'string' || input.trim().length === 0) {
      const suffix = index === undefined ? '' : ` at index ${index}`
      throw new Error(`S7 写入地址无效${suffix}`)
    }
    return input
  }

  if (Array.isArray(address)) {
    return {
      address: address.map((item, index) => ensureValidAddress(item, index)),
      value: (Array.isArray(value) ? value : [value]) as S7WritableValue[],
    }
  }

  return {
    address: ensureValidAddress(address),
    value: value as S7WritableValue,
  }
}

export class S7Connector {
  private client = new S7Client()
  private isConnected = false
  private connectPromise: Promise<void> | null = null
  private readonly connectionLogger
  private readonly normalizedOptions

  constructor(private readonly options: S7ConnectorOptions) {
    this.normalizedOptions = normalizeS7ConnectorOptions(options)
    this.connectionLogger = createConnectionLogger(
      buildS7LoggerOptions(this.normalizedOptions)
    )
  }

  async connectIfNeeded(): Promise<void> {
    if (this.isConnected) {
      return Promise.resolve()
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.client.initiateConnection(
        buildS7ConnectionMeta(this.normalizedOptions),
        (error?: Error) => {
          if (error) {
            this.isConnected = false
            const nextError = wrapS7Error('连接', error)
            this.connectionLogger.log({
              protocol: 's7',
              event: 'connect_error',
              meta: buildS7ConnectionMeta(this.normalizedOptions),
              error: nextError,
            })
            reject(nextError)
            return
          }

          this.isConnected = true
          this.connectionLogger.log({
            protocol: 's7',
            event: 'connect',
            meta: buildS7ConnectionMeta(this.normalizedOptions),
          })
          resolve()
        }
      )
    }).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  defineItems(defs: Record<string, string>) {
    this.client.setTranslationCB(createTranslationCallback(defs))
    this.client.removeItems()
    this.client.addItems(getS7ItemNames(defs))
  }

  async readAll<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(): Promise<T> {
    await this.connectIfNeeded()

    return new Promise<T>((resolve, reject) => {
      this.client.readAllItems((error: boolean, values: S7ReadValues) => {
        if (error) {
          this.isConnected = false
          const nextError = wrapS7Error('读取', error)
          this.connectionLogger.log({
            protocol: 's7',
            event: 'read',
            meta: buildS7ReadMeta(this.normalizedOptions, false),
            error: nextError,
          })
          reject(nextError)
          return
        }

        this.connectionLogger.log({
          protocol: 's7',
          event: 'read',
          meta: buildS7ReadMeta(this.normalizedOptions, true),
        })
        resolve(values as T)
      })
    })
  }

  async writeItems(address: string | string[], value: unknown | unknown[]) {
    await this.connectIfNeeded()
    const request = normalizeWriteRequest(address, value)

    // 写入时优先按原始地址执行，避免沿用上一次 defineItems 的翻译映射
    // 导致 "DBx,..." 被错误翻译为 undefined。
    this.client.setTranslationCB((tag: string) => tag)

    return new Promise<void>((resolve, reject) => {
      const callback = (error: boolean) => {
        if (error) {
          this.isConnected = false
          reject(wrapS7Error('写入', error))
          return
        }

        resolve()
      }

      if (Array.isArray(request.address)) {
        this.client.writeItems(
          request.address,
          request.value as S7WritableValue[],
          callback
        )
        return
      }

      this.client.writeItems(
        request.address,
        request.value as S7WritableValue,
        callback
      )
    })
  }

  disconnect() {
    if (!this.isConnected) {
      return
    }

    this.client.dropConnection(() => undefined)
    this.isConnected = false
  }
}
