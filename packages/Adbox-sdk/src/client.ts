import * as net from 'net'
import { EventEmitter } from 'events'
import { FrameParser } from './protocol/framer'
import { encode7E } from './protocol/codec'
import { crc8 } from './protocol/crc'
import { ADBoxOptions, PushData, RunResult, EncAll, PendingRequest } from './types'
import { IOCommands } from './commands/io'
import { RunCommands } from './commands/run'
import { ParamCommands } from './commands/param'

const DEFAULT_OPTS: Required<ADBoxOptions> = {
  host: '192.168.251.12',
  port: 20021,
  connectTimeout: 5000,
  autoReconnect: false,
  reconnectInterval: 3000,
  pushTimeout: 0,
  commandTimeout: 1000,
  maxRetries: 2,
}

export class ADBoxClient extends EventEmitter {
  private socket: net.Socket | null = null
  public connected = false

  private parser = new FrameParser()
  private pendingRequests: PendingRequest[] = []
  private currentRequest: PendingRequest | null = null
  private serialCounter = 0

  // 32位编码器扩展（维护 high 位 + lastRaw 用于跨界检测）
  private pos0High = 0
  private pos1High = 0
  private lastPos0Raw = 0
  private lastPos1Raw = 0

  // 推送缓存（当 DBM 不含某字段时保持上次值）
  private lastAd0 = 0
  private lastAd1 = 0
  private lastIn = 0
  private lastOut = 0
  private lastPos0 = 0
  private lastPos1 = 0

  // 自动重连 & 看门狗
  private reconnectTimer: NodeJS.Timeout | null = null
  private pushWatchdog: NodeJS.Timeout | null = null
  private lastPushTime = 0
  private firstFrameReceived = false

  private opts: Required<ADBoxOptions>

  /**
   * 兼容旧用法 new ADBoxClient(host, port) 与新用法 new ADBoxClient(options)
   */
  constructor(hostOrOptions?: string | ADBoxOptions, port?: number) {
    super()
    if (typeof hostOrOptions === 'string') {
      this.opts = { ...DEFAULT_OPTS, host: hostOrOptions, port: port ?? DEFAULT_OPTS.port }
    } else {
      this.opts = { ...DEFAULT_OPTS, ...hostOrOptions }
    }
  }

  // ─── 连接 ───────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.socket) this.disconnect()
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()

      const timer = setTimeout(() => {
        this.socket?.destroy()
        reject(new Error('Connection timeout'))
      }, this.opts.connectTimeout)

      this.socket.connect(this.opts.port, this.opts.host, () => {
        clearTimeout(timer)
        this.connected = true
        this.firstFrameReceived = false
        this.lastPushTime = Date.now()
        this.parser.clear()
        this._resetCache()
        this.emit('connected')
        resolve()
      })

      this.socket.on('data', (chunk) => this._handleData(chunk))

      this.socket.on('error', (err) => {
        clearTimeout(timer)
        this.connected = false
        this.emit('error', err)
        reject(err)
      })

