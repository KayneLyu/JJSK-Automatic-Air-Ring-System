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

// 定义所有 IPC 通道、参数、返回值类型
export interface IpcChannelMap {
  // 格式：[通道名]: [发送参数类型, 回调/接收参数类型]
  "win-minimize": { args: [], output: void }; // 最小化
  "win-maximize": { args: [], output: void }; // 最大化
  "win-close": { args: [], output: void }; // 退出程序
  "win-toggle-fullscreen": { args: [], output: void }; // 全屏
  "win-get-logo": { args: [], output: string | undefined }; // 获取logo
  "win-open-client": { args: [], output: boolean }; //打开客户端
  "change-State": { args: [message: IMessage], output: void }; // 改变测厚仪状态
  "plc-controlData": { args: [data: IPlcControlData], output: [data: IPlcControlResult] };
}

// IPC 通道名
export type IpcChannelName = keyof IpcChannelMap;

// 对应通道的参数类型
export type IpcChannelArgs<T extends IpcChannelName> = IpcChannelMap[T]['args'];
// 对应通道的返回值类型
export type IpcChannelOutput<T extends IpcChannelName> = IpcChannelMap[T]['output'];