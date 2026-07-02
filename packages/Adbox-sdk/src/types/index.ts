export interface PushData {
  /** 时间戳 0-127，1ms递增，用于计算速度或检测丢包 */
  sysTick: number;

  /** AD0采集值（16位），主厚度信号，必定存在 */
  ad0: number;

  /** AD1采集值（16位），辅助厚度信号，变化时才推送 */
  ad1?: number;

  /** 16路输入状态（X0-X15），变化时才推送 */
  in?: number;

  /** 输入变化位掩码，标识哪些位发生了变化 */
  inChange?: number;

  /** 16路输出状态（Y0-Y7），变化时才推送 */
  out?: number;

  /** 编码器1完整32位位置，SDK自动扩展，长行程用 */
  pos0?: number;

  /** 编码器2完整32位位置，用于生产速度计算 */
  pos1?: number;

  /** 编码器1原始16位值（0-65535），横扫测厚仪直接用它显示位置 */
  pos0Raw?: number;

  /** 编码器2原始16位值，用于速度计算 */
  pos1Raw?: number;

  /** 设备重启标志，true表示刚复位，需调用clearResetFlag()清除 */
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
  expectedPrefix: Buffer;  // 用于匹配响应
  commandData: Buffer;     // 不含B0的完整命令
}