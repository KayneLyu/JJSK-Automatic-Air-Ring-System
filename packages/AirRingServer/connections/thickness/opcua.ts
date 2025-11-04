import {
  AttributeIds,
  ClientSession,
  ClientSubscription,
  coerceNodeId,
  OPCUAClient,
  TimestampsToReturn,
} from 'node-opcua'
import { atom } from 'nanostores'

export interface ThickNessData {
  leftLimit?: boolean // 左限位
  rightLimit?: boolean // 右限位
  timestamp?: string
}
// ==================== 配置 ====================

const nodeIdList = [
  'ns=1;s=X1_RightLimit',
  'ns=1;s=X2_LeftLimit',
  'ns=1;s=X3_RightLimit',
  'ns=1;s=X10_ProductionSpeed',
] // 要监听的变量 nodeId

// ==================== 创建 OPC UA 客户端 ====================
const client = OPCUAClient.create({
  endpointMustExist: false,
})

// ==================== 测试连接 ====================
const tryConnect = async (url: string) => {
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
// 定义可订阅的状态
type ClientState =
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
export const Client = (url: string) => {
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
      browseNodes(session)
      return session
    } catch (err) {
      console.error('❌ 连接失败:', (err as Error).message || err)
      $clientState.set({ status: 'error', error: err as Error })
    }
  }
  const subscribe = async (
    listener: (value: ThickNessData, oldValue?: ThickNessData) => void
  ) => {
    // 创建订阅
    const session = await connect()
    if (session) {
      const subscription = await createSubscription(session)
      await monitorItems(subscription, nodeIdList, listener)
    }
  }
  const testConnect = () => {
    return tryConnect(url)
  }
  return {
    testConnect,
    subscribe,
  }
}

// ==================== 浏览节点（调试用） ====================
const browseNodes = async (session: ClientSession) => {
  const browseResults = await session.browse('RootFolder')
  console.log('🔍 服务器根节点包含:')
  browseResults.references?.forEach((ref) => {
    console.log(`  → ${ref.displayName.text} [${ref.nodeId.toString()}]`)
  })
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

const NODE_VALUE_MAP: Record<string, keyof ThickNessData> = {
  'ns=1;s=X1_RightLimit': 'rightLimit',
  'ns=1;s=X2_LeftLimit': 'leftLimit',
}
// ==================== 监听多个变量 ====================
const monitorItems = async (
  subscription: ClientSubscription,
  nodeIds: string[],
  listener: (value: ThickNessData, oldValue?: ThickNessData) => void
) => {
  const itemsToMonitor = nodeIds.map((nodeId) => ({
    nodeId: coerceNodeId(nodeId),
    attributeId: AttributeIds.Value,
    samplingInterval: 1, // 每 500ms 采样一次
    discardOldest: true,
    queueSize: 1,
  }))

  const monitoredItems = await subscription.monitorItems(
    itemsToMonitor,
    {
      samplingInterval: 500,
      filter: null,
      queueSize: 1,
    },
    TimestampsToReturn.Source
  )

  console.log(`👀 已开始监控 ${nodeIds.length} 个变量：`)
  nodeIds.forEach((id) => console.log(`   📌 ${id}`))
  console.log('')

  let oldValue: ThickNessData | undefined = undefined
  // 为每个变量绑定变化事件
  monitoredItems.on('changed', (_, dataValue, index) => {
    const nodeId = nodeIds[index]
    const value = dataValue.value.value

    const newValue: ThickNessData = {
      ...(oldValue || {}),
      [NODE_VALUE_MAP[nodeId]]: value,
      timestamp: dataValue.serverTimestamp?.toISOString(),
    }
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
