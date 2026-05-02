import { IPlcControlData } from '@/types/ipc';
type IMessage = { address: string; value: number | string | boolean }
export type IPlcControlData = {
  FWD: string // "DB4,X0.0",
  REV: string // "DB4,X0.1",
  STOP: string //"DB4,X0.2",
  HOME: string // "DB4,X0.3",
  MEASURE: string // "DB4,X0.4",
}

export type IPlcControlResult = {
  FWD: boolean // "DB4,X0.0",
  REV: boolean // "DB4,X0.1",
  STOP: boolean //"DB4,X0.2",
  HOME: boolean // "DB4,X0.3",
  MEASURE: boolean // "DB4,X0.4",
}

export type IPlcParamData = {
  // 硬件
  frameLength: string, // 机架长度
  rollerCircumference: string, // 测速棍周长
  encoderRatio: string, // 编码器1比例
  motorPulse: string, // 电机脉冲
  codePulse: string, // 编码脉冲
  zeroOffset: string, // 零位偏移
  // adDelay: 'DB4,X0.6'
  // 速度
  scanSpeed: string, // 扫描速度
  sampleSpeed: string, // 采样速度
  debugSpeed: string, // 调试速度
  startSpeed: string, // 开始速度
  resetSpeed1: string, // 归零速度1
  resetSpeed2: string, // 归零速度2
  accelTime: string, // 加速时间
  decelTime: string, // 减速时间
  // 采样
  sampleInterval: string, // 采样间隔
  samplePosition: string, // 采样位置
  sampleRadius: string // 采样半径
}

export type IPollingModBusData = {
  timestamps: number[],
  adValues: number[],
  pulses: number[]
}

// 定义所有 IPC 通道、参数、返回值类型
export interface IpcChannelMap {
  // 格式：[通道名]: [发送参数类型, 回调/接收参数类型]
  "win-minimize": { args: [], output: void }; // 最小化
  "win-maximize": { args: [], output: void }; // 最大化
  "win-close": { args: [], output: void }; // 退出程序
  "win-toggle-fullscreen": { args: [], output: void }; // 全屏
  "win-get-logo": { args: [], output: string | undefined }; // 获取logo
  "win-open-client": { args: [], output: boolean | undefined}; //打开客户端
  "change-State": { args: [message: IMessage], output: void }; // 改变测厚仪状态
  "plc-controlData": { args: [data: IPlcControlResult], output: [data: IPlcControlResult] }; // 轮询运行状态
  "plc-paramData": { args: [data: IPlcParamData], output: [] }; // 获取S7控制参数
  "ModBus-read": {args: [data: IPollingModBusData], output: [data: IPollingModBusData] } ; // 获取modbus轮询数据
}

// IPC 通道名
export type IpcChannelName = keyof IpcChannelMap;

// 对应通道的参数类型
export type IpcChannelArgs<T extends IpcChannelName> = IpcChannelMap[T]['args'];
// 对应通道的返回值类型
export type IpcChannelOutput<T extends IpcChannelName> = IpcChannelMap[T]['output'];