// 包类型
export enum PacketType {
  Data = 0,
  Function = 1,
}

// DBM 位映射
export enum DbmBit {
  IN = 7,
  POS0 = 6,
  POS1 = 5,
  OUT = 4,
  AD1 = 3,
  RESET = 0,
}

// 系统参数索引
export enum SystemParamIndex {
  OP_MODE = 0,
  OP_MOTOR = 1,
  OP_ENCODER = 2,
  OP_SHIFT = 3,
  OP_SPEED = 4,
}

// 实时数据结构
export interface RealTimeData {
  pn: number;
  reset: boolean;
  ad0: number;
  ad1?: number;
  pos0?: number;
  pos1?: number;
  input?: number;
  inputChange?: number;
  output?: number;
}

// SDK配置
export interface Adb2Config {
  host: string;
  port: number;
  reconnectInterval?: number;
  requestTimeout?: number;
  log?: boolean;
}

// 响应Promise包装
export type RequestPromise = {
  resolve: (data: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};