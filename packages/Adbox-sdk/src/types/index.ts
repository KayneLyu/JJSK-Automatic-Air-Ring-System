// 推送数据包结构 (PT=0)
export interface PushData {
  systick: number;      // 7位计数器 0-127
  ad0: number;          // 16位 AD0
  ad1?: number;         // 16位 AD1
  in?: number;          // 16位输入状态
  inChange?: number;    // 16位输入变化位
  out?: number;         // 16位输出状态
  pos0?: number;        // 32位编码器0（实际根据B1可能是16位）
  pos1?: number;        // 32位编码器1
  reset: boolean;       // 重启标志位
}

// 运行结果
export interface RunResult {
  status: number;       // DRIVE_MAN_STATUS
  serial: number;       // 4字节序列号
}

// 获取双编码器返回值
export interface EncAll {
  pos0: number;
  pos1: number;
}

// 参数索引（与 C# 一致）
export const ParamIndex = {
  OpMode: 0,
  OpMotor: 1,
  OpEncoder: 2,
  OpShift: 3,
  OpSpeed: 4,
} as const;

export type ParamIndexType = typeof ParamIndex[keyof typeof ParamIndex];

// 电机类型枚举
export enum MotorType {
  STEPPER = 0,
  SERVO = 1,
  // 其他根据实际定义
}

// 驱动状态（根据 C# DRIVE_MAN_STATUS）
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
  error: (err: Error) => void;
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
  command: Buffer;      // 完整功能包（含B0）
}