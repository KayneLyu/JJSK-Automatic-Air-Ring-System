import { Client as OPCUAClient, OPCUAData } from '../base/opcua'

export interface ThickNessData extends OPCUAData {
  /**
   * 横向脉冲计数 数值增加=前进，反之后退
   * 表示当前横向位置的脉冲累计
   * */
  HorizontalPulse?: number
  /**
   * 左限位信号
   * 表示是否触发左端限位开关（true 为已触发）
   * */
  LeftLimit?: boolean
  /**
   * 右限位信号
   * 表示是否触发右端限位开关（true 为已触发）
   * */
  RightLimit?: boolean
  /**
   * 归零信号
   * 表示是否检测到归零点（原点）触发（true 为触发）
   * */
  ResetSignal?: boolean
  /**
   * 换向信号
   * 表示方向切换触发（true 为换向发生）
   * */
  SwapDirection?: boolean
  /**
   * 运动方向
   * 表示当前运动方向（true 为正向/向右，false 为反向/向左）
   * */
  MotionDirection?: boolean
  /**
   * 探头测量值
   * 表示当前探头检测的厚度值（单位：μm）
   * */
  ProbeValue?: number
  /**
   * 辊速信号
   * 表示当前辊速信号状态（true 转过一圈，false 未到接触点）
   * */
  RollSpeedSignal?: number // 辊速信号
}
// ==================== 配置 ====================

const NODE_VALUE_MAP: Record<string, keyof ThickNessData> = {
  'ns=1;i=1002': 'HorizontalPulse',
  'ns=1;i=1003': 'LeftLimit',
  'ns=1;i=1004': 'RightLimit',
  'ns=1;i=1005': 'ResetSignal',
  'ns=1;i=1006': 'SwapDirection',
  'ns=1;i=1007': 'MotionDirection',
  'ns=1;i=1008': 'ProbeValue',
  'ns=1;i=1009': 'RollSpeedSignal',
}
export const Client = (url: string) => {
  return OPCUAClient<ThickNessData>({
    url,
    nodeIdValueMap: NODE_VALUE_MAP,
  })
}
