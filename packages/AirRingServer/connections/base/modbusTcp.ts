import ModbusRTU from 'modbus-serial'
import {
  createConnectionLogger,
  type ConnectionLoggerOptions,
} from './connectionLogger'

type Task<T> = () => Promise<T>

export interface ModbusTcpClientOptions {
  url: string
  unitId?: number
  timeoutMs?: number
  reconnectDelayMs?: number
  logger?: ConnectionLoggerOptions
}

const parseUrl = (url: string) => {
  if (url.includes('://')) {
    const parsed = new URL(url)
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

export const createQueuedModbusTcpClient = ({
  url,
  unitId = 1,
  timeoutMs = 1000,
  reconnectDelayMs = 2000,
  logger,
}: ModbusTcpClientOptions) => {
  const client = new ModbusRTU()
  const connectionLogger = createConnectionLogger({
    source: logger?.source || `modbus/tcp:${url}`,
    ...logger,
  })

  let isConnected = false
  let hasBoundEvents = false
  let connectPromise: Promise<void> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const queue: Task<unknown>[] = []
  let running = false

  const { host, port } = parseUrl(url)

  const bindEvents = () => {
    if (hasBoundEvents) {
      return
    }

    hasBoundEvents = true

    client.on('close', () => {
      isConnected = false
    })

    client.on('error', (error) => {
      isConnected = false
      connectionLogger.log({
        protocol: 'modbus',
        event: 'connect_error',
        meta: {
          host,
          port,
          unitId,
          stage: 'socket',
        },
        error,
      })
      scheduleReconnect()
    })
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) {
      return
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect().catch(() => undefined)
    }, reconnectDelayMs)
  }

  const connect = async () => {
    if (isConnected) {
      return
    }

    if (connectPromise) {
      return connectPromise
    }

    connectPromise = (async () => {
      try {
        await client.connectTCP(host, { port })
        client.setID(unitId)
        client.setTimeout(timeoutMs)
        isConnected = true
        bindEvents()
        connectionLogger.log({
          protocol: 'modbus',
          event: 'connect',
          meta: { host, port, unitId },
        })
      } catch (error) {
        isConnected = false
        connectionLogger.log({
          protocol: 'modbus',
          event: 'connect_error',
          meta: { host, port, unitId },
          error,
        })
        scheduleReconnect()
        throw error
      } finally {
        connectPromise = null
      }
    })()

    return connectPromise
  }

  const enqueue = <T>(task: Task<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          await connect()
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      void runQueue()
    })
  }

  const runQueue = async () => {
    if (running) {
      return
    }

    running = true

    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) {
        continue
      }

      try {
        await task()
      } catch {
        // 错误已经在 enqueue 的 Promise 中向外抛出，这里无需重复处理
      }
    }

    running = false
  }

  const disconnect = async () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    connectPromise = null
    isConnected = false

    if (client.isOpen) {
      client.close(() => undefined)
    }
  }

  return {
    connect,
    disconnect,
    readHoldingRegisters: (address: number, length: number) => {
      return enqueue(async () => {
        const response = await client.readHoldingRegisters(address, length)
        return response.data
      })
    },
    readCoils: (address: number, length: number) => {
      return enqueue(async () => {
        const response = await client.readCoils(address, length)
        return response.data.map(Boolean)
      })
    },
    readInputRegisters: (address: number, length: number) => {
      return enqueue(async () => {
        const response = await client.readInputRegisters(address, length)
        return response.data
      })
    },
    readDiscreteInputs: (address: number, length: number) => {
      return enqueue(async () => {
        const response = await client.readDiscreteInputs(address, length)
        return response.data.map(Boolean)
      })
    },
    writeRegister: (address: number, value: number) => {
      return enqueue(() => client.writeRegister(address, value))
    },
    writeRegisters: (address: number, values: number[]) => {
      return enqueue(() => client.writeRegisters(address, values))
    },
    writeCoil: (address: number, value: boolean) => {
      return enqueue(() => client.writeCoil(address, value))
    },
  }
}
