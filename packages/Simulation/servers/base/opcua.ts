// ==================== 1. 配置 OPC UA 服务器 ====================
import { nodesets, OPCUAServer, UAObjectType } from 'node-opcua'
import { AddressSpace, UAVariable } from 'node-opcua-address-space'

export interface StartServerOptions {
  port: number
  createModel: (
    addressSpace: AddressSpace,
    deviceType: UAObjectType
  ) => Promise<Record<string, UAVariable>>
}

const updateVariables = <T extends Record<string, unknown>>(
  variablesMap: Record<string, UAVariable>,
  variables: T
) => {
  for (const [name, val] of Object.entries(variables)) {
    const node = variablesMap[name]
    node.setValueFromSource({ value: val })
  }
}
export const startServer = async (options: StartServerOptions) => {
  const { port, createModel } = options
  const server = new OPCUAServer({
    port,
    host: 'localhost',
    nodeset_filename: [nodesets.standard, nodesets.di],
  })
  await server.initialize()
  const addressSpace = server.engine.addressSpace
  if (!addressSpace) throw new Error('No address space provided')
  const nsDI = addressSpace.getNamespaceIndex('http://opcfoundation.org/UA/DI/')
  if (nsDI < 0) throw new Error('No NS DI foundation found')
  const deviceType = addressSpace.findObjectType('DeviceType', nsDI)
  if (!deviceType) throw new Error('No device type')
  const variablesMap = await createModel(addressSpace, deviceType)
  try {
    await server.start()
    console.log(`🚀 OPC UA 服务器已启动`)
    console.log(`🌐 端口: ${server.endpoints[0].port}`)
    console.log(
      `🔗 客户端连接地址: ${server.endpoints[0].endpointDescriptions()[0].endpointUrl}`
    )

    return {
      updateVariables: <T extends Record<string, unknown>>(value: T) => {
        return updateVariables(variablesMap, value)
      },
    }
  } catch (err) {
    console.error('❌ 启动失败:', err)
    throw err
  }
}
