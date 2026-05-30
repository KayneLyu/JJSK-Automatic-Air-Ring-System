import * as net from 'net';
import { EventEmitter } from 'events';
import { FrameParser } from './protocol/framer';
import { encode7E } from './protocol/codec';
import { crc8 } from './protocol/crc';
import { PushData, RunResult, EncAll, PendingRequest, ADBoxEvents } from './types';
import { IOCommands } from './commands/io';
import { RunCommands } from './commands/run';
import { ParamCommands } from './commands/param';

export class ADBoxClient extends EventEmitter {
  private socket: net.Socket | null = null;
  public connected = false;
  private parser = new FrameParser();
  private pendingRequests: PendingRequest[] = [];
  private currentRequest: PendingRequest | null = null;
  private serialCounter = 0;

  // 32位编码器扩展值（高位）
  private pos0High = 0;
  private pos1High = 0;
  private lastPos0Raw = 0;
  private lastPos1Raw = 0;

  // 缓存上一次的值（用于未推送时保持）
  private lastAd0 = 0;
  private lastAd1 = 0;
  private lastIn = 0;
  private lastOut = 0;
  private lastPos0 = 0;
  private lastPos1 = 0;

  constructor(public host: string = '192.168.251.12', public port: number = 20020) {
    super();
  }

  async connect(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) this.disconnect();
      this.socket = new net.Socket();
      const timer = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      }, timeout);

      this.socket.connect(this.port, this.host, () => {
        clearTimeout(timer);
        this.connected = true;
        this.parser.clear();
        // 重置编码器扩展值和缓存
        this.pos0High = 0;
        this.pos1High = 0;
        this.lastPos0Raw = 0;
        this.lastPos1Raw = 0;
        this.lastAd0 = 0;
        this.lastAd1 = 0;
        this.lastIn = 0;
        this.lastOut = 0;
        this.lastPos0 = 0;
        this.lastPos1 = 0;
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (chunk) => this.handleData(chunk));
      this.socket.on('error', (err) => {
        clearTimeout(timer);
        this.connected = false;
        this.emit('error', err);
        reject(err);
      });
      this.socket.on('close', () => {
        this.connected = false;
        this.clearAllPending('Connection closed');
        this.emit('close');
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.clearAllPending('Disconnected');
  }

  private clearAllPending(reason: string): void {
    for (const req of this.pendingRequests) {
      clearTimeout(req.timeoutTimer);
      req.reject(new Error(reason));
    }
    this.pendingRequests = [];
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeoutTimer);
      this.currentRequest.reject(new Error(reason));
      this.currentRequest = null;
    }
  }

  private handleData(chunk: Buffer): void {
    const frames = this.parser.feed(chunk);
    for (const frame of frames) {
      this.processFrame(frame);
    }
  }

  private processFrame(frame: Buffer): void {
    if (frame.length === 0) return;
    const b0 = frame[0];
    const pt = (b0 & 0x80) !== 0;
    if (!pt) {
      this.parseDataPush(frame);
    } else {
      this.handleResponse(frame);
    }
  }

  /**
   * 将16位原始值扩展为32位
   * 根据增量变化自动调整高位
   */
  private extendTo32Bits(raw16: number, lastRaw: number, currentHigh: number): { value32: number; newHigh: number } {
    let newHigh = currentHigh;
    
    // 检查是否跨过 0xFFFF <-> 0x0000 边界
    // 正向溢出：从 0xFFFF 附近跳到 0x0000 附近
    if (lastRaw > 0xC000 && raw16 < 0x4000) {
      newHigh++;
    } 
    // 负向溢出：从 0x0000 附近跳到 0xFFFF 附近
    else if (lastRaw < 0x4000 && raw16 > 0xC000) {
      newHigh--;
    }
    
    const value32 = (newHigh << 16) + raw16;
    return { value32, newHigh };
  }

 private parseDataPush(payload: Buffer): void {
  if (payload.length < 2) return;
  const systick = payload[0] & 0x7f;
  const b1 = payload[1];
  let offset = 2;

  const hasIn   = (b1 & 0x80) !== 0;
  const hasPos0 = (b1 & 0x40) !== 0;
  const hasPos1 = (b1 & 0x20) !== 0;
  const hasOut  = (b1 & 0x10) !== 0;
  const hasAd1  = (b1 & 0x08) !== 0;
  const hasReset= (b1 & 0x01) !== 0;

  // 1. AD0 (始终存在)
  let ad0 = this.lastAd0;
  if (offset + 1 < payload.length) {
    ad0 = payload.readUInt16LE(offset);
    this.lastAd0 = ad0;
    offset += 2;
  }

  // 2. In + InChange (可选)
  let inVal = this.lastIn;
  let inChange: number | undefined;
  if (hasIn && offset + 3 < payload.length) {
    inVal = payload.readUInt16LE(offset);
    inChange = payload.readUInt16LE(offset + 2);
    this.lastIn = inVal;
    offset += 4;
  }

  // 3. Pos0 (16位原始，可选)
  let pos0 = this.lastPos0;
  let pos0Raw: number | undefined;
  if (hasPos0 && offset + 1 < payload.length) {
    pos0Raw = payload.readUInt16LE(offset);
    const { value32, newHigh } = this.extendTo32Bits(pos0Raw, this.lastPos0Raw, this.pos0High);
    pos0 = value32;
    this.lastPos0 = pos0;
    this.pos0High = newHigh;
    this.lastPos0Raw = pos0Raw;
    offset += 2;
  }

  // 4. Pos1 (16位原始，可选)
  let pos1 = this.lastPos1;
  let pos1Raw: number | undefined;
  if (hasPos1 && offset + 1 < payload.length) {
    pos1Raw = payload.readUInt16LE(offset);
    const { value32, newHigh } = this.extendTo32Bits(pos1Raw, this.lastPos1Raw, this.pos1High);
    pos1 = value32;
    this.lastPos1 = pos1;
    this.pos1High = newHigh;
    this.lastPos1Raw = pos1Raw;
    offset += 2;
  }

  // 5. Out (可选)
  let out = this.lastOut;
  if (hasOut && offset + 1 < payload.length) {
    out = payload.readUInt16LE(offset);
    this.lastOut = out;
    offset += 2;
  }

  // 6. AD1 (可选，最后)
  let ad1 = this.lastAd1;
  if (hasAd1 && offset + 1 < payload.length) {
    ad1 = payload.readUInt16LE(offset);
    this.lastAd1 = ad1;
    offset += 2;
  }

  const push: PushData = {
    systick,
    ad0,
    ad1: hasAd1 ? ad1 : undefined,
    in: hasIn ? inVal : undefined,
    inChange: hasIn ? inChange : undefined,
    out: hasOut ? out : undefined,
    pos0Raw: hasPos0 ? pos0Raw : undefined,
    pos1Raw: hasPos1 ? pos1Raw : undefined,
    pos0: hasPos0 ? pos0 : undefined,
    pos1: hasPos1 ? pos1 : undefined,
    reset: hasReset,
  };

  this.emit('data', push);
}

  private handleResponse(payload: Buffer): void {
    // 检查是否是 RN 主动推送
    if (payload.length >= 3 && payload[1] === 0x52 && payload[2] === 0x4e) {
      if (payload.length >= 7) {
        const status = payload[3];
        const serial = payload.readUInt32LE(4);
        this.emit('runResult', { status, serial });
      }
      // 主动推送不消费请求，继续向下匹配
    }

    // 匹配当前等待的请求
    if (this.currentRequest && this.matchPrefix(payload, this.currentRequest.expectedPrefix)) {
      clearTimeout(this.currentRequest.timeoutTimer);
      this.currentRequest.resolve(payload);
      this.currentRequest = null;
      this.processNextRequest();
      return;
    }

    // 尝试匹配队列中的其他请求
    for (let i = 0; i < this.pendingRequests.length; i++) {
      const req = this.pendingRequests[i];
      if (this.matchPrefix(payload, req.expectedPrefix)) {
        clearTimeout(req.timeoutTimer);
        this.pendingRequests.splice(i, 1);
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

  private processNextRequest(): void {
    if (this.pendingRequests.length === 0) return;
    const next = this.pendingRequests.shift()!;
    this.currentRequest = next;
    this.sendRawRequest(next.command, next.expectedPrefix, next.retryCount);
  }

  private sendRawRequest(cmd: Buffer, expectedPrefix: Buffer, retryCount: number): void {
    if (!this.connected || !this.socket) {
      if (this.currentRequest) {
        this.currentRequest.reject(new Error('Not connected'));
        this.currentRequest = null;
      }
      return;
    }
    // 添加 B0 (PT=1, 低7位随意)
    const fullCmd = Buffer.concat([Buffer.from([0x80]), cmd]);
    const frame = Buffer.concat([fullCmd, Buffer.from([crc8(fullCmd)])]);
    const wire = encode7E(frame);
    this.socket.write(wire);

    const timeoutTimer = setTimeout(() => {
      if (this.currentRequest && this.currentRequest.command === cmd) {
        if (retryCount < 2) {
          // 重试
          this.sendRawRequest(cmd, expectedPrefix, retryCount + 1);
        } else {
          this.currentRequest.reject(new Error('Request timeout after retries'));
          this.currentRequest = null;
          this.processNextRequest();
        }
      }
    }, 1000);
    if (this.currentRequest) this.currentRequest.timeoutTimer = timeoutTimer;
  }

  private async sendCommand<T>(
    builder: () => { cmd: Buffer; expectedPrefix: Buffer },
    parser: (resp: Buffer) => T
  ): Promise<T> {
    if (!this.connected) throw new Error('Not connected');
    const { cmd, expectedPrefix } = builder();
    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (resp) => {
          try {
            resolve(parser(resp));
          } catch (e) {
            reject(e);
          }
        },
        reject,
        timeoutTimer: setTimeout(() => {}, 0),
        retryCount: 0,
        expectedPrefix,
        command: cmd,
      };
      if (this.currentRequest === null) {
        this.currentRequest = pending;
        this.sendRawRequest(cmd, expectedPrefix, 0);
      } else {
        this.pendingRequests.push(pending);
      }
    });
  }

  // ========== 手动同步编码器（修正扩展值）==========
  async syncPos0(): Promise<number> {
    const value = await this.getPos0();
    this.pos0High = (value >> 16) & 0xFFFF;
    this.lastPos0Raw = value & 0xFFFF;
    this.lastPos0 = value;
    return value;
  }

  async syncPos1(): Promise<number> {
    const value = await this.getPos1();
    this.pos1High = (value >> 16) & 0xFFFF;
    this.lastPos1Raw = value & 0xFFFF;
    this.lastPos1 = value;
    return value;
  }

  async syncAllPos(): Promise<{ pos0: number; pos1: number }> {
    const { pos0, pos1 } = await this.getPosAll();
    this.pos0High = (pos0 >> 16) & 0xFFFF;
    this.lastPos0Raw = pos0 & 0xFFFF;
    this.lastPos0 = pos0;
    this.pos1High = (pos1 >> 16) & 0xFFFF;
    this.lastPos1Raw = pos1 & 0xFFFF;
    this.lastPos1 = pos1;
    return { pos0, pos1 };
  }

  // ========== 获取当前缓存的最新值（不发送指令）==========
  getCachedAd0(): number { return this.lastAd0; }
  getCachedAd1(): number { return this.lastAd1; }
  getCachedIn(): number { return this.lastIn; }
  getCachedOut(): number { return this.lastOut; }
  getCachedPos0Raw(): number { return this.lastPos0Raw; }
  getCachedPos0(): number { return this.lastPos0; }
  getCachedPos1(): number { return this.lastPos1; }

  // ========== 公开 API ==========
  async getInput(): Promise<number> {
    return this.sendCommand(IOCommands.getInput, (resp) => resp.readUInt16LE(3));
  }

  async getOutput(): Promise<number> {
    return this.sendCommand(IOCommands.getOutput, (resp) => resp.readUInt16LE(3));
  }

  async setOutput(mask: number, value: number): Promise<void> {
    await this.sendCommand(() => IOCommands.setOutput(mask, value), () => undefined);
  }

  async getPos0(): Promise<number> {
    return this.sendCommand(IOCommands.getPos0, (resp) => resp.readInt32LE(4));
  }

  async getPos1(): Promise<number> {
    return this.sendCommand(IOCommands.getPos1, (resp) => resp.readInt32LE(4));
  }

  async getPosAll(): Promise<EncAll> {
    return this.sendCommand(IOCommands.getPosAll, (resp) => ({
      pos0: resp.readInt32LE(4),
      pos1: resp.readInt32LE(8),
    }));
  }

  async getSystemTick(): Promise<number> {
    return this.sendCommand(IOCommands.getSystemTick, (resp) => resp.readUInt32LE(2));
  }

  // 运动参数设置
  async setRunParamSpeed(velocity: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setSpeed(velocity), () => undefined);
  }
  async setRunParamInitSpeed(sv: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setInitSpeed(sv), () => undefined);
  }
  async setRunParamAccelTime(ms: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setAccelTime(ms), () => undefined);
  }
  async setRunParamDecelTime(ms: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setDecelTime(ms), () => undefined);
  }
  async setRunParamHomeSpeed1(speed: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setHomeSpeed1(speed), () => undefined);
  }
  async setRunParamHomeSpeed2(speed: number): Promise<void> {
    await this.sendCommand(() => RunCommands.setHomeSpeed2(speed), () => undefined);
  }

  // 运动参数读取
  async getRunParamSpeed(): Promise<number> {
    return this.sendCommand(RunCommands.getSpeed, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamInitSpeed(): Promise<number> {
    return this.sendCommand(RunCommands.getInitSpeed, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamAccelTime(): Promise<number> {
    return this.sendCommand(RunCommands.getAccelTime, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamDecelTime(): Promise<number> {
    return this.sendCommand(RunCommands.getDecelTime, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamHomeSpeed1(): Promise<number> {
    return this.sendCommand(RunCommands.getHomeSpeed1, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamHomeSpeed2(): Promise<number> {
    return this.sendCommand(RunCommands.getHomeSpeed2, (resp) => resp.readUInt32LE(3));
  }

  // 运动动作
  async moveToPosition(targetPos: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.moveToPosition(targetPos, s), () => undefined);
  }
  async moveRelative(pulses: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.moveRelative(pulses, s), () => undefined);
  }
  async moveForward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.forward(s), () => undefined);
  }
  async moveBackward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.backward(s), () => undefined);
  }
  async home(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.home(s), () => undefined);
  }
  async stopDecel(): Promise<void> {
    await this.sendCommand(RunCommands.stopDecel, () => undefined);
  }
  async stopEmergency(): Promise<void> {
    await this.sendCommand(RunCommands.stopEmergency, () => undefined);
  }
  async getRunResult(): Promise<RunResult> {
    return this.sendCommand(RunCommands.getRunResult, (resp) => ({
      status: resp[3],
      serial: resp.readUInt32LE(4),
    }));
  }

  // 系统参数
  async getSavedParam(index: number): Promise<number> {
    return this.sendCommand(() => ParamCommands.getSavedParam(index), (resp) => resp.readUInt32LE(3));
  }
  async setSavedParam(index: number, value: number): Promise<void> {
    await this.sendCommand(() => ParamCommands.setSavedParam(index, value), () => undefined);
  }
  async getTempParam(index: number): Promise<number> {
    return this.sendCommand(() => ParamCommands.getTempParam(index), (resp) => resp.readUInt32LE(3));
  }
  async setTempParam(index: number, value: number): Promise<void> {
    await this.sendCommand(() => ParamCommands.setTempParam(index, value), () => undefined);
  }
  async applyParams(): Promise<void> {
    await this.sendCommand(ParamCommands.applyParams, () => undefined);
  }
  async softReset(seconds: number): Promise<void> {
    await this.sendCommand(() => ParamCommands.softReset(seconds), () => undefined);
  }
  async clearResetFlag(): Promise<void> {
    await this.sendCommand(ParamCommands.clearResetFlag, () => undefined);
  }
}