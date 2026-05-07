import S7Client from 'nodes7'
import {
  createConnectionLogger,
  type ConnectionLoggerOptions,
} from './connectionLogger'

type S7ReadValues = Record<string, string | number | boolean>
type S7WritableValue = string | number | boolean

export interface S7ConnectorOptions {
  host: string
  port?: number
  rack?: number
  slot?: number
  logger?: ConnectionLoggerOptions
}

export class S7Connector {
  private client = new S7Client()
  private isConnected = false
  private connectPromise: Promise<void> | null = null
  private readonly connectionLogger

  constructor(private readonly options: S7ConnectorOptions) {
    this.connectionLogger = createConnectionLogger({
      source:
        options.logger?.source || `s7:${options.host}:${options.port || 102}`,
      ...options.logger,
    })
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
        {
          host: this.options.host,
          port: this.options.port || 102,
          rack: this.options.rack || 0,
          slot: this.options.slot || 1,
        },
        (error?: Error) => {
          if (error) {
            this.isConnected = false
            const nextError = new Error(`S7 连接失败: ${error.message}`)
            this.connectionLogger.log({
              protocol: 's7',
              event: 'connect_error',
              meta: {
                host: this.options.host,
                port: this.options.port || 102,
                rack: this.options.rack || 0,
                slot: this.options.slot || 1,
              },
              error: nextError,
            })
            reject(nextError)
            return
          }

          this.isConnected = true
          this.connectionLogger.log({
            protocol: 's7',
            event: 'connect',
            meta: {
              host: this.options.host,
              port: this.options.port || 102,
              rack: this.options.rack || 0,
              slot: this.options.slot || 1,
            },
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
    this.client.setTranslationCB((tag: string) => defs[tag])
    this.client.removeItems()
    this.client.addItems(Object.keys(defs))
  }

  async readAll<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(): Promise<T> {
    await this.connectIfNeeded()

    return new Promise<T>((resolve, reject) => {
      this.client.readAllItems((error: boolean, values: S7ReadValues) => {
        if (error) {
          this.isConnected = false
          const nextError = new Error(`S7 读取失败: ${String(error)}`)
          this.connectionLogger.log({
            protocol: 's7',
            event: 'read',
            meta: {
              host: this.options.host,
              success: false,
            },
            error: nextError,
          })
          reject(nextError)
          return
        }

        this.connectionLogger.log({
          protocol: 's7',
          event: 'read',
          meta: {
            host: this.options.host,
            success: true,
          },
        })
        resolve(values as T)
      })
    })
  }

  async writeItems(address: string | string[], value: unknown | unknown[]) {
    await this.connectIfNeeded()

    return new Promise<void>((resolve, reject) => {
      const callback = (error: boolean) => {
        if (error) {
          this.isConnected = false
          reject(new Error(`S7 写入失败: ${String(error)}`))
          return
        }

        resolve()
      }

      if (Array.isArray(address)) {
        this.client.writeItems(
          address,
          (Array.isArray(value) ? value : [value]) as S7WritableValue[],
          callback
        )
        return
      }

      this.client.writeItems(address, value as S7WritableValue, callback)
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
