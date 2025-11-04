import { Client as OPCUAClient, OPCUAData } from '../base/opcua'

export interface ThickNessData extends OPCUAData {
  leftLimit?: boolean // 左限位
  rightLimit?: boolean // 右限位
}
// ==================== 配置 ====================

const NODE_VALUE_MAP: Record<string, keyof ThickNessData> = {
  'ns=1;s=X1_RightLimit': 'rightLimit',
  'ns=1;s=X2_LeftLimit': 'leftLimit',
}
export const Client = (url: string) => {
  return OPCUAClient<ThickNessData>({
    url,
    nodeIdValueMap: NODE_VALUE_MAP,
  })
}
