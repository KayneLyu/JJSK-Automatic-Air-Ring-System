import {
  AttributeIds,
  ClientSession,
  ClientSubscription,
  coerceNodeId,
  OPCUAClient,
  TimestampsToReturn,
} from 'node-opcua'

// ==================== 配置 ====================
const endpointUrl = 'opc.tcp://localhost:4334' // 你的 OPC UA 服务器地址
const nodeIdList = [
  'ns=1;s=ThicknessGauge.X1_RightLimit',
  'ns=1;s=ThicknessGauge.X2_LeftLimit',
  'ns=1;s=ThicknessGauge.X3_RightLimit',
  'ns=1;s=ThicknessGauge.X10_ProductionSpeed',
] // 要监听的变量 nodeId

// ==================== 创建 OPC UA 客户端 ====================
const client = OPCUAClient.create({
  endpointMustExist: false,
})

// ==================== 变量存储（可选） ====================
const latestData = {}

// ==================== 主逻辑 ====================
export const runClient = async () => {
  try {
    console.log('📡 正在连接到 OPC UA 服务器:', endpointUrl)
    await client.connect(endpointUrl)
    console.log('✅ 连接成功！')

    // 创建会话
    const session = await client.createSession()
    console.log('🔐 会话创建成功')

    // 浏览节点以确认存在（可选）
    await browseNodes(session)

    // 创建订阅
    const subscription = await createSubscription(session)

    // 监听多个变量
    await monitorItems(subscription, nodeIdList)

    // 保持运行（Ctrl+C 退出）
    console.log('📈 客户端正在监听数据变化...\n')
  } catch (err) {
    console.error('❌ 客户端错误:', err.message || err)
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

// ==================== 监听多个变量 ====================
const monitorItems = async (
  subscription: ClientSubscription,
  nodeIds: string[]
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

  // 为每个变量绑定变化事件
  monitoredItems.on('changed', (_, dataValue, index) => {
    const nodeId = nodeIds[index]
    const value = dataValue.value.value

    // 更新本地缓存
    latestData[nodeId] = {
      value,
      timestamp: dataValue.serverTimestamp?.toISOString(),
    }

    // 格式化输出
    const formattedValue =
      typeof value === 'object' ? JSON.stringify(value) : value
    console.log(`🔄 [${new Date().toISOString()}] ${nodeId}`)
    console.log(`   值: ${formattedValue}`)
    console.log(`   时间: ${dataValue.serverTimestamp?.toISOString()}\n`)
  })
}

// ==================== 启动客户端 ====================

