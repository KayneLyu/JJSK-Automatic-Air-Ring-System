import * as net from 'net';
import { EventEmitter } from 'events';
import { FrameParser } from './protocol/framer';
import { CommandDispatcher } from './command-dispatcher';
import { Commands } from './commands';
import { PushData, RunResult } from './types';

export interface AdBoxOptions {
  host: string;
  port: number;
  autoReconnect?: boolean;       // 默认 true
  reconnectInterval?: number;    // 默认 3000
  pushTimeout?: number;          // 推送超时(ms)，0 关闭，默认 1000
  commandTimeout?: number;       // 指令超时(ms)，默认 1000
  maxRetries?: number;           // 指令重试次数，默认 2
}

export class TestADBoxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private parser = new FrameParser();
  private dispatcher = new CommandDispatcher();
  private serialCounter = 0;

  // 脉冲扩展 (C# CalPosition)
  private pos0_32 = 0;
  private pos1_32 = 0;

  // 缓存最新值
  private lastAd0 = 0;
  private lastAd1 = 0;
  private lastIn = 0;
  private lastOut = 0;

  public connected = false;
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

    // 配置调度器
    this.dispatcher.configure(this.opts.commandTimeout, this.opts.maxRetries);
    this.dispatcher.setSendHandler((data) => {
      if (this.socket && this.connected) this.socket.write(data);
    });
    // 调度器可以发射 RN 主动推送事件，但我们直接转发
    this.dispatcher.on('rnPush', (payload: Buffer) => {
      if (payload.length >= 7) {
        const status = payload[3];
        const serial = payload.readUInt32LE(4);
        this.emit('runResult', { status, serial } as RunResult);
      }
    });
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
        this.dispatcher.reset('Connected');
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
    this.dispatcher.reset('Disconnected');
    this.emit('disconnected');
  }

  private handleDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    this.dispatcher.reset('Connection closed');
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
        this.disconnect();
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
    else this.dispatcher.handleResponse(payload);
  }

  // ============= 脉冲扩展 (C# CalPosition) =============
  private calPosition(last32: number, enc16: number): number {
    const last16 = last32 & 0xffff;
    const d = (enc16 - last16) << 16 >> 16; // 有符号16位差值
    return last32 + d;
  }

  // ============= PT=0 推送解析 =============
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
    let pos0Raw: number | undefined, pos1Raw: number | undefined;
    let out = this.lastOut, ad1 = this.lastAd1;

    if (hasIn && off + 4 <= payload.length) {
      this.lastIn = payload.readUInt16LE(off);
      inChange = payload.readUInt16LE(off + 2);
      inVal = this.lastIn;
      off += 4;
    }
    if (hasPos0 && off + 2 <= payload.length) {
      pos0Raw = payload.readUInt16LE(off);
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
      pos0Raw,
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

  // ============= 公开 API (通过调度器执行) =============
  /** 同步编码器高位（主动获取完整32位位置） */
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

  // IO
  getInput()         { return this.dispatcher.execute(Commands.GET_IN); }
  getOutput()        { return this.dispatcher.execute(Commands.GET_OUT); }
  getPos0()          { return this.dispatcher.execute(Commands.GET_POS0); }
  getPos1()          { return this.dispatcher.execute(Commands.GET_POS1); }
  getPosAll()        { return this.dispatcher.execute(Commands.GET_POS_ALL); }
  setOutput(mask: number, value: number) {
    const data = Buffer.alloc(4); data.writeUInt16LE(mask, 0); data.writeUInt16LE(value, 2);
    return this.dispatcher.execute(Commands.SET_OUT, data);
  }
  getSystemTick()    { return this.dispatcher.execute(Commands.GET_TICK); }

  // 运行参数设置
  setRunParamSpeed(v: number)          { return this.dispatcher.execute(Commands.SET_V, u32le(v)); }
  setRunParamInitSpeed(sv: number)     { return this.dispatcher.execute(Commands.SET_SV, u32le(sv)); }
  setRunParamAccelTime(ms: number)     { return this.dispatcher.execute(Commands.SET_ACC, u32le(ms)); }
  setRunParamDecelTime(ms: number)     { return this.dispatcher.execute(Commands.SET_DEC, u32le(ms)); }
  setRunParamHomeSpeed1(s: number)     { return this.dispatcher.execute(Commands.SET_H1, u32le(s)); }
  setRunParamHomeSpeed2(s: number)     { return this.dispatcher.execute(Commands.SET_H2, u32le(s)); }

  // 读取运行参数
  getRunParamSpeed()       { return this.dispatcher.execute(Commands.GET_V); }
  getRunParamInitSpeed()   { return this.dispatcher.execute(Commands.GET_SV); }
  getRunParamAccelTime()   { return this.dispatcher.execute(Commands.GET_ACC); }
  getRunParamDecelTime()   { return this.dispatcher.execute(Commands.GET_DEC); }
  getRunParamHomeSpeed1()  { return this.dispatcher.execute(Commands.GET_H1); }
  getRunParamHomeSpeed2()  { return this.dispatcher.execute(Commands.GET_H2); }

  // 运行动作
  /** 运行到绝对位置（脉冲） */
  async moveToPosition(targetPos: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    const data = Buffer.alloc(9);
    data.writeUInt8(0x50, 0); // 'P'
    data.writeInt32LE(targetPos, 1);
    data.writeInt32LE(s, 5);
    await this.dispatcher.execute(Commands.MOVE_ABS, data);
  }
  /** 相对移动（脉冲） */
  async moveRelative(pulses: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    const data = Buffer.alloc(8);
    data.writeInt32LE(pulses, 0);
    data.writeInt32LE(s, 4);
    await this.dispatcher.execute(Commands.MOVE_REL, data);
  }
  async moveForward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.dispatcher.execute(Commands.FORWARD, i32le(s));
  }
  async moveBackward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.dispatcher.execute(Commands.BACKWARD, i32le(s));
  }
  async home(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.dispatcher.execute(Commands.HOME, i32le(s));
  }
  stopDecel()      { return this.dispatcher.execute(Commands.STOP); }
  stopEmergency()  { return this.dispatcher.execute(Commands.ESTOP); }
  getRunResult()   { return this.dispatcher.execute(Commands.GET_RUN_RESULT); }

  // 系统参数
  getSavedParam(index: number) {
    return this.dispatcher.execute(Commands.GET_PARAM(index));
  }
  setSavedParam(index: number, value: number) {
    return this.dispatcher.execute(Commands.SET_PARAM(index), u32le(value));
  }
  applyParams()    { return this.dispatcher.execute(Commands.APPLY_PARAM); }
  softReset(seconds: number) {
    const data = Buffer.concat([Buffer.from([seconds]), Buffer.from('reset', 'ascii')]);
    return this.dispatcher.execute(Commands.SOFT_RESET, data);
  }
  clearResetFlag() { return this.dispatcher.execute(Commands.CLEAR_RESET); }
}

// 辅助函数
function u32le(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; }
function i32le(v: number) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }