import * as net from 'net';
import { EventEmitter } from 'events';
import { FrameParser } from './protocol/framer';
import { encode7E } from './protocol/codec';
import { crc8 } from './protocol/crc8';
import { Commands, CommandDef } from './commands';
import { PushData, RunResult, PendingRequest } from './types';

export interface AdBoxOptions {
  host: string;
  port: number;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  pushTimeout?: number;      // 推送超时ms，0为关闭，默认1000
  commandTimeout?: number;   // 指令超时ms，默认1000
  maxRetries?: number;       // 指令最大重试，默认2（即总共3次发送）
}

export class ADBoxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser = new FrameParser();
  private pending: PendingRequest[] = [];
  private currentReq: PendingRequest | null = null;
  private serialCounter = 0;
  private connected = false;

  // 脉冲扩展状态
  private pos0_32 = 0;
  private pos1_32 = 0;

  // 缓存最近值
  private lastAd0 = 0;
  private lastAd1 = 0;
  private lastIn = 0;
  private lastOut = 0;

  // 重连/看门狗
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pushWatchdog: NodeJS.Timeout | null = null;
  private lastPushTime = 0;
  private firstFrameReceived = false;

  private opts: Required<AdBoxOptions>;

  constructor(options: AdBoxOptions) {
    super();
    this.opts = {
      autoReconnect: true,
      reconnectInterval: 3000,
      pushTimeout: 1000,
      commandTimeout: 1000,
      maxRetries: 2,
      ...options,
    };
  }

  // 只读 connected
  public get isConnected(): boolean {
    return this.connected;
  }

  // ============= 连接管理 =============
  async connect(): Promise<void> {
    if (this.socket) this.disconnect();
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.connect(this.opts.port, this.opts.host, () => {
        this.connected = true;
        this.firstFrameReceived = false;
        this.lastPushTime = Date.now();
        this.parser.clear();
        this.pos0_32 = 0; this.pos1_32 = 0;
        this.clearAllPending(new Error('Connected'));
        this.emit('connected');
        resolve();
      });
      this.socket.on('data', (chunk) => this.handleData(chunk));
      this.socket.on('error', (err) => { this.emit('error', err); reject(err); });
      this.socket.on('close', () => this.handleDisconnect());
    });
  }

  disconnect(): void {
    this.stopReconnect();
    this.stopWatchdog();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
    this.clearAllPending(new Error('Disconnected'));
    this.emit('disconnected');
  }

  private handleDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.firstFrameReceived = false;
    this.clearAllPending(new Error('Connection closed'));
    this.stopWatchdog();
    this.emit('disconnected');
    if (this.opts.autoReconnect) this.startReconnect();
  }

  private startReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.startReconnect());
    }, this.opts.reconnectInterval);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============= 看门狗 =============
  private startWatchdog(): void {
    if (this.pushWatchdog || this.opts.pushTimeout <= 0) return;
    this.pushWatchdog = setInterval(() => {
      if (!this.connected) return;
      if (Date.now() - this.lastPushTime > this.opts.pushTimeout) {
        this.emit('debug', '推送超时，主动断开');
        this.disconnect(); // 触发重连
      }
    }, 1000);
  }

  private stopWatchdog(): void {
    if (this.pushWatchdog) {
      clearInterval(this.pushWatchdog);
      this.pushWatchdog = null;
    }
  }

  // ============= 数据接收 =============
  private handleData(chunk: Buffer): void {
    const frames = this.parser.feed(chunk);
    for (const f of frames) {
      this.processFrame(f);
    }
  }

  private processFrame(payload: Buffer): void {
    if (payload.length === 0) return;
    const pt = (payload[0] & 0x80) !== 0;
    if (!pt) {
      this.parsePush(payload);
    } else {
      this.handleResponse(payload);
    }
  }

  // ============= 脉冲扩展 (C# CalPosition) =============
  private calPosition(last32: number, enc16: number): number {
    const last16 = last32 & 0xffff;
    // 将差值转换为有符号16位
    let d = enc16 - last16;
    if (d > 32767) d -= 65536;
    else if (d < -32768) d += 65536;
    return last32 + d;
  }

  // ============= 数据推送解析 (PT=0) 严格长度校验 =============
  private parsePush(payload: Buffer): void {
    // 更新前  
    if (payload.length < 4) return; // B0 + B1 + AD0 至少4字节

    const dbm = payload[1];
    let off = 2;               // 当前读取位置（从B1之后开始）

    let pos0Raw: number | undefined;
    let pos1Raw: number | undefined;
    let inChange: number | undefined;

    // 1. AD0（始终存在）
    if (off + 2 > payload.length) return;
    this.lastAd0 = payload.readUInt16LE(off);
    off += 2;

    // 2. In + InChange
    if (dbm & 0x80) {
      if (off + 4 > payload.length) return;
      this.lastIn = payload.readUInt16LE(off);
      inChange = payload.readUInt16LE(off + 2);
      off += 4;
    }

    // 3. POS0 (ENC1)
    if (dbm & 0x40) {
      if (off + 2 > payload.length) return;
      pos0Raw = payload.readUInt16LE(off);
      this.pos0_32 = this.calPosition(this.pos0_32, pos0Raw);
      off += 2;
    }

    // 4. pos0 (ENC2)
    if (dbm & 0x20) {
      if (off + 2 > payload.length) return;
      pos1Raw = payload.readUInt16LE(off);
      this.pos1_32 = this.calPosition(this.pos1_32, pos1Raw);
      off += 2;
    }

    // 5. Out
    if (dbm & 0x10) {
      if (off + 2 > payload.length) return;
      this.lastOut = payload.readUInt16LE(off);
      off += 2;
    }

    // 6. AD1
    if (dbm & 0x08) {
      if (off + 2 > payload.length) return;
      this.lastAd1 = payload.readUInt16LE(off);
      off += 2;
    }

    // 构建推送对象（pos0/pos1 始终为当前扩展值，绝不 undefined）
    const push: PushData = {
      sysTick: payload[0] & 0x7f,
      ad0: this.lastAd0,
      ad1: (dbm & 0x08) ? this.lastAd1 : undefined,
      in: (dbm & 0x80) ? this.lastIn : undefined,
      inChange,
      out: (dbm & 0x10) ? this.lastOut : undefined,
      pos0: this.pos0_32,
      pos1: this.pos1_32,
      pos0Raw,
      pos1Raw,
      reset: !!(dbm & 0x01),
    };

    // 喂狗 & 首帧事件
    this.lastPushTime = Date.now();
    if (!this.firstFrameReceived) {
      this.firstFrameReceived = true;
      this.startWatchdog();

      this.emit('firstFrame');
    }

    // 自动清除复位标志
    if (push.reset) {
      this.clearResetFlag().catch(() => { });
      this.emit('reset');
    }

    this.emit('data', push);
  }

  // ============= 功能包响应处理 (PT=1) =============
  private handleResponse(payload: Buffer): void {
    // 主动推送的 RN (R+N)
    if (payload.length >= 3 && payload[1] === 0x52 && payload[2] === 0x4e) {
      if (payload.length >= 7) {
        const status = payload[3];
        const serial = payload.readUInt32LE(4);
        this.emit('runResult', { status, serial } as RunResult);
      }
      // 继续检查是否是请求的响应（RN也是请求的响应）
    }

    // 匹配当前请求
    if (this.currentReq && this.matchPrefix(payload, this.currentReq.expectedPrefix)) {
      clearTimeout(this.currentReq.timer);
      this.currentReq.resolve(payload);
      this.currentReq = null;
      this.processNext();
      return;
    }

    // 匹配队列中请求
    for (let i = 0; i < this.pending.length; i++) {
      if (this.matchPrefix(payload, this.pending[i].expectedPrefix)) {
        const req = this.pending.splice(i, 1)[0];
        clearTimeout(req.timer);
        req.resolve(payload);
        break;
      }
    }
  }

  private matchPrefix(payload: Buffer, prefix: Buffer): boolean {
    if (payload.length < prefix.length + 1) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (payload[i + 1] !== prefix[i]) return false;
    }
    return true;
  }

  // ============= 命令队列（完全独立，不影响数据流） =============
  private processNext(): void {
    if (this.pending.length === 0) return;
    const next = this.pending.shift()!;
    this.currentReq = next;
    this.sendRaw(next.commandData, next.expectedPrefix, next.retries);
  }

  private sendRaw(data: Buffer, expectedPrefix: Buffer, retries: number): void {
    if (!this.connected || !this.socket) {
      if (this.currentReq) {
        this.currentReq.reject(new Error('Not connected'));
        this.currentReq = null;
        this.processNext();
      }
      return;
    }

    // 构建完整帧
    const b0 = Buffer.from([0x80]);
    const fullCmd = Buffer.concat([b0, data]);
    const crc = crc8(fullCmd);
    const wire = encode7E(Buffer.concat([fullCmd, Buffer.from([crc])]));
    this.socket.write(wire);

    // 设置超时重试
    const timer = setTimeout(() => {
      if (this.currentReq && this.currentReq.commandData === data) {
        if (retries < this.opts.maxRetries) {
          this.sendRaw(data, expectedPrefix, retries + 1);
        } else {
          const err = new Error('Request timeout after retries');
          this.currentReq.reject(err);
          this.currentReq = null;
          this.processNext();
        }
      }
    }, this.opts.commandTimeout);
    if (this.currentReq) this.currentReq.timer = timer;
  }

  private async sendCommand<T>(def: CommandDef, data?: Buffer, customParse?: (resp: Buffer) => T): Promise<T> {
    if (!this.connected) throw new Error('Not connected');
    const cmd = data ? Buffer.concat([def.prefix, data]) : def.prefix;
    return new Promise((resolve, reject) => {
      const req: PendingRequest = {
        resolve: (payload: Buffer) => {
          try {
            const dataStart = 1 + def.prefix.length; // 跳过B0和前缀
            if (def.parse) resolve(def.parse(payload.subarray(dataStart)));
            else if (customParse) resolve(customParse(payload.subarray(dataStart)));
            else resolve(undefined as any);
          } catch (e) { reject(e); }
        },
        reject,
        timer: setTimeout(() => { }, 0),
        retries: 0,
        expectedPrefix: def.prefix,
        commandData: cmd,
      };
      if (!this.currentReq) {
        this.currentReq = req;
        this.sendRaw(cmd, def.prefix, 0);
      } else {
        this.pending.push(req);
      }
    });
  }

  // 发送指令不等待回复
  private sendAndForget(data: Buffer): void {
    if (!this.connected || !this.socket) return;
    const b0 = Buffer.from([0x80]);
    const fullCmd = Buffer.concat([b0, data]);
    const crc = crc8(fullCmd);
    const wire = encode7E(Buffer.concat([fullCmd, Buffer.from([crc])]));
    this.socket.write(wire);
  }

  // ============= 公开 API =============
  // 同步编码器（主动获取32位位置并更新内部扩展状态）
  async syncPos0(): Promise<number> {
    const val = await this.sendCommand(Commands.GET_POS0) as number;
    this.pos0_32 = val;
    return val;
  }
  async syncPos1(): Promise<number> {
    const val = await this.sendCommand(Commands.GET_POS1) as number;
    this.pos1_32 = val;
    return val;
  }

  // IO
  getInput() { return this.sendCommand(Commands.GET_IN); }
  getOutput() { return this.sendCommand(Commands.GET_OUT); }
  getPos0() { return this.sendCommand(Commands.GET_POS0); }
  getPos1() { return this.sendCommand(Commands.GET_POS1); }
  getPosAll() { return this.sendCommand(Commands.GET_POS_ALL); }
  setOutput(mask: number, value: number) {
    const data = Buffer.alloc(4); data.writeUInt16LE(mask, 0); data.writeUInt16LE(value, 2);
    return this.sendCommand(Commands.SET_OUT, data);
  }
  getSystemTick() { return this.sendCommand(Commands.GET_TICK); }

  // 运行参数设置
  setRunParamSpeed(v: number) { return this.sendCommand(Commands.SET_V, u32le(v)); }
  setRunParamInitSpeed(sv: number) { return this.sendCommand(Commands.SET_SV, u32le(sv)); }
  setRunParamAccelTime(ms: number) { return this.sendCommand(Commands.SET_ACC, u32le(ms)); }
  setRunParamDecelTime(ms: number) { return this.sendCommand(Commands.SET_DEC, u32le(ms)); }
  setRunParamHomeSpeed1(s: number) { return this.sendCommand(Commands.SET_H1, u32le(s)); }
  setRunParamHomeSpeed2(s: number) { return this.sendCommand(Commands.SET_H2, u32le(s)); }

  // 读取运行参数
  getRunParamSpeed() { return this.sendCommand(Commands.GET_V); }
  getRunParamInitSpeed() { return this.sendCommand(Commands.GET_SV); }
  getRunParamAccelTime() { return this.sendCommand(Commands.GET_ACC); }
  getRunParamDecelTime() { return this.sendCommand(Commands.GET_DEC); }
  getRunParamHomeSpeed1() { return this.sendCommand(Commands.GET_H1); }
  getRunParamHomeSpeed2() { return this.sendCommand(Commands.GET_H2); }

  // 运行动作
  // 运行动作（发送即忘，不等待响应）
  moveToPosition(target: number, serial?: number): void {
    const s = serial ?? ++this.serialCounter;
    const buf = Buffer.alloc(9);
    buf.writeUInt8(0x50, 0); // 'P'
    buf.writeInt32LE(target, 1);
    buf.writeInt32LE(s, 5);
    this.sendAndForget(Buffer.concat([Commands.MOVE_ABS.prefix, buf]));
  }

  moveForward(serial?: number): void {
    const s = serial ?? ++this.serialCounter;
    this.sendAndForget(Buffer.concat([Commands.FORWARD.prefix, i32le(s)]));
  }

  moveBackward(serial?: number): void {
    const s = serial ?? ++this.serialCounter;
    this.sendAndForget(Buffer.concat([Commands.BACKWARD.prefix, i32le(s)]));
  }

  home(serial?: number): void {
    const s = serial ?? ++this.serialCounter;
    this.sendAndForget(Buffer.concat([Commands.HOME.prefix, i32le(s)]));
  }

  stopDecel(): void {
    this.sendAndForget(Commands.STOP.prefix);
  }

  stopEmergency(): void {
    this.sendAndForget(Commands.ESTOP.prefix);
  }

  // 注意：getRunResult 保留为异步，因为需要读取返回结果
  async getRunResult(): Promise<RunResult> {
    return this.sendCommand(Commands.GET_RUN_RESULT);
  }

  // 系统参数
  getSavedParam(index: number) { return this.sendCommand(Commands.GET_PARAM(index)); }
  setSavedParam(index: number, value: number) {
    return this.sendCommand(Commands.SET_PARAM(index), u32le(value));
  }
  applyParams() { return this.sendCommand(Commands.APPLY_PARAM); }
  softReset(seconds: number) {
    const data = Buffer.concat([Buffer.from([seconds]), Buffer.from('reset', 'ascii')]);
    return this.sendCommand(Commands.SOFT_RESET, data);
  }
  clearResetFlag() { return this.sendCommand(Commands.CLEAR_RESET); }

  // 清理
  private clearAllPending(err: Error) {
    for (const r of this.pending) { clearTimeout(r.timer); r.reject(err); }
    this.pending = [];
    if (this.currentReq) {
      clearTimeout(this.currentReq.timer);
      this.currentReq.reject(err);
      this.currentReq = null;
    }
  }
}

// 辅助函数
function u32le(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }
function i32le(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }