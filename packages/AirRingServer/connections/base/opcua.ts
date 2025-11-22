import {
  AttributeIds,
  ClientSession,
  ClientSubscription,
  coerceNodeId,
  OPCUAClient,
  ReadValueIdOptions,
  TimestampsToReturn,
} from 'node-opcua'
import { atom } from 'nanostores'

export interface OPCUAData extends Record<string, unknown> {
  timestamp?: number
}

export interface ClientOptions<T extends OPCUAData> {
  /**
   * 连接地址
   * */
  url: string
  /**
   * nodeId与数据映射表
   * */
  nodeIdValueMap: Record<string, keyof T>
}

// 定义可订阅的状态
export type ClientState =
  | {
      status: 'idle' | 'connecting' | 'disconnected'
    }
  | {
      status: 'connected'
      session: ClientSession
    }
  | {
      status: 'error'
      error?: Error
    }

// ==================== 主逻辑 ====================
export const Client = <T extends OPCUAData>(options: ClientOptions<T>) => {
  // ==================== 创建 OPC UA 客户端 ====================
  const client = OPCUAClient.create({
    endpointMustExist: false,
  })

  const { url, nodeIdValueMap } = options

  const $clientState = atom<ClientState>({
    status: 'idle',
  })

  /**
   * 连接到服务器
   * */
  const connect = async () => {
    const state = $clientState.get()
    if (state.status === 'connected') return state.session
    if (state.status === 'connecting') {
      // 返回一个等待状态变更的 promise（或者缓存 promise，同上）
      return new Promise<ClientSession>((resolve, reject) => {
        const unsub = $clientState.subscribe((s) => {
          if (s.status === 'connected') {
            unsub()
            resolve(s.session)
          } else if (s.status === 'error') {
            unsub()
            reject(s.error)
          }
        })
      })
    }

    $clientState.set({ status: 'connecting' })
    try {
      console.log('📡 正在连接到 OPC UA 服务器:', url)
      await client.connect(url)
      console.log('✅ 连接成功！')
      const session = await client.createSession()
      console.log('🔐 会话创建成功')
      $clientState.set({ status: 'connected', session })
      return session
    } catch (err) {
      console.error('❌ 连接失败:', (err as Error).message || err)
      $clientState.set({ status: 'error', error: err as Error })
    }
  }
  /**
   * 订阅数据
   * */
  const subscribe = async (listener: (value: T, oldValue?: T) => void) => {
    // 创建订阅
    const session = await connect()
    if (session) {
      const subscription = await createSubscription(session)
      await monitorItems<T>(subscription, nodeIdValueMap, listener)
    }
  }
  /**
   * 读取数据
   * */
  const read = async () => {
    const nodeIds = Object.keys(nodeIdValueMap)
    const nodesToRead = nodeIds.map<ReadValueIdOptions>((nodeId) => ({
      nodeId: nodeId,
      attributeId: AttributeIds.Value,
    }))
    const session = await connect()
    if (session) {
      const dataValues = await session.read(
        nodesToRead,
        TimestampsToReturn.Both
      )

      const res = {} as T
      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i]
        const dataValue = dataValues[i]
        res[nodeIdValueMap[nodeId]] = dataValue.value?.value
        res['timestamp'] = dataValue.serverTimestamp?.getTime()
      }
      return res
    }
  }
  /**
   * 测试连接
   * */
  const testConnect = async () => {
    console.log('📡 正在连接到 OPC UA 服务器:', url)
    try {
      await client.connect(url)
      console.log('✅ 连接成功！')
      return true
    } catch (err) {
      console.error('❌ 连接失败:', (err as Error).message || err)
      return false
    } finally {
      await client.disconnect()
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

// ==================== 创建订阅 ====================
const createSubscription = async (session: ClientSession) => {
  const subscription = await session.createSubscription2({
    requestedPublishingInterval: 1, // 每 1s 发布一次
    requestedLifetimeCount: 100, // 生命周期
    requestedMaxKeepAliveCount: 10,
    publishingEnabled: true,
    priority: 10,
  })

  console.log('📋 订阅创建成功，发布间隔: 1ms')

  // 订阅关闭事件
  subscription.on('started', () => {
    console.log('🟢 订阅已启动，开始接收数据...\n')
  })

  subscription.on('keepalive', () => {
    console.log('💓 Keep-Alive')
  })

  subscription.on('terminated', () => {
    console.log('🛑 订阅已终止')
  })

  return subscription
}

// ==================== 监听多个变量 ====================
const monitorItems = async <T extends OPCUAData>(
  subscription: ClientSubscription,
  nodeIdValueMap: Record<string, keyof T>,
  listener: (value: T, oldValue?: T) => void
) => {
  const nodeIds = Object.keys(nodeIdValueMap)
  const itemsToMonitor: ReadValueIdOptions[] = nodeIds.map((nodeId) => ({
    nodeId: coerceNodeId(nodeId),
    attributeId: AttributeIds.Value,
  }))

  const monitoredItems = await subscription.monitorItems(
    itemsToMonitor,
    {
      samplingInterval: 10,
      filter: null,
      queueSize: 10,
    },
    TimestampsToReturn.Both
  )

  console.log(`👀 已开始监控 ${nodeIds.length} 个变量：`)
  nodeIds.forEach((id) => console.log(`   📌 ${id}`))
  let oldValue: T | undefined = undefined
  // 为每个变量绑定变化事件
  monitoredItems.on('changed', (_, dataValue, index) => {
    const nodeId = nodeIds[index]
    const value = dataValue.value.value

    const newValue = {
      ...(oldValue || {}),
      [nodeIdValueMap[nodeId]]: value,
      timestamp: dataValue.serverTimestamp?.getTime(),
    } as T
    listener(newValue, oldValue)
    oldValue = newValue

    // 格式化输出
    const formattedValue =
      typeof value === 'object' ? JSON.stringify(value) : value
    console.log(`🔄 [${new Date().toISOString()}] ${nodeId}`)
    console.log(`   值: ${formattedValue}`)
    console.log(`   时间: ${dataValue.serverTimestamp?.toISOString()}\n`)
  })
}
