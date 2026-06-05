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
  autoReconnect?: boolean;       // 默认 true
  reconnectInterval?: number;    // 默认 3000
  pushTimeout?: number;          // 推送超时(ms)，默认 1000，0 关闭
  commandTimeout?: number;       // 指令超时(ms)，默认 1000
  maxRetries?: number;           // 指令重试次数，默认 2
}

export class TestADBoxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser = new FrameParser();
  private pending: PendingRequest[] = [];
  private currentReq: PendingRequest | null = null;
  private serialCounter = 0;

  // 脉冲扩展（C# CalPosition 算法）
  private pos0_32 = 0;
  private pos1_32 = 0;
  // 缓存
  private lastAd0 = 0;
  private lastAd1 = 0;
  private lastIn = 0;
  private lastOut = 0;

  private connected = false;
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

  // ============= 连接 =============
  async connect(): Promise<void> {
    if (this.socket) this.disconnect();
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.connect(this.opts.port, this.opts.host, () => {
        this.connected = true;
        this.firstFrameReceived = false;
        this.lastPushTime = Date.now();
        this.parser.clear();
        this.clearPending(new Error('Connected'));
        this.emit('connected');
        resolve();
      });
      this.socket.on('data', (chunk) => this.handleData(chunk));
      this.socket.on('error', (err) => { this.emit('error', err); reject(err); });
      this.socket.on('close', () => this.handleDisconnect());
    });
  }

  disconnect() {
    this.stopReconnect();
    this.stopWatchdog();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
    this.clearPending(new Error('Disconnected'));
    this.emit('disconnected');
  }

  // ============= 断线处理 =============
  private handleDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.clearPending(new Error('Connection closed'));
    this.stopWatchdog();
    this.emit('disconnected');
    if (this.opts.autoReconnect) this.startReconnect();
  }

  private startReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => this.startReconnect());
    }, this.opts.reconnectInterval);
  }

  private stopReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============= 看门狗 =============
  private startWatchdog() {
    if (this.pushWatchdog || this.opts.pushTimeout <= 0) return;
    this.pushWatchdog = setInterval(() => {
      if (!this.connected) return;
      if (Date.now() - this.lastPushTime > this.opts.pushTimeout) {
        this.emit('debug', '推送超时，断开重连');
        this.disconnect(); // 触发重连
      }
    }, 1000);
  }

  private stopWatchdog() {
    if (this.pushWatchdog) {
      clearInterval(this.pushWatchdog);
      this.pushWatchdog = null;
    }
  }

  // ============= 数据接收 =============
  private handleData(chunk: Buffer) {
    const frames = this.parser.feed(chunk);
    for (const f of frames) this.processFrame(f);
  }

  private processFrame(payload: Buffer) {
    if (payload.length === 0) return;
    const pt = (payload[0] & 0x80) !== 0;
    if (!pt) this.parsePush(payload);
    else this.handleResponse(payload);
  }

  // ============= 脉冲扩展 (C# CalPosition) =============
  private calPosition(last32: number, enc16: number): number {
    const last16 = last32 & 0xffff;
    const d = (enc16 - last16) << 16 >> 16; // 转换为有符号16位差值
    return last32 + d;
  }

  // ============= 数据推送解析 (PT=0) =============
  private parsePush(payload: Buffer) {
    if (payload.length < 4) return;
    const sysTick = payload[0] & 0x7f;
    const dbm = payload[1];
    let off = 2;
  
    const hasIn   = !!(dbm & 0x80);
    const hasPos0 = !!(dbm & 0x40);
    const hasPos1 = !!(dbm & 0x20);
    const hasOut  = !!(dbm & 0x10);
    const hasAd1  = !!(dbm & 0x08);
    const reset   = !!(dbm & 0x01);
  
    this.lastAd0 = payload.readUInt16LE(off); off += 2;
    let inVal = this.lastIn, inChange: number | undefined;
    let pos0: number | undefined, pos1: number | undefined;
    let pos0Raw: number | undefined, pos1Raw: number | undefined;  // 新增
    let out = this.lastOut, ad1 = this.lastAd1;
  
    if (hasIn && off + 4 <= payload.length) {
      this.lastIn = payload.readUInt16LE(off);
      inChange = payload.readUInt16LE(off + 2);
      inVal = this.lastIn;
      off += 4;
    }
    if (hasPos0 && off + 2 <= payload.length) {
      pos0Raw = payload.readUInt16LE(off);        // 保存原始值
      this.pos0_32 = this.calPosition(this.pos0_32, pos0Raw);
      pos0 = this.pos0_32;
      off += 2;
    }
    if (hasPos1 && off + 2 <= payload.length) {
      pos1Raw = payload.readUInt16LE(off);
      this.pos1_32 = this.calPosition(this.pos1_32, pos1Raw);
      pos1 = this.pos1_32;
      off += 2;
    }
    if (hasOut && off + 2 <= payload.length) {
      this.lastOut = payload.readUInt16LE(off); off += 2;
    }
    if (hasAd1 && off + 2 <= payload.length) {
      this.lastAd1 = payload.readUInt16LE(off); off += 2;
    }
  
    const push: PushData = {
      sysTick,
      ad0: this.lastAd0,
      ad1: hasAd1 ? this.lastAd1 : undefined,
      in: hasIn ? inVal : undefined,
      inChange,
      out: hasOut ? out : undefined,
      pos0,
      pos1,
      pos0Raw,    // 加入
      pos1Raw,
      reset,
    };
  
    this.lastPushTime = Date.now();
    if (!this.firstFrameReceived) {
      this.firstFrameReceived = true;
      this.startWatchdog();
      this.emit('firstFrame');
    }
  
    if (reset) {
      this.clearResetFlag().catch(() => {});
      this.emit('reset');
    }
  
    this.emit('data', push);
  }

  // ============= 功能包响应处理 =============
  private handleResponse(payload: Buffer) {
    // RN 主动推送
    if (payload.length >= 3 && payload[1] === 0x52 && payload[2] === 0x4e) {
      if (payload.length >= 7) {
        const status = payload[3];
        const serial = payload.readUInt32LE(4);
        this.emit('runResult', { status, serial } as RunResult);
      }
      // 如果恰好是当前请求，仍然会匹配到并处理（双重作用）
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

  // ============= 命令队列 =============
  private processNext() {
    if (this.pending.length === 0) return;
    const next = this.pending.shift()!;
    this.currentReq = next;
    this.sendRaw(next.commandData, next.expectedPrefix, next.retries);
  }

  private sendRaw(data: Buffer, expectedPrefix: Buffer, retries: number) {
    if (!this.connected || !this.socket) {
      this.currentReq?.reject(new Error('Not connected'));
      this.currentReq = null;
      this.processNext();
      return;
    }
    // 添加B0 (PT=1)
    const b0 = Buffer.from([0x80]);
    const fullCmd = Buffer.concat([b0, data]);
    const crc = crc8(fullCmd);
    const wire = encode7E(Buffer.concat([fullCmd, Buffer.from([crc])]));
    this.socket.write(wire);

    const timer = setTimeout(() => {
      if (this.currentReq && this.currentReq.commandData === data) {
        if (retries < this.opts.maxRetries) {
          this.sendRaw(data, expectedPrefix, retries + 1);
        } else {
          const err = new Error('Command timeout after retries');
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
    const expectedPrefix = def.prefix;
    return new Promise((resolve, reject) => {
      const req: PendingRequest = {
        resolve: (payload: Buffer) => {
          try {
            const dataStart = 1 + expectedPrefix.length; // 跳过B0和前缀
            if (def.parse) resolve(def.parse(payload.subarray(dataStart)));
            else if (customParse) resolve(customParse(payload.subarray(dataStart)));
            else resolve(undefined as any);
          } catch (e) { reject(e); }
        },
        reject,
        timer: setTimeout(() => {}, 0),
        retries: 0,
        expectedPrefix,
        commandData: cmd,
      };
      if (!this.currentReq) {
        this.currentReq = req;
        this.sendRaw(cmd, expectedPrefix, 0);
      } else {
        this.pending.push(req);
      }
    });
  }

  // ============= 公开 API =============
  // 同步编码器高位（主动获取32位值并更新内部扩展状态）
  async syncPos0(): Promise<number> {
    const val = await this.getPos0() as number;
    this.pos0_32 = val;
    return val;
  }
  async syncPos1(): Promise<number> {
    const val = await this.getPos1() as number;
    this.pos1_32 = val;
    return val;
  }

  // ---- IO ----
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

  // ---- 设置运行参数 ----
  setRunParamSpeed(v: number) { return this.sendCommand(Commands.SET_V, u32le(v)); }
  setRunParamInitSpeed(sv: number) { return this.sendCommand(Commands.SET_SV, u32le(sv)); }
  setRunParamAccelTime(ms: number) { return this.sendCommand(Commands.SET_ACC, u32le(ms)); }
  setRunParamDecelTime(ms: number) { return this.sendCommand(Commands.SET_DEC, u32le(ms)); }
  setRunParamHomeSpeed1(s: number) { return this.sendCommand(Commands.SET_H1, u32le(s)); }
  setRunParamHomeSpeed2(s: number) { return this.sendCommand(Commands.SET_H2, u32le(s)); }

  // ---- 读取运行参数 ----
  getRunParamSpeed() { return this.sendCommand(Commands.GET_V); }
  getRunParamInitSpeed() { return this.sendCommand(Commands.GET_SV); }
  getRunParamAccelTime() { return this.sendCommand(Commands.GET_ACC); }
  getRunParamDecelTime() { return this.sendCommand(Commands.GET_DEC); }
  getRunParamHomeSpeed1() { return this.sendCommand(Commands.GET_H1); }
  getRunParamHomeSpeed2() { return this.sendCommand(Commands.GET_H2); }

  // ---- 运行动作 ----
  moveToPosition(target: number, serial?: number) {
    const s = serial ?? ++this.serialCounter;
    const buf = Buffer.alloc(9); buf.writeUInt8(0x50, 0); buf.writeInt32LE(target, 1); buf.writeInt32LE(s, 5);
    return this.sendCommand(Commands.MOVE_ABS, buf);
  }
  moveRelative(pulses: number, serial?: number) {
    const s = serial ?? ++this.serialCounter;
    const buf = Buffer.alloc(8);
    // 按C#逻辑，无'+/-'前缀，直接发送32位有符号数 + serial
    buf.writeInt32LE(pulses, 0);
    buf.writeInt32LE(s, 4);
    return this.sendCommand(Commands.MOVE_REL, buf);
  }
  moveForward(serial?: number) {
    const s = serial ?? ++this.serialCounter;
    return this.sendCommand(Commands.FORWARD, i32le(s));
  }
  moveBackward(serial?: number) {
    const s = serial ?? ++this.serialCounter;
    return this.sendCommand(Commands.BACKWARD, i32le(s));
  }
  home(serial?: number) {
    const s = serial ?? ++this.serialCounter;
    return this.sendCommand(Commands.HOME, i32le(s));
  }
  stopDecel() { return this.sendCommand(Commands.STOP); }
  stopEmergency() { return this.sendCommand(Commands.ESTOP); }
  getRunResult() { return this.sendCommand(Commands.GET_RUN_RESULT); }

  // ---- 系统参数 ----
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

  private clearPending(err: Error) {
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