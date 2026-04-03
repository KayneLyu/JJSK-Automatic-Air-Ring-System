import { Client as OPCUAClient, OPCUAData } from '../base/opcua'
import { StatusCodes } from 'node-opcua'
import { UpperRotationDevice } from '@jjsk/core'

export type RingData = OPCUAData &
  UpperRotationDevice & {
    /**
     * 风环热量
     * */
    Heats?: number[]
  }

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
export const Client = (url: string) => {
  const { state, subscribe, testConnect, connect } = OPCUAClient<RingData>({
    url,
    nodeIdValueMap: NODE_VALUE_MAP,
    logger: {
      source: 'airRing/opcua',
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
