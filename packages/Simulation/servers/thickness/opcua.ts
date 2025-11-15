import { DataType, UAObjectType } from 'node-opcua'
import { startServer as StartOPCUAServer } from '../base/opcua'
import { AddressSpace } from 'node-opcua-address-space'
import { printNodeTree } from '../../utils/printNodeTree'

const createModel = async (
  addressSpace: AddressSpace,
  deviceType: UAObjectType
) => {
  const ns = addressSpace.getOwnNamespace()
  const ThicknessDeviceType = ns.addObjectType({
    browseName: 'ThicknessDeviceType',
    subtypeOf: deviceType,
  })
  const ParameterSet = ns.addObject({
    browseName: 'ParameterSet',
    componentOf: ThicknessDeviceType,
  })
  // 横扫测厚仪
  const HorizontalPulse = ns.addVariable({
    browseName: 'HorizontalPulse',
    componentOf: ParameterSet,
    dataType: DataType.Double,
    description:
      '横向脉冲计数 数值增加=前进，反之后退\n表示当前横向位置的脉冲累计',
  })
  const LeftLimit = ns.addVariable({
    browseName: 'LeftLimit',
    componentOf: ParameterSet,
    dataType: DataType.Boolean,
    description: '左限位信号，表示是否触发左端限位开关（true 为已触发）',
  })
  const RightLimit = ns.addVariable({
    browseName: 'RightLimit',
    componentOf: ParameterSet,
    dataType: DataType.Boolean,
    description: '右限位信号，表示是否触发右端限位开关（true 为已触发）',
  })
  const ResetSignal = ns.addVariable({
    browseName: 'ResetSignal',
    componentOf: ParameterSet,
    dataType: DataType.Boolean,
    description: '归零信号，表示是否检测到归零点（原点）触发（true 为触发）',
  })
  const SwapDirection = ns.addVariable({
    browseName: 'SwapDirection',
    componentOf: ParameterSet,
    dataType: DataType.Boolean,
    description: '换向信号，表示方向切换触发（true 为换向发生）',
  })
  const MotionDirection = ns.addVariable({
    browseName: 'MotionDirection',
    componentOf: ParameterSet,
    dataType: DataType.Boolean,
    description:
      '运动方向，表示当前运动方向（true 为正向/向右，false 为反向/向左）',
  })
  const ProbeValue = ns.addVariable({
    browseName: 'ProbeValue',
    componentOf: ParameterSet,
    dataType: DataType.Double,
    description: '运动方向，表示当前探头检测的厚度值（单位：μm）',
  })
  const RollSpeedSignal = ns.addVariable({
    browseName: 'RollSpeedSignal',
    componentOf: ParameterSet,
    dataType: DataType.Double,
    description:
      '辊速信号，表示当前辊速信号状态（true 转过一圈，false 未到接触点）',
  })

  printNodeTree(ThicknessDeviceType)
  return {
    HorizontalPulse,
    LeftLimit,
    RightLimit,
    ResetSignal,
    SwapDirection,
    MotionDirection,
    ProbeValue,
    RollSpeedSignal,
  }
}

const startServer = async () => {
  const { updateVariables } = await StartOPCUAServer({
    port: 4334,
    createModel,
  })
  return {
    updateVariables,
  }
}

export { startServer }
