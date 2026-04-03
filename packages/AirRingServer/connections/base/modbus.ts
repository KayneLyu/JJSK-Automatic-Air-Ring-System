import { atom } from 'nanostores'
import ModbusRTU from 'modbus-serial'
import {
  ConnectionLoggerOptions,
  createConnectionLogger,
} from './connectionLogger'

export interface ModbusData extends Record<string, unknown> {
  timestamp?: number
}

export interface RegisterPoint<T extends ModbusData> {
  address: number
  kind?: 'holding' | 'input' | 'coil' | 'discrete'
  transform?: (raw: number | boolean) => T[keyof T]
}

export interface ClientOptions<T extends ModbusData> {
  /**
   * Modbus TCP 连接地址，支持：
   * - tcp://host:port
   * - modbus-tcp://host:port
   * - modbus://host:port
   * - host:port
   * */
  url: string
  /**
   * 地址与字段映射
   * */
  pointValueMap: Record<string, RegisterPoint<T>>
  /**
   * 站号
   * */
  unitId?: number
  /**
   * 订阅轮询间隔（毫秒）
   * */
  readIntervalMs?: number
  /**
   * 本地日志配置
   * */
  logger?: ConnectionLoggerOptions
}

export type ClientState =
  | {
      status: 'idle' | 'connecting' | 'disconnected'
    }
  | {
      status: 'connected'
      client: ModbusRTU
    }
  | {
      status: 'error'
      error?: Error
    }

const parseUrl = (url: string) => {
  if (url.includes('://')) {
    const parsed = new URL(url)
    const protocol = parsed.protocol
    const isTcpProtocol =
      protocol === 'tcp:' ||
      protocol === 'modbus-tcp:' ||
      protocol === 'modbus:'

    if (!isTcpProtocol) {
      throw new Error(`Unsupported Modbus protocol: ${protocol}`)
    }

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 502),
    }
  }

  const [host, portText] = url.split(':')
  return {
    host,
    port: Number(portText || 502),
  }
}

const shallowEqualData = <T extends ModbusData>(a?: T, b?: T) => {
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key] !== b[key]) return false
  }
  return true
}

// ==================== 主逻辑 ====================
export const Client = <T extends ModbusData>(options: ClientOptions<T>) => {
  const {
    url,
    pointValueMap,
    unitId = 1,
    readIntervalMs = 100,
    logger,
  } = options

  const connectionLogger = createConnectionLogger({
    source: logger?.source || `modbus:${url}`,
    ...logger,
  })

  const client = new ModbusRTU()

  const $clientState = atom<ClientState>({
    status: 'idle',
  })

  const connect = async () => {
    const state = $clientState.get()
    if (state.status === 'connected') return state.client
    if (state.status === 'connecting') {
      return new Promise<ModbusRTU>((resolve, reject) => {
        const unsub = $clientState.subscribe((s) => {
          if (s.status === 'connected') {
            unsub()
            resolve(s.client)
          } else if (s.status === 'error') {
            unsub()
            reject(s.error)
          }
        })
      })
    }

    $clientState.set({ status: 'connecting' })
    try {
      const { host, port } = parseUrl(url)
      await client.connectTCP(host, { port })
      client.setID(unitId)
      $clientState.set({ status: 'connected', client })
      connectionLogger.log({
        protocol: 'modbus',
        event: 'connect',
        meta: { url, unitId, host, port },
      })
      return client
    } catch (err) {
      $clientState.set({ status: 'error', error: err as Error })
      connectionLogger.log({
        protocol: 'modbus',
        event: 'connect_error',
        meta: { url, unitId },
        error: err,
      })
    }
  }

  const readPoint = async (
    connectedClient: ModbusRTU,
    point: RegisterPoint<T>
  ): Promise<number | boolean> => {
    const kind = point.kind || 'holding'
    if (kind === 'holding') {
      const { data } = await connectedClient.readHoldingRegisters(
        point.address,
        1
      )
      return data[0]
    }
    if (kind === 'input') {
      const { data } = await connectedClient.readInputRegisters(
        point.address,
        1
      )
      return data[0]
    }
    if (kind === 'coil') {
      const { data } = await connectedClient.readCoils(point.address, 1)
      return Boolean(data[0])
    }
    const { data } = await connectedClient.readDiscreteInputs(point.address, 1)
    return Boolean(data[0])
  }

  const read = async () => {
    const connectedClient = await connect()
    if (!connectedClient) return

    const res = {} as T
    const pointKeys = Object.keys(pointValueMap)
    for (const key of pointKeys) {
      const point = pointValueMap[key]
      const rawValue = await readPoint(connectedClient, point)
      const value = point.transform ? point.transform(rawValue) : rawValue
      res[key as keyof T] = value as T[keyof T]
    }
    res.timestamp = Date.now()
    connectionLogger.log({
      protocol: 'modbus',
      event: 'read',
      meta: { url, unitId },
      data: res,
    })
    return res
  }

  const subscribe = async (listener: (value: T, oldValue?: T) => void) => {
    let oldValue: T | undefined
    let timer: ReturnType<typeof setInterval> | undefined

    const poll = async () => {
      try {
        const newValue = await read()
        if (!newValue) return
        if (shallowEqualData(newValue, oldValue)) return
        connectionLogger.log({
          protocol: 'modbus',
          event: 'subscribe',
          meta: { url, unitId },
          data: newValue,
        })
        listener(newValue, oldValue)
        oldValue = newValue
      } catch (error) {
        $clientState.set({ status: 'error', error: error as Error })
        connectionLogger.log({
          protocol: 'modbus',
          event: 'subscribe_error',
          meta: { url, unitId },
          error,
        })
      }
    }

    await poll()
    timer = setInterval(poll, readIntervalMs)

    return () => {
      if (timer) {
        clearInterval(timer)
      }
    }
  }

  const testConnect = async () => {
    const tester = new ModbusRTU()
    try {
      const { host, port } = parseUrl(url)
      await tester.connectTCP(host, { port })
      tester.setID(unitId)
      connectionLogger.log({
        protocol: 'modbus',
        event: 'test_connect',
        meta: { url, unitId, host, port },
      })
      return true
    } catch (error) {
      connectionLogger.log({
        protocol: 'modbus',
        event: 'test_connect_error',
        meta: { url, unitId },
        error,
      })
      return false
    } finally {
      if (tester.isOpen) {
        tester.close()
      }
    }
  }

  return {
    state: $clientState,
    connect,
    testConnect,
    subscribe,
    read,
  }
}
