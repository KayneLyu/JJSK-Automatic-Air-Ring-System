// 客户端构造配置
export interface ADBoxOptions {
  host?: string;             // 默认 '192.168.251.12'
  port?: number;             // 默认 20021
  connectTimeout?: number;   // 连接超时 ms，默认 5000
  autoReconnect?: boolean;   // 断线自动重连，默认 false
  reconnectInterval?: number;// 重连间隔 ms，默认 3000
  pushTimeout?: number;      // 推送看门狗超时 ms，0=关闭，默认 0
  commandTimeout?: number;   // 指令超时 ms，默认 1000
  maxRetries?: number;       // 指令重试次数，默认 2
}

// 推送数据包结构 (PT=0)
export interface PushData {
  systick: number;      // 7位计数器 0-127
  ad0: number;          // 16位 AD0
  ad1?: number;         // 16位 AD1
  in?: number;          // 16位输入状态
  inChange?: number;    // 16位输入变化位
  out?: number;         // 16位输出状态
  pos0Raw?: number;     // 16位编码器0原始值（低16位）
  pos1Raw?: number;     // 16位编码器1原始值（低16位）
  pos0?: number;        // 32位扩展后的编码器0
  pos1?: number;        // 32位扩展后的编码器1
  reset: boolean;       // 重启标志位
}

// 完整32位编码器值
export interface EncoderValues {
  pos0: number;   // 32位
  pos1: number;   // 32位
}

// 运行结果
export interface RunResult {
  status: number;
  serial: number;
}

// 获取双编码器返回值（32位）
export interface EncAll {
  pos0: number;
  pos1: number;
}

// 参数索引
export const ParamIndex = {
  OpMode: 0,
  OpMotor: 1,
  OpEncoder: 2,
  OpShift: 3,
  OpSpeed: 4,
} as const;

export type ParamIndexType = typeof ParamIndex[keyof typeof ParamIndex];

export enum MotorType {
  STEPPER = 0,
  SERVO = 1,
}

export enum DriveManStatus {
  STOP = 0,
  RUNNING = 1,
  STOP_MANUAL = 2,
  LIMIT = 3,
  HOMEING = 4,
}

// 事件接口
export interface ADBoxEvents {
  data: (push: PushData) => void;
  runResult: (result: RunResult) => void;
  connected: () => void;
  close: () => void;
  disconnected: () => void;
  firstFrame: () => void;
  reset: () => void;
  error: (err: Error) => void;
  debug: (msg: string) => void;
}

export declare interface ADBoxClient {
  on<U extends keyof ADBoxEvents>(event: U, listener: ADBoxEvents[U]): this;
  emit<U extends keyof ADBoxEvents>(event: U, ...args: Parameters<ADBoxEvents[U]>): boolean;
}

// 内部使用的待发送请求
export interface PendingRequest {
  resolve: (value: Buffer) => void;
  reject: (reason: Error) => void;
  timeoutTimer: NodeJS.Timeout;
  retryCount: number;
  expectedPrefix: Buffer;
  command: Buffer;  // 不含 B0 的原始命令字节
}