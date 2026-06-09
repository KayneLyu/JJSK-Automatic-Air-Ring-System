export interface PushData {
  sysTick: number
  ad0: number
  ad1?: number
  in?: number
  inChange?: number
  out?: number
  pos0?: number // 32位扩展值
  pos1?: number
  pos0Raw?: number // 原始16位
  pos1Raw?: number
  reset: boolean
}

export interface RunResult {
  status: number
  serial: number
}

export interface PendingRequest {
  resolve: (resp: Buffer) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
  retries: number
  expectedPrefix: Buffer // 用于匹配响应
  commandData: Buffer // 不含B0的完整命令
}
