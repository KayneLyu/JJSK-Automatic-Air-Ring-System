import { Client as OPCUAClient, OPCUAData } from '../base/opcua'
import { StatusCodes } from 'node-opcua'

export interface RingData extends OPCUAData {
  leftLimit?: boolean // 左限位
  rightLimit?: boolean // 右限位
  angleRange?: number // 角度
}
// ==================== 配置 ====================

const NODE_VALUE_MAP: Record<string, keyof RingData> = {
  'ns=1;s=X1_RightLimit': 'rightLimit',
  'ns=1;s=X2_LeftLimit': 'leftLimit',
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
        objectId: 'ns=1;s=ThicknessGauge',
        methodId: 'ns=1;s=StopScan',
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
