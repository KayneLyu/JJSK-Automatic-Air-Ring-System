import { Variant, OPCUAServer, nodesets, DataType } from 'node-opcua'

// ==================== 1. 配置 OPC UA 服务器 ====================
const server = new OPCUAServer({
  port: 4334,
  host: 'localhost',
  nodeset_filename: [nodesets.standard],
})

// ==================== 2. 模拟测厚仪数据 ====================
const thicknessData = {
  X2: false, // 左限位
  X3: false, // 右限位
  X10: 0, // 生产速度 (rpm 或 pps)
  A_minus: true, // A轴方向
  B_minus: false, // B轴方向
  SP: false, // 驱动器使能信号
  S1: false, // 探头信号
  // 其他上旋信号（例如 X1, X4, X5, X11 等）
  X1: true,
  X4: false,
  X5: true,
  X11: false,
}

// 更新数据的模拟函数
const updateThicknessData = () => {
  // 模拟一些变化
  thicknessData.X2 = Math.random() > 0.8
  thicknessData.X3 = Math.random() > 0.8
  thicknessData.X10 = Math.floor(Math.random() * 1000) // 0~999 rpm
  thicknessData.A_minus = !thicknessData.A_minus
  thicknessData.B_minus = !thicknessData.B_minus
  thicknessData.SP = Math.random() > 0.5
  thicknessData.S1 = Math.random() > 0.7

  // 更新其他上旋信号
  thicknessData.X1 = Math.random() > 0.9
  thicknessData.X4 = Math.random() > 0.9
  thicknessData.X5 = Math.random() > 0.9
  thicknessData.X11 = Math.random() > 0.9

  // console.log(
  //   `[模拟数据] X10速度: ${thicknessData.X10}, X2: ${thicknessData.X2}, S1: ${thicknessData.S1}`
  // )
}

// ==================== 3. 构建 OPC UA 地址空间 ====================
const initialize = async () => {
  const addressSpace = server.engine.addressSpace
  if (!addressSpace) return
  const namespace = addressSpace.getOwnNamespace()

  // 创建测厚仪对象
  const gauge = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    nodeId: 'ns=1;s=ThicknessGauge', // 显式指定 nodeId
    browseName: 'ThicknessGauge',
  })

  // 添加各个变量
  const rightLimit = namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=X1_RightLimit',
    browseName: 'X1_右限位',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.X1,
        }),
    },
  })
  const leftLimit = namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=X2_LeftLimit',
    browseName: 'X2_左限位',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.X2,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=X3_RightLimit',
    browseName: 'X3_右限位',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.X3,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=X10_ProductionSpeed',
    browseName: 'X10_生产速度',
    dataType: 'UInt16',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.UInt16,
          value: thicknessData.X10,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=A_minus_Direction',
    browseName: 'A_方向信号',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.A_minus,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=B_minus_Direction',
    browseName: 'B_方向信号',
    dataType: DataType.Boolean,
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.B_minus,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=SP_DriveSignal',
    browseName: 'SP_驱动器信号',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.SP,
        }),
    },
  })

  namespace.addVariable({
    componentOf: gauge,
    nodeId: 'ns=1;s=S1_ProbeSignal',
    browseName: 'S1_探头信号',
    dataType: 'Boolean',
    value: {
      get: () =>
        new Variant({
          dataType: DataType.Boolean,
          value: thicknessData.S1,
        }),
    },
  })

  // 动态添加其他上旋信号（X 开头的）
  Object.keys(thicknessData).forEach((key) => {
    if (key.startsWith('X') && !['X2', 'X3', 'X10'].includes(key)) {
      namespace.addVariable({
        componentOf: gauge,
        nodeId: `ns=1;s=${key}_UpperSignal`,
        browseName: `${key}_上旋信号`,
        dataType: 'Boolean',
        value: {
          get: () =>
            new Variant({
              dataType: DataType.Boolean,
              value: thicknessData[key as keyof typeof thicknessData],
            }),
        },
      })
    }
  })

  console.log('OPC UA 服务器地址空间构建完成')
  // 每 1ms 秒更新一次数据
  setInterval(() => {
    updateThicknessData()
    rightLimit.setValueFromSource(
      new Variant({
        dataType: DataType.Boolean,
        value: thicknessData.X1,
      })
    )
    leftLimit.setValueFromSource(
      new Variant({
        dataType: DataType.Boolean,
        value: thicknessData.X2,
      })
    )
  }, 1)
}

// ==================== 4. 启动服务器 ====================
const startServer = async () => {
  await server.initialize()
  await initialize()
  try {
    await server.start()
    console.log(`🚀 测厚仪 OPC UA 服务器已启动`)
    console.log(`🌐 端口: ${server.endpoints[0].port}`)
    console.log(
      `🔗 客户端连接地址: ${server.endpoints[0].endpointDescriptions()[0].endpointUrl}`
    )
  } catch (err) {
    console.error('❌ 启动失败:', err)
  }
}

export { startServer }
