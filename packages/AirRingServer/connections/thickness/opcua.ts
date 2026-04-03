import { RollerDevice, ThicknessDevice } from '@jjsk/core'
import { Client as OPCUAClient, OPCUAData } from '../base/opcua'

export type ThicknessData = OPCUAData & RollerDevice & ThicknessDevice
// ==================== 配置 ====================

const NODE_VALUE_MAP: Record<string, keyof ThicknessData> = {
  'ns=1;i=1002': 'HorizontalPulse',
  'ns=1;i=1003': 'LeftLimit',
  'ns=1;i=1004': 'RightLimit',
  'ns=1;i=1005': 'ResetSignal',
  'ns=1;i=1006': 'SwapDirection',
  'ns=1;i=1007': 'MotionDirection',
  'ns=1;i=1008': 'ProbeValue',
  'ns=1;i=1011': 'RollSpeedSignal',
}
export const Client = (url: string) => {
  return OPCUAClient<ThicknessData>({
    url,
    nodeIdValueMap: NODE_VALUE_MAP,
    logger: {
      source: 'thickness/opcua',
    },
  })
}