      this.socket.on('close', () => this._handleDisconnect())
    })
  }

  disconnect(): void {
    this._stopReconnect()
    this._stopWatchdog()
    this.socket?.destroy()
    this.socket = null
    this.connected = false
    this._clearAllPending('Disconnected')
  }

  // ─── 断线处理 ───────────────────────────────────────────────────────────

  private _handleDisconnect(): void {
    if (!this.connected) return
    this.connected = false
    this._clearAllPending('Connection closed')
    this._stopWatchdog()
    this.emit('close')
    this.emit('disconnected')
    if (this.opts.autoReconnect) this._startReconnect()
  }

  private _startReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => this._startReconnect())
    }, this.opts.reconnectInterval)
  }

  private _stopReconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
  }

  // ─── 推送看门狗 ─────────────────────────────────────────────────────────

  private _startWatchdog(): void {
    if (this.pushWatchdog || this.opts.pushTimeout <= 0) return
    this.pushWatchdog = setInterval(() => {
      if (!this.connected) return
      if (Date.now() - this.lastPushTime > this.opts.pushTimeout) {
        this.emit('debug', '推送超时，断开重连')
        this.disconnect()
      }
    }, 1000)
  }

  private _stopWatchdog(): void {
    if (this.pushWatchdog) { clearInterval(this.pushWatchdog); this.pushWatchdog = null }
  }

  // ─── 数据接收 ───────────────────────────────────────────────────────────

  private _handleData(chunk: Buffer): void {
    const frames = this.parser.feed(chunk)
    for (const frame of frames) this._processFrame(frame)
  }

  private _processFrame(frame: Buffer): void {
    if (frame.length === 0) return
    const pt = (frame[0] & 0x80) !== 0
    if (!pt) this._parseDataPush(frame)
    else this._handleResponse(frame)
  }

  // ─── 推送解析 ───────────────────────────────────────────────────────────

  private _extendTo32(raw16: number, lastRaw: number, curHigh: number): { value32: number; newHigh: number } {
    let newHigh = curHigh
    if (lastRaw > 0xc000 && raw16 < 0x4000) newHigh++
    else if (lastRaw < 0x4000 && raw16 > 0xc000) newHigh--
    return { value32: (newHigh << 16) + raw16, newHigh }
  }

  private _parseDataPush(payload: Buffer): void {
    if (payload.length < 4) return

    const systick = payload[0] & 0x7f
    const dbm = payload[1]
    let off = 2

    const hasIn   = !!(dbm & 0x80)
    const hasPos0 = !!(dbm & 0x40)
    const hasPos1 = !!(dbm & 0x20)
    const hasOut  = !!(dbm & 0x10)
    const hasAd1  = !!(dbm & 0x08)
    const reset   = !!(dbm & 0x01)

    this.lastAd0 = payload.readUInt16LE(off); off += 2

    let inVal = this.lastIn
    let inChange: number | undefined
    if (hasIn && off + 4 <= payload.length) {
      this.lastIn = payload.readUInt16LE(off)
      inChange = payload.readUInt16LE(off + 2)
      inVal = this.lastIn
      off += 4
    }

    let pos0Raw: number | undefined
    if (hasPos0 && off + 2 <= payload.length) {
      pos0Raw = payload.readUInt16LE(off)
      const { value32, newHigh } = this._extendTo32(pos0Raw, this.lastPos0Raw, this.pos0High)
      this.lastPos0 = value32
      this.pos0High = newHigh
      this.lastPos0Raw = pos0Raw
      off += 2
    }

    let pos1Raw: number | undefined
    if (hasPos1 && off + 2 <= payload.length) {
      pos1Raw = payload.readUInt16LE(off)
      const { value32, newHigh } = this._extendTo32(pos1Raw, this.lastPos1Raw, this.pos1High)
      this.lastPos1 = value32
      this.pos1High = newHigh
      this.lastPos1Raw = pos1Raw
      off += 2
    }

    if (hasOut && off + 2 <= payload.length) { this.lastOut = payload.readUInt16LE(off); off += 2 }
    if (hasAd1 && off + 2 <= payload.length) { this.lastAd1 = payload.readUInt16LE(off); off += 2 }

    const push: PushData = {
      systick,
      ad0: this.lastAd0,
      ad1: hasAd1 ? this.lastAd1 : undefined,
      in: hasIn ? inVal : undefined,
      inChange: hasIn ? inChange : undefined,
      out: hasOut ? this.lastOut : undefined,
      pos0Raw: hasPos0 ? pos0Raw : undefined,
      pos1Raw: hasPos1 ? pos1Raw : undefined,
      pos0: hasPos0 ? this.lastPos0 : undefined,
      pos1: hasPos1 ? this.lastPos1 : undefined,
      reset,
    }

    this.lastPushTime = Date.now()

    if (!this.firstFrameReceived) {
      this.firstFrameReceived = true
      this._startWatchdog()
      this.emit('firstFrame')
    }

    if (reset) {
      this.clearResetFlag().catch(() => {})
      this.emit('reset')
    }

    this.emit('data', push)
  }

// C# 脉冲扩展算法
private calPosition(last32: number, enc16: number): number {
  const last16 = last32 & 0xffff;
  const d = (enc16 - last16) << 16 >> 16; // 有符号差值
  return last32 + d;
}



