// types.ts
export interface PushData {
    sysTick: number;
    ad0: number;
    ad1?: number;
    in?: number;
    inChange?: number;
    out?: number;
    pos0?: number;    // 扩展后的32位
    pos1?: number;
    pos0Raw?: number; // 原始16位
    pos1Raw?: number;
    reset: boolean;
  }
  
  export interface RunResult {
    status: number;
    serial: number;
  }
  
  export interface PendingRequest {
    resolve: (resp: Buffer) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
    retries: number;
    /** 期望的完整前缀（用于匹配） */
    expectedPrefix: Buffer;
    /** 原始命令数据（不含B0），用于重发 */
    commandData: Buffer;
  }