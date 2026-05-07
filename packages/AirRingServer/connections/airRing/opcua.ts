import { Client as OPCUAClient } from '../base/opcua'
import { StatusCodes } from 'node-opcua'
import type { ConnectionLoggerOptions } from '../base/connectionLogger'
import type { RingData } from './types'

// ==================== 配置 ====================

const NODE_VALUE_MAP: Record<string, keyof RingData> = {
  'ns=1;i=1002': 'ForwardRotation',
  'ns=1;i=1003': 'ReverseRotation',
  'ns=1;i=1004': 'ForwardDirectionChange',
  'ns=1;i=1005': 'ReverseDirectionChange',
  'ns=1;i=1006': 'Reset',
  'ns=1;i=1007': 'MotorFrequency',
  'ns=1;i=1010': 'Heats',
}
export const Client = (url: string, logger?: ConnectionLoggerOptions) => {
  const { state, subscribe, testConnect, connect } = OPCUAClient<RingData>({
    url,
    nodeIdValueMap: NODE_VALUE_MAP,
    logger: {
      deviceType: 'airRing',
      deviceName: '风环',
      filePrefix: 'air-ring',
      ...logger,
      source: logger?.source || 'airRing/opcua',
    },
  })
  /**
   * 设置热量
   * */
  const setHeats = async () => {
    const session = await connect()
    if (session) {
      const result = await session.call({
        objectId: 'ns=1;s=1011',
        methodId: 'ns=1;s=SetHeats',
        inputArguments: [], // 空数组
      })
      return result.statusCode === StatusCodes.Good
    }
    return false
  }
  return {
    state,
    subscribe,
    testConnect,
    setHeats,
  }
}
