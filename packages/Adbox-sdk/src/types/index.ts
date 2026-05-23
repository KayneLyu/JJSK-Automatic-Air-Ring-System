export interface ADBoxOptions {
  host: string
  port: number
  reconnect?: boolean
  reconnectInterval?: number
  heartbeatInterval?: number
  timeout?: number
}

export interface ADData {

  systick: number

  adChannels: number[]

  encoder0?: number

  encoder1?: number

  inputs?: number

  /**
   * 输入位发生变化
   */
  inputChanges?: number

  outputs?: number

  reset?: boolean
}

export enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  RECONNECTING
}

export interface CommandResponse {

  /**
   * 原始数据
   */
  raw: Buffer

  /**
   * ASCII命令
   */
  command: string

  /**
   * 命令参数
   */
  payload: Buffer

  /**
   * 是否成功
   */
  success: boolean
}