private parseDataPush(payload: Buffer): void {
  if (payload.length < 4) return; // B0 + B1 + AD0 至少4字节

  const dbm = payload[1];
  // 计算预期总长度（与C#完全一致）
  let expectedLen = 4; // B0(1) + B1(1) + AD0(2)
  if (dbm & 0x80) expectedLen += 4;  // In + InChange (各2字节)
  if (dbm & 0x40) expectedLen += 2;  // POS0 (2字节)
  if (dbm & 0x20) expectedLen += 2;  // pos0 (2字节)
  if (dbm & 0x10) expectedLen += 2;  // Out (2字节)
  if (dbm & 0x08) expectedLen += 2;  // AD1 (2字节)

  // 长度不匹配则丢弃该包（问题关键修复）
  if (expectedLen !== payload.length) {
    // console.warn('Data packet length mismatch', expectedLen, payload.length);
    return;
  }

  const systick = payload[0] & 0x7f;
  const reset = !!(dbm & 0x01);
  let offset = 2;

  // AD0 (始终存在)
  const ad0 = payload.readUInt16LE(offset);
  this.lastAd0 = ad0;
  offset += 2;

  // In + InChange
  let inVal = this.lastIn;
  let inChange: number | undefined;
  if (dbm & 0x80) {
    inVal = payload.readUInt16LE(offset);
    inChange = payload.readUInt16LE(offset + 2);
    this.lastIn = inVal;
    offset += 4;
  }

  // POS0 (ENC1)
  let pos0: number | undefined;
  let pos0Raw: number | undefined;
  if (dbm & 0x40) {
    pos0Raw = payload.readUInt16LE(offset);
    this.pos0High = this.calPosition(this.pos0High, pos0Raw);
    pos0 = this.pos0High;
    offset += 2;
  }

  // pos0 (ENC2)
  let pos1: number | undefined;
  let pos1Raw: number | undefined;
  if (dbm & 0x20) {
    pos1Raw = payload.readUInt16LE(offset);
    this.pos1High = this.calPosition(this.pos1High, pos1Raw);
    pos1 = this.pos1High;
    offset += 2;
  }

  // Out
  let out = this.lastOut;
  if (dbm & 0x10) {
    out = payload.readUInt16LE(offset);
    this.lastOut = out;
    offset += 2;
  }

  // AD1
  let ad1 = this.lastAd1;
  if (dbm & 0x08) {
    ad1 = payload.readUInt16LE(offset);
    this.lastAd1 = ad1;
    offset += 2;
  }

  const push: PushData = {
    systick,
    ad0,
    ad1: (dbm & 0x08) ? ad1 : undefined,
    in: (dbm & 0x80) ? inVal : undefined,
    inChange,
    out: (dbm & 0x10) ? out : undefined,
    pos0,
    pos1,
    pos0Raw,
    pos1Raw,
    reset,
  };

  this.emit('data', push);
}

  private handleResponse(payload: Buffer): void {
    // 检查是否是 RN 主动推送
    if (payload.length >= 3 && payload[1] === 0x52 && payload[2] === 0x4e) {
      if (payload.length >= 7) {
        this.emit('runResult', { status: payload[3], serial: payload.readUInt32LE(4) } as RunResult)
      }
    }

    if (this.currentRequest && this._matchPrefix(payload, this.currentRequest.expectedPrefix)) {
      clearTimeout(this.currentRequest.timeoutTimer)
      this.currentRequest.resolve(payload)
      this.currentRequest = null
      this._processNext()
      return
    }

    for (let i = 0; i < this.pendingRequests.length; i++) {
      if (this._matchPrefix(payload, this.pendingRequests[i].expectedPrefix)) {
        const req = this.pendingRequests.splice(i, 1)[0]
        clearTimeout(req.timeoutTimer)
        req.resolve(payload)
        break
      }
    }
  }

  private _matchPrefix(payload: Buffer, prefix: Buffer): boolean {
    if (payload.length < prefix.length + 1) return false
    for (let i = 0; i < prefix.length; i++) {
      if (payload[i + 1] !== prefix[i]) return false
    }
    return true
  }

  // ─── 命令队列 ───────────────────────────────────────────────────────────

  private _processNext(): void {
    if (this.pendingRequests.length === 0) return
    const next = this.pendingRequests.shift()!
    this.currentRequest = next
    this._sendRaw(next.command, next.expectedPrefix, next.retryCount)
  }

  private _sendRaw(cmd: Buffer, expectedPrefix: Buffer, retryCount: number): void {
    if (!this.connected || !this.socket) {
      if (this.currentRequest) {
        this.currentRequest.reject(new Error('Not connected'))
        this.currentRequest = null
      }
      return
    }
    const fullCmd = Buffer.concat([Buffer.from([0x80]), cmd])
    const wire = encode7E(Buffer.concat([fullCmd, Buffer.from([crc8(fullCmd)])]))
    this.socket.write(wire)

    const timeoutTimer = setTimeout(() => {
      if (this.currentRequest?.command === cmd) {
        if (retryCount < this.opts.maxRetries) {
          this._sendRaw(cmd, expectedPrefix, retryCount + 1)
        } else {
          this.currentRequest.reject(new Error('Request timeout after retries'))
          this.currentRequest = null
          this._processNext()
        }
      }
    }, this.opts.commandTimeout)

    if (this.currentRequest) this.currentRequest.timeoutTimer = timeoutTimer
  }

  private _sendCommand<T>(
    builder: () => { cmd: Buffer; expectedPrefix: Buffer },
    parser: (resp: Buffer) => T,
  ): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Not connected'))
    const { cmd, expectedPrefix } = builder()
    return new Promise((resolve, reject) => {
      const req: PendingRequest = {
        resolve: (resp) => { try { resolve(parser(resp)) } catch (e) { reject(e) } },
        reject,
        timeoutTimer: setTimeout(() => {}, 0),
        retryCount: 0,
        expectedPrefix,
        command: cmd,
      }
      if (this.currentRequest === null) {
        this.currentRequest = req
        this._sendRaw(cmd, expectedPrefix, 0)
      } else {
        this.pendingRequests.push(req)
      }
    })
  }

  // ─── 内部工具 ───────────────────────────────────────────────────────────

  private _resetCache(): void {
    this.pos0High = 0; this.pos1High = 0
    this.lastPos0Raw = 0; this.lastPos1Raw = 0
    this.lastAd0 = 0; this.lastAd1 = 0; this.lastIn = 0; this.lastOut = 0
    this.lastPos0 = 0; this.lastPos1 = 0
  }

  private _clearAllPending(reason: string): void {
    const err = new Error(reason)
    for (const req of this.pendingRequests) { clearTimeout(req.timeoutTimer); req.reject(err) }
    this.pendingRequests = []
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timeoutTimer)
      this.currentRequest.reject(err)
      this.currentRequest = null
    }
  }

  // ─── 公开缓存读取 ────────────────────────────────────────────────────────

  getCachedAd0(): number { return this.lastAd0 }
  getCachedAd1(): number { return this.lastAd1 }
  getCachedIn(): number { return this.lastIn }
  getCachedOut(): number { return this.lastOut }
  getCachedPos0Raw(): number { return this.lastPos0Raw }
  getCachedPos0(): number { return this.lastPos0 }
  getCachedPos1(): number { return this.lastPos1 }

  // ─── 编码器同步 ──────────────────────────────────────────────────────────

  async syncPos0(): Promise<number> {
    const v = await this.getPos0()
    this.pos0High = (v >> 16) & 0xffff; this.lastPos0Raw = v & 0xffff; this.lastPos0 = v
    return v
  }

  async syncPos1(): Promise<number> {
    const v = await this.getPos1()
    this.pos1High = (v >> 16) & 0xffff; this.lastPos1Raw = v & 0xffff; this.lastPos1 = v
    return v
  }

  async syncAllPos(): Promise<{ pos0: number; pos1: number }> {
    const { pos0, pos1 } = await this.getPosAll()
    this.pos0High = (pos0 >> 16) & 0xffff; this.lastPos0Raw = pos0 & 0xffff; this.lastPos0 = pos0
    this.pos1High = (pos1 >> 16) & 0xffff; this.lastPos1Raw = pos1 & 0xffff; this.lastPos1 = pos1
    return { pos0, pos1 }
  }

  // ─── IO 指令 ─────────────────────────────────────────────────────────────

  async getInput(): Promise<number> { return this._sendCommand(IOCommands.getInput, (r) => r.readUInt16LE(3)) }
  async getOutput(): Promise<number> { return this._sendCommand(IOCommands.getOutput, (r) => r.readUInt16LE(3)) }
  async setOutput(mask: number, value: number): Promise<void> {
    await this._sendCommand(() => IOCommands.setOutput(mask, value), () => undefined)
  }
  async getPos0(): Promise<number> { return this._sendCommand(IOCommands.getPos0, (r) => r.readInt32LE(4)) }
  async getPos1(): Promise<number> { return this._sendCommand(IOCommands.getPos1, (r) => r.readInt32LE(4)) }
  async getPosAll(): Promise<EncAll> {
    return this._sendCommand(IOCommands.getPosAll, (r) => ({ pos0: r.readInt32LE(4), pos1: r.readInt32LE(8) }))
  }
  async getSystemTick(): Promise<number> { return this._sendCommand(IOCommands.getSystemTick, (r) => r.readUInt32LE(2)) }

  // ─── 运动参数 ────────────────────────────────────────────────────────────

  async setRunParamSpeed(v: number): Promise<void> { await this._sendCommand(() => RunCommands.setSpeed(v), () => undefined) }
  async setRunParamInitSpeed(sv: number): Promise<void> { await this._sendCommand(() => RunCommands.setInitSpeed(sv), () => undefined) }
  async setRunParamAccelTime(ms: number): Promise<void> { await this._sendCommand(() => RunCommands.setAccelTime(ms), () => undefined) }
  async setRunParamDecelTime(ms: number): Promise<void> { await this._sendCommand(() => RunCommands.setDecelTime(ms), () => undefined) }
  async setRunParamHomeSpeed1(s: number): Promise<void> { await this._sendCommand(() => RunCommands.setHomeSpeed1(s), () => undefined) }
  async setRunParamHomeSpeed2(s: number): Promise<void> { await this._sendCommand(() => RunCommands.setHomeSpeed2(s), () => undefined) }
  async getRunParamSpeed(): Promise<number> { return this._sendCommand(RunCommands.getSpeed, (r) => r.readUInt32LE(3)) }
  async getRunParamInitSpeed(): Promise<number> { return this._sendCommand(RunCommands.getInitSpeed, (r) => r.readUInt32LE(3)) }
  async getRunParamAccelTime(): Promise<number> { return this._sendCommand(RunCommands.getAccelTime, (r) => r.readUInt32LE(3)) }
  async getRunParamDecelTime(): Promise<number> { return this._sendCommand(RunCommands.getDecelTime, (r) => r.readUInt32LE(3)) }
  async getRunParamHomeSpeed1(): Promise<number> { return this._sendCommand(RunCommands.getHomeSpeed1, (r) => r.readUInt32LE(3)) }
  async getRunParamHomeSpeed2(): Promise<number> { return this._sendCommand(RunCommands.getHomeSpeed2, (r) => r.readUInt32LE(3)) }

  // ─── 运动动作 ────────────────────────────────────────────────────────────

  async moveToPosition(targetPos: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter
    await this._sendCommand(() => RunCommands.moveToPosition(targetPos, s), () => undefined)
  }
  async moveRelative(pulses: number, serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter
    await this._sendCommand(() => RunCommands.moveRelative(pulses, s), () => undefined)
  }
  async moveForward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter
    await this._sendCommand(() => RunCommands.forward(s), () => undefined)
  }
  async moveBackward(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter
    await this._sendCommand(() => RunCommands.backward(s), () => undefined)
  }
  async home(serial?: number): Promise<void> {
    const s = serial ?? ++this.serialCounter
    await this._sendCommand(() => RunCommands.home(s), () => undefined)
  }
  async stopDecel(): Promise<void> { await this._sendCommand(RunCommands.stopDecel, () => undefined) }
  async stopEmergency(): Promise<void> { await this._sendCommand(RunCommands.stopEmergency, () => undefined) }
  async getRunResult(): Promise<RunResult> {
    return this._sendCommand(RunCommands.getRunResult, (r) => ({ status: r[3], serial: r.readUInt32LE(4) }))
  }

  // ─── 系统参数 ────────────────────────────────────────────────────────────

  async getSavedParam(index: number): Promise<number> {
    return this._sendCommand(() => ParamCommands.getSavedParam(index), (r) => r.readUInt32LE(3))
  }
  async setSavedParam(index: number, value: number): Promise<void> {
    await this._sendCommand(() => ParamCommands.setSavedParam(index, value), () => undefined)
  }
  async getTempParam(index: number): Promise<number> {
    return this._sendCommand(() => ParamCommands.getTempParam(index), (r) => r.readUInt32LE(3))
  }
  async setTempParam(index: number, value: number): Promise<void> {
    await this._sendCommand(() => ParamCommands.setTempParam(index, value), () => undefined)
  }
  async applyParams(): Promise<void> { await this._sendCommand(ParamCommands.applyParams, () => undefined) }
  async softReset(seconds: number): Promise<void> {
    await this._sendCommand(() => ParamCommands.softReset(seconds), () => undefined)
  }
  async clearResetFlag(): Promise<void> { await this._sendCommand(ParamCommands.clearResetFlag, () => undefined) }
}
