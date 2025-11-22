import { startServer as StartOPCUAServer } from '../base/opcua'
import { AddressSpace } from 'node-opcua-address-space'
import { DataType, UAObjectType } from 'node-opcua'
import { printNodeTree } from '../../utils/printNodeTree'

const createModel = async (
  addressSpace: AddressSpace,
  deviceType: UAObjectType
) => {
  const ns = addressSpace.getOwnNamespace()

  // ======上旋系统
  const UpperRotationDeviceType = ns.addObjectType({
    browseName: 'UpperRotationDeviceType',
    subtypeOf: deviceType,
  })
  const UpperRotationParameterSet = ns.addObject({
    browseName: 'ParameterSet',
    componentOf: UpperRotationDeviceType,
  })
  const ForwardRotation = ns.addVariable({
    browseName: 'ForwardRotation',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Boolean,
    description: '正向旋转信号, 表示是否处于正向旋转状态',
  })

  const ReverseRotation = ns.addVariable({
    browseName: 'ReverseRotation',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Boolean,
    description: '反向旋转信号,表示旋转架是否处于反向旋转状态',
  })

  const ForwardDirectionChange = ns.addVariable({
    browseName: 'ForwardDirectionChange',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Boolean,
    description: '正换向信号 ,表示旋转架是否处于正换向触发',
  })

  const ReverseDirectionChange = ns.addVariable({
    browseName: 'ReverseDirectionChange',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Boolean,
    description: '反换向信号 ,表示旋转架是否处于反向换向触发',
  })

  const Reset = ns.addVariable({
    browseName: 'Reset',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Boolean,
    description: '复位信号 ,表示旋转架是否处于复位状态',
  })

  const MotorFrequency = ns.addVariable({
    browseName: 'MotorFrequency',
    componentOf: UpperRotationParameterSet,
    dataType: DataType.Double,
    description: '电机频率（变频器) , 表示旋转架当前转速',
  })
  // ======风环系统
  const AirRingDeviceType = ns.addObjectType({
    browseName: 'AirRingDeviceType',
    subtypeOf: deviceType,
  })
  const AirRingParameterSet = ns.addObject({
    browseName: 'ParameterSet',
    componentOf: AirRingDeviceType,
  })
  const Heats = ns.addVariable({
    browseName: 'Heats',
    componentOf: AirRingParameterSet,
    dataType: DataType.Double,
    valueRank: 1,
    description: '风环热量',
  })
  const AirRingMethodSet = ns.addObject({
    browseName: 'MethodSet',
    componentOf: AirRingDeviceType,
  })
  const SetHeats = ns.addMethod(AirRingMethodSet, {
    browseName: 'SetHeats',
    description: '设置风环热量',
    inputArguments: [
      {
        name: 'values',
        description: { text: '风环热量' },
        dataType: DataType.Double, // 基础类型
        valueRank: 1, // 1 表示一维数组；-1 表示标量；>=0 表示数组维度
        arrayDimensions: [0], // 可选，[0] 表示长度不限（动态数组）
      },
    ],
  })
  printNodeTree(UpperRotationDeviceType)
  printNodeTree(AirRingDeviceType)
  return {
    ForwardRotation,
    ReverseRotation,
    ForwardDirectionChange,
    ReverseDirectionChange,
    Reset,
    MotorFrequency,
    Heats,
  }
}
const startServer = async () => {
  const { updateVariables } = await StartOPCUAServer({
    port: 4344,
    createModel,
  })
  return {
    updateVariables,
  }
}

export { startServer }
