import { Client as OPCUAClient, OPCUAData } from '../base/opcua'
import { StatusCodes } from 'node-opcua'

export interface RingData extends OPCUAData {
  /**
   * 正向旋转信号
   * 表示是否处于正向旋转状态
   * */
  ForwardRotation?: boolean
  /**
   * 反向旋转信号
   * 表示是否处于反向旋转状态
   * */
  ReverseRotation?: boolean
  /**
   * 正换向信号
   * 表示正向换向触发
   * */
  ForwardDirectionChange?: boolean
  /**
   * 反换向信号
   * 表示反向换向触发
   * */
  ReverseDirectionChange?: boolean
  /**
   * 复位信号
   * 表示复位触发
   * */
  Reset?: boolean
  /**
   * 电机频率- 旋转速度
   * 表示电机当前频率（单位：Hz）
   * */
  MotorFrequency?: number
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
  }
  return {
    state,
    subscribe,
    testConnect,
    setHeats,
  }
}
