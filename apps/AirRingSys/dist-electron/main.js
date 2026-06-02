import { ipcMain, app, globalShortcut, BrowserWindow } from "electron";
import fs, { mkdirSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as net from "net";
import { EventEmitter } from "events";
import { Buffer as Buffer$1 } from "buffer";
import { appendFile } from "node:fs/promises";
import { inspect } from "node:util";
function encode7E(frame) {
  const escaped = [];
  for (const byte of frame) {
    if (byte === 126) {
      escaped.push(125, 94);
    } else if (byte === 125) {
      escaped.push(125, 93);
    } else {
      escaped.push(byte);
    }
  }
  return Buffer.concat([Buffer.from([126]), Buffer.from(escaped), Buffer.from([126])]);
}
function decode7E(data) {
  let start = -1;
  let end = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 126) {
      if (start === -1) {
        start = i;
      } else {
        end = i;
        break;
      }
    }
  }
  if (start === -1 || end === -1) return null;
  const frame = data.subarray(start + 1, end);
  const decoded = [];
  for (let j = 0; j < frame.length; j++) {
    if (frame[j] === 125) {
      if (j + 1 >= frame.length) return null;
      const next = frame[j + 1];
      if (next === 94) decoded.push(126);
      else if (next === 93) decoded.push(125);
      else return null;
      j++;
    } else {
      decoded.push(frame[j]);
    }
  }
  return { payload: Buffer.from(decoded), consumed: end + 1 };
}
function crc8(data) {
  let crc = 0;
  const poly = 49;
  for (const byte of data) {
    let b = byte;
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      if (crc & 128) {
        crc = crc << 1 ^ poly;
      } else {
        crc <<= 1;
      }
      crc &= 255;
    }
  }
  return crc;
}
class FrameParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }
  /**
   * 喂入原始数据，返回所有已校验通过的完整载荷
   */
  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames = [];
    while (true) {
      const result = decode7E(this.buffer);
      if (!result) break;
      const { payload, consumed } = result;
      if (payload.length >= 1) {
        const dataWithoutCrc = payload.subarray(0, payload.length - 1);
        const receivedCrc = payload[payload.length - 1];
        if (crc8(dataWithoutCrc) === receivedCrc) {
          frames.push(dataWithoutCrc);
        }
      }
      this.buffer = this.buffer.subarray(consumed);
    }
    return frames;
  }
  clear() {
    this.buffer = Buffer.alloc(0);
  }
}
class IOCommands {
  /**
   * 获取输入状态指令
   */
  static getInput() {
    return {
      cmd: Buffer$1.from("IGI"),
      expectedPrefix: Buffer$1.from("IGI")
    };
  }
  /**
   * 获取输出状态指令
   */
  static getOutput() {
    return {
      cmd: Buffer$1.from("IGO"),
      expectedPrefix: Buffer$1.from("IGO")
    };
  }
  /**
   * 设置输出端口
   * @param mask 位掩码
   * @param value 目标值（仅 mask 指定的位有效）
   */
  static setOutput(mask, value) {
    const cmd = Buffer$1.alloc(2 + 2 + 2);
    cmd.write("ISO", 0, 3, "ascii");
    cmd.writeUInt16LE(mask, 3);
    cmd.writeUInt16LE(value, 5);
    return { cmd, expectedPrefix: Buffer$1.from("ISO") };
  }
  /**
   * 获取编码器0 (32位)
   */
  static getPos0() {
    return {
      cmd: Buffer$1.from("IGP0"),
      expectedPrefix: Buffer$1.from("IGP0")
    };
  }
  /**
   * 获取编码器1 (32位)
   */
  static getPos1() {
    return {
      cmd: Buffer$1.from("IGP1"),
      expectedPrefix: Buffer$1.from("IGP1")
    };
  }
  /**
   * 获取双编码器
   */
  static getPosAll() {
    return {
      cmd: Buffer$1.from("IGPA"),
      expectedPrefix: Buffer$1.from("IGPA")
    };
  }
  /**
   * 获取系统 Tick
   */
  static getSystemTick() {
    return {
      cmd: Buffer$1.from("ST"),
      expectedPrefix: Buffer$1.from("ST")
    };
  }
}
class RunCommands {
  // ---------- 参数设置 ----------
  static setSpeed(velocity) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(velocity, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RPV"), buf]), expectedPrefix: Buffer$1.from("RPV") };
  }
  static setInitSpeed(sv) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(sv, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RPS"), buf]), expectedPrefix: Buffer$1.from("RPS") };
  }
  static setAccelTime(ms) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(ms, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RPU"), buf]), expectedPrefix: Buffer$1.from("RPU") };
  }
  static setDecelTime(ms) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(ms, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RPD"), buf]), expectedPrefix: Buffer$1.from("RPD") };
  }
  static setHomeSpeed1(speed) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(speed, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RP1"), buf]), expectedPrefix: Buffer$1.from("RP1") };
  }
  static setHomeSpeed2(speed) {
    const buf = Buffer$1.alloc(4);
    buf.writeUInt32LE(speed, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("RP2"), buf]), expectedPrefix: Buffer$1.from("RP2") };
  }
  // ---------- 参数读取 ----------
  static getSpeed() {
    return { cmd: Buffer$1.from("RpV"), expectedPrefix: Buffer$1.from("RpV") };
  }
  static getInitSpeed() {
    return { cmd: Buffer$1.from("RpS"), expectedPrefix: Buffer$1.from("RpS") };
  }
  static getAccelTime() {
    return { cmd: Buffer$1.from("RpU"), expectedPrefix: Buffer$1.from("RpU") };
  }
  static getDecelTime() {
    return { cmd: Buffer$1.from("RpD"), expectedPrefix: Buffer$1.from("RpD") };
  }
  static getHomeSpeed1() {
    return { cmd: Buffer$1.from("Rp1"), expectedPrefix: Buffer$1.from("Rp1") };
  }
  static getHomeSpeed2() {
    return { cmd: Buffer$1.from("Rp2"), expectedPrefix: Buffer$1.from("Rp2") };
  }
  // ---------- 运动动作 ----------
  static moveToPosition(targetPos, serial) {
    const cmd = Buffer$1.alloc(3 + 4 + 4);
    cmd.write("RRP", 0, 3, "ascii");
    cmd.writeInt32LE(targetPos, 3);
    cmd.writeUInt32LE(serial, 7);
    return { cmd, expectedPrefix: Buffer$1.from("RRP") };
  }
  static moveRelative(pulses, serial) {
    const sign = pulses >= 0 ? "+" : "-";
    const absVal = Math.abs(pulses);
    const cmd = Buffer$1.alloc(3 + 4 + 4);
    cmd.write(`RR${sign}`, 0, 3, "ascii");
    cmd.writeUInt32LE(absVal, 3);
    cmd.writeUInt32LE(serial, 7);
    return { cmd, expectedPrefix: Buffer$1.from(`RR${sign}`) };
  }
  static forward(serial) {
    const cmd = Buffer$1.alloc(3 + 4);
    cmd.write("RF", 0, 2, "ascii");
    cmd.writeUInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer$1.from("RF") };
  }
  static backward(serial) {
    const cmd = Buffer$1.alloc(3 + 4);
    cmd.write("RB", 0, 2, "ascii");
    cmd.writeUInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer$1.from("RB") };
  }
  static home(serial) {
    const cmd = Buffer$1.alloc(3 + 4);
    cmd.write("RO", 0, 2, "ascii");
    cmd.writeUInt32LE(serial, 2);
    return { cmd, expectedPrefix: Buffer$1.from("RO") };
  }
  static stopDecel() {
    return { cmd: Buffer$1.from("RS"), expectedPrefix: Buffer$1.from("RS") };
  }
  static stopEmergency() {
    return { cmd: Buffer$1.from("RT"), expectedPrefix: Buffer$1.from("RT") };
  }
  static getRunResult() {
    return { cmd: Buffer$1.from("RN"), expectedPrefix: Buffer$1.from("RN") };
  }
}
class ParamCommands {
  /**
   * 读取保存的参数
   * @param index 参数索引 (0~4)
   */
  static getSavedParam(index) {
    const idxBuf = Buffer$1.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("PG"), idxBuf]), expectedPrefix: Buffer$1.from("PG") };
  }
  /**
   * 设置保存的参数（写入 Flash）
   */
  static setSavedParam(index, value) {
    const idxBuf = Buffer$1.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    const valBuf = Buffer$1.alloc(4);
    valBuf.writeUInt32LE(value, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("PS"), idxBuf, valBuf]), expectedPrefix: Buffer$1.from("PS") };
  }
  /**
   * 读取临时参数（不保存）
   */
  static getTempParam(index) {
    const idxBuf = Buffer$1.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("Pg"), idxBuf]), expectedPrefix: Buffer$1.from("Pg") };
  }
  /**
   * 设置临时参数
   */
  static setTempParam(index, value) {
    const idxBuf = Buffer$1.alloc(2);
    idxBuf.writeUInt16LE(index, 0);
    const valBuf = Buffer$1.alloc(4);
    valBuf.writeUInt32LE(value, 0);
    return { cmd: Buffer$1.concat([Buffer$1.from("Ps"), idxBuf, valBuf]), expectedPrefix: Buffer$1.from("Ps") };
  }
  /**
   * 应用参数（使设置生效）
   */
  static applyParams() {
    return { cmd: Buffer$1.from("PA"), expectedPrefix: Buffer$1.from("PA") };
  }
  /**
   * 软件复位
   * @param seconds 延迟秒数后停止喂狗
   */
  static softReset(seconds) {
    const cmd = Buffer$1.alloc(3 + 1 + 5);
    cmd.write("PR", 0, 2, "ascii");
    cmd.writeUInt8(seconds, 2);
    cmd.write("reset", 3, 5, "ascii");
    return { cmd, expectedPrefix: Buffer$1.from("PR") };
  }
  /**
   * 清除复位标志位（通知上位机已知道重启）
   */
  static clearResetFlag() {
    return { cmd: Buffer$1.from("Pr"), expectedPrefix: Buffer$1.from("Pr") };
  }
}
class ADBoxClient extends EventEmitter {
  constructor(host = "192.168.251.12", port = 20020) {
    super();
    this.host = host;
    this.port = port;
    this.socket = null;
    this.connected = false;
    this.parser = new FrameParser();
    this.pendingRequests = [];
    this.currentRequest = null;
    this.serialCounter = 0;
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
  }
  async connect(timeout = 5e3) {
    return new Promise((resolve, reject) => {
      if (this.socket) this.disconnect();
      this.socket = new net.Socket();
      const timer = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error("Connection timeout"));
      }, timeout);
      this.socket.connect(this.port, this.host, () => {
        clearTimeout(timer);
        this.connected = true;
        this.parser.clear();
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
        this.emit("connected");
        resolve();
      });
      this.socket.on("data", (chunk) => this.handleData(chunk));
      this.socket.on("error", (err) => {
        clearTimeout(timer);
        this.connected = false;
        this.emit("error", err);
        reject(err);
      });
      this.socket.on("close", () => {
        this.connected = false;
        this.clearAllPending("Connection closed");
        this.emit("close");
      });
    });
  }
  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.clearAllPending("Disconnected");
  }
  clearAllPending(reason) {
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
  handleData(chunk) {
    const frames = this.parser.feed(chunk);
    for (const frame of frames) {
      this.processFrame(frame);
    }
  }
  processFrame(frame) {
    if (frame.length === 0) return;
    const b0 = frame[0];
    const pt = (b0 & 128) !== 0;
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
  extendTo32Bits(raw16, lastRaw, currentHigh) {
    let newHigh = currentHigh;
    if (lastRaw > 49152 && raw16 < 16384) {
      newHigh++;
    } else if (lastRaw < 16384 && raw16 > 49152) {
      newHigh--;
    }
    const value32 = (newHigh << 16) + raw16;
    return { value32, newHigh };
  }
  parseDataPush(payload) {
    if (payload.length < 2) return;
    const systick = payload[0] & 127;
    const b1 = payload[1];
    let offset = 2;
    const hasIn = (b1 & 128) !== 0;
    const hasPos0 = (b1 & 64) !== 0;
    const hasPos1 = (b1 & 32) !== 0;
    const hasOut = (b1 & 16) !== 0;
    const hasAd1 = (b1 & 8) !== 0;
    const hasReset = (b1 & 1) !== 0;
    let ad0 = this.lastAd0;
    if (offset + 1 < payload.length) {
      ad0 = payload.readUInt16LE(offset);
      this.lastAd0 = ad0;
      offset += 2;
    }
    let inVal = this.lastIn;
    let inChange;
    if (hasIn && offset + 3 < payload.length) {
      inVal = payload.readUInt16LE(offset);
      inChange = payload.readUInt16LE(offset + 2);
      this.lastIn = inVal;
      offset += 4;
    }
    let pos0 = this.lastPos0;
    let pos0Raw;
    if (hasPos0 && offset + 1 < payload.length) {
      pos0Raw = payload.readUInt16LE(offset);
      const { value32, newHigh } = this.extendTo32Bits(pos0Raw, this.lastPos0Raw, this.pos0High);
      pos0 = value32;
      this.lastPos0 = pos0;
      this.pos0High = newHigh;
      this.lastPos0Raw = pos0Raw;
      offset += 2;
    }
    let pos1 = this.lastPos1;
    let pos1Raw;
    if (hasPos1 && offset + 1 < payload.length) {
      pos1Raw = payload.readUInt16LE(offset);
      const { value32, newHigh } = this.extendTo32Bits(pos1Raw, this.lastPos1Raw, this.pos1High);
      pos1 = value32;
      this.lastPos1 = pos1;
      this.pos1High = newHigh;
      this.lastPos1Raw = pos1Raw;
      offset += 2;
    }
    let out = this.lastOut;
    if (hasOut && offset + 1 < payload.length) {
      out = payload.readUInt16LE(offset);
      this.lastOut = out;
      offset += 2;
    }
    let ad1 = this.lastAd1;
    if (hasAd1 && offset + 1 < payload.length) {
      ad1 = payload.readUInt16LE(offset);
      this.lastAd1 = ad1;
      offset += 2;
    }
    const push = {
      systick,
      ad0,
      ad1: hasAd1 ? ad1 : void 0,
      in: hasIn ? inVal : void 0,
      inChange: hasIn ? inChange : void 0,
      out: hasOut ? out : void 0,
      pos0Raw: hasPos0 ? pos0Raw : void 0,
      pos1Raw: hasPos1 ? pos1Raw : void 0,
      pos0: hasPos0 ? pos0 : void 0,
      pos1: hasPos1 ? pos1 : void 0,
      reset: hasReset
    };
    this.emit("data", push);
  }
  handleResponse(payload) {
    if (payload.length >= 3 && payload[1] === 82 && payload[2] === 78) {
      if (payload.length >= 7) {
        const status = payload[3];
        const serial = payload.readUInt32LE(4);
        this.emit("runResult", { status, serial });
      }
    }
    if (this.currentRequest && this.matchPrefix(payload, this.currentRequest.expectedPrefix)) {
      clearTimeout(this.currentRequest.timeoutTimer);
      this.currentRequest.resolve(payload);
      this.currentRequest = null;
      this.processNextRequest();
      return;
    }
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
  matchPrefix(payload, prefix) {
    if (payload.length < prefix.length + 1) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (payload[i + 1] !== prefix[i]) return false;
    }
    return true;
  }
  processNextRequest() {
    if (this.pendingRequests.length === 0) return;
    const next = this.pendingRequests.shift();
    this.currentRequest = next;
    this.sendRawRequest(next.command, next.expectedPrefix, next.retryCount);
  }
  sendRawRequest(cmd, expectedPrefix, retryCount) {
    if (!this.connected || !this.socket) {
      if (this.currentRequest) {
        this.currentRequest.reject(new Error("Not connected"));
        this.currentRequest = null;
      }
      return;
    }
    const fullCmd = Buffer.concat([Buffer.from([128]), cmd]);
    const frame = Buffer.concat([fullCmd, Buffer.from([crc8(fullCmd)])]);
    const wire = encode7E(frame);
    this.socket.write(wire);
    const timeoutTimer = setTimeout(() => {
      if (this.currentRequest && this.currentRequest.command === cmd) {
        if (retryCount < 2) {
          this.sendRawRequest(cmd, expectedPrefix, retryCount + 1);
        } else {
          this.currentRequest.reject(new Error("Request timeout after retries"));
          this.currentRequest = null;
          this.processNextRequest();
        }
      }
    }, 1e3);
    if (this.currentRequest) this.currentRequest.timeoutTimer = timeoutTimer;
  }
  async sendCommand(builder, parser) {
    if (!this.connected) throw new Error("Not connected");
    const { cmd, expectedPrefix } = builder();
    return new Promise((resolve, reject) => {
      const pending = {
        resolve: (resp) => {
          try {
            resolve(parser(resp));
          } catch (e) {
            reject(e);
          }
        },
        reject,
        timeoutTimer: setTimeout(() => {
        }, 0),
        retryCount: 0,
        expectedPrefix,
        command: cmd
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
  async syncPos0() {
    const value = await this.getPos0();
    this.pos0High = value >> 16 & 65535;
    this.lastPos0Raw = value & 65535;
    this.lastPos0 = value;
    return value;
  }
  async syncPos1() {
    const value = await this.getPos1();
    this.pos1High = value >> 16 & 65535;
    this.lastPos1Raw = value & 65535;
    this.lastPos1 = value;
    return value;
  }
  async syncAllPos() {
    const { pos0, pos1 } = await this.getPosAll();
    this.pos0High = pos0 >> 16 & 65535;
    this.lastPos0Raw = pos0 & 65535;
    this.lastPos0 = pos0;
    this.pos1High = pos1 >> 16 & 65535;
    this.lastPos1Raw = pos1 & 65535;
    this.lastPos1 = pos1;
    return { pos0, pos1 };
  }
  // ========== 获取当前缓存的最新值（不发送指令）==========
  getCachedAd0() {
    return this.lastAd0;
  }
  getCachedAd1() {
    return this.lastAd1;
  }
  getCachedIn() {
    return this.lastIn;
  }
  getCachedOut() {
    return this.lastOut;
  }
  getCachedPos0() {
    return this.lastPos0;
  }
  getCachedPos1() {
    return this.lastPos1;
  }
  // ========== 公开 API ==========
  async getInput() {
    return this.sendCommand(IOCommands.getInput, (resp) => resp.readUInt16LE(3));
  }
  async getOutput() {
    return this.sendCommand(IOCommands.getOutput, (resp) => resp.readUInt16LE(3));
  }
  async setOutput(mask, value) {
    await this.sendCommand(() => IOCommands.setOutput(mask, value), () => void 0);
  }
  async getPos0() {
    return this.sendCommand(IOCommands.getPos0, (resp) => resp.readInt32LE(4));
  }
  async getPos1() {
    return this.sendCommand(IOCommands.getPos1, (resp) => resp.readInt32LE(4));
  }
  async getPosAll() {
    return this.sendCommand(IOCommands.getPosAll, (resp) => ({
      pos0: resp.readInt32LE(4),
      pos1: resp.readInt32LE(8)
    }));
  }
  async getSystemTick() {
    return this.sendCommand(IOCommands.getSystemTick, (resp) => resp.readUInt32LE(2));
  }
  // 运动参数设置
  async setRunParamSpeed(velocity) {
    await this.sendCommand(() => RunCommands.setSpeed(velocity), () => void 0);
  }
  async setRunParamInitSpeed(sv) {
    await this.sendCommand(() => RunCommands.setInitSpeed(sv), () => void 0);
  }
  async setRunParamAccelTime(ms) {
    await this.sendCommand(() => RunCommands.setAccelTime(ms), () => void 0);
  }
  async setRunParamDecelTime(ms) {
    await this.sendCommand(() => RunCommands.setDecelTime(ms), () => void 0);
  }
  async setRunParamHomeSpeed1(speed) {
    await this.sendCommand(() => RunCommands.setHomeSpeed1(speed), () => void 0);
  }
  async setRunParamHomeSpeed2(speed) {
    await this.sendCommand(() => RunCommands.setHomeSpeed2(speed), () => void 0);
  }
  // 运动参数读取
  async getRunParamSpeed() {
    return this.sendCommand(RunCommands.getSpeed, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamInitSpeed() {
    return this.sendCommand(RunCommands.getInitSpeed, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamAccelTime() {
    return this.sendCommand(RunCommands.getAccelTime, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamDecelTime() {
    return this.sendCommand(RunCommands.getDecelTime, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamHomeSpeed1() {
    return this.sendCommand(RunCommands.getHomeSpeed1, (resp) => resp.readUInt32LE(3));
  }
  async getRunParamHomeSpeed2() {
    return this.sendCommand(RunCommands.getHomeSpeed2, (resp) => resp.readUInt32LE(3));
  }
  // 运动动作
  async moveToPosition(targetPos, serial) {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.moveToPosition(targetPos, s), () => void 0);
  }
  async moveRelative(pulses, serial) {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.moveRelative(pulses, s), () => void 0);
  }
  async moveForward(serial) {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.forward(s), () => void 0);
  }
  async moveBackward(serial) {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.backward(s), () => void 0);
  }
  async home(serial) {
    const s = serial ?? ++this.serialCounter;
    await this.sendCommand(() => RunCommands.home(s), () => void 0);
  }
  async stopDecel() {
    await this.sendCommand(RunCommands.stopDecel, () => void 0);
  }
  async stopEmergency() {
    await this.sendCommand(RunCommands.stopEmergency, () => void 0);
  }
  async getRunResult() {
    return this.sendCommand(RunCommands.getRunResult, (resp) => ({
      status: resp[3],
      serial: resp.readUInt32LE(4)
    }));
  }
  // 系统参数
  async getSavedParam(index) {
    return this.sendCommand(() => ParamCommands.getSavedParam(index), (resp) => resp.readUInt32LE(3));
  }
  async setSavedParam(index, value) {
    await this.sendCommand(() => ParamCommands.setSavedParam(index, value), () => void 0);
  }
  async getTempParam(index) {
    return this.sendCommand(() => ParamCommands.getTempParam(index), (resp) => resp.readUInt32LE(3));
  }
  async setTempParam(index, value) {
    await this.sendCommand(() => ParamCommands.setTempParam(index, value), () => void 0);
  }
  async applyParams() {
    await this.sendCommand(ParamCommands.applyParams, () => void 0);
  }
  async softReset(seconds) {
    await this.sendCommand(() => ParamCommands.softReset(seconds), () => void 0);
  }
  async clearResetFlag() {
    await this.sendCommand(ParamCommands.clearResetFlag, () => void 0);
  }
}
const LOGO_PATH_CANDIDATES = ["D:/logo/logo.png"];
const getLogoPathCandidates = () => {
  const candidates = [
    ...LOGO_PATH_CANDIDATES,
    process.env.VITE_PUBLIC ? join(process.env.VITE_PUBLIC, "logo.png") : void 0,
    process.env.APP_ROOT ? join(process.env.APP_ROOT, "public", "logo.png") : void 0,
    process.env.APP_ROOT ? join(process.env.APP_ROOT, "dist", "logo.png") : void 0
  ];
  return [
    ...new Set(candidates.filter((item) => Boolean(item)))
  ];
};
const readLogoAsDataUrl = () => {
  for (const filePath of getLogoPathCandidates()) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const imageBuffer = fs.readFileSync(filePath);
      if (!imageBuffer.length) {
        continue;
      }
      const base64Image = Buffer.from(imageBuffer).toString("base64");
      return `data:image/png;base64,${base64Image}`;
    } catch (error) {
      console.error(`读取 logo 失败: ${filePath}`, error);
    }
  }
  return void 0;
};
function useIpcOn(channel, callback) {
  ipcMain.on(channel, (_, ...args) => {
    callback(...args);
  });
}
function useIpcHandle(channel, callback) {
  ipcMain.handle(channel, (_, ...args) => {
    return callback(...args);
  });
}
function useIpcSend(win2, channel, ...args) {
  if (win2.isDestroyed()) {
    return;
  }
  win2.webContents.send(channel, ...args);
}
let adb;
function initADBox(win2) {
  adb = new ADBoxClient("192.168.251.12", 20021);
  adb.on("connected", async () => {
    console.log("AD Box 已连接");
    await adb.syncAllPos();
    win2.webContents.send("adbox-connected");
  });
  adb.on("data", (push) => {
    useIpcSend(win2, "adbox:data", push);
  });
  adb.on("runResult", (result) => {
    useIpcSend(win2, "adbox:RunResult", result);
  });
  adb.on("error", (err) => {
    console.error("AD Box 错误:", err);
  });
  adb.connect();
}
function setupRendererCommunicator(win2) {
  useIpcOn("win-minimize", () => {
    win2.minimize();
  });
  useIpcOn("win-maximize", () => {
    const windowIsMax = win2.isMaximized();
    if (windowIsMax) {
      win2.restore();
    } else {
      win2.maximize();
    }
  });
  useIpcOn("win-close", () => {
    app.quit();
  });
  useIpcOn("win-toggle-fullscreen", () => {
    if (win2) {
      win2.setFullScreen(!win2.isFullScreen());
    }
  });
  useIpcHandle("win-get-logo", () => {
    if (win2) {
      return readLogoAsDataUrl();
    }
  });
  useIpcOn("ADBOX:FORW", async () => {
    try {
      await adb.moveForward(1);
    } catch (error) {
    }
  });
  useIpcOn("ADBOX:REV", async () => {
    try {
      await adb.moveBackward(1);
    } catch (error) {
    }
  });
  useIpcOn("ADBOX:STOP", async () => {
    try {
      await adb.stopDecel();
    } catch (error) {
    }
  });
  useIpcOn("ADBOX:HOME", async () => {
    try {
      await adb.home();
    } catch (error) {
    }
  });
}
const CONSOLE_LEVELS = ["log", "info", "warn", "error", "debug"];
const formatConsoleArg = (value) => {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  return inspect(value, {
    depth: 6,
    breakLength: Infinity,
    maxArrayLength: 200,
    compact: false
  });
};
const getLogFilePath = (dirPath, now) => {
  const date = now.toISOString().slice(0, 10);
  return join(dirPath, `main-console-${date}.log`);
};
const setupConsoleFileLogger = (app2) => {
  const dirPath = join(app2.getPath("userData"), "logs", "main-console");
  mkdirSync(dirPath, { recursive: true });
  const originalConsole = Object.fromEntries(
    CONSOLE_LEVELS.map((level) => [level, console[level].bind(console)])
  );
  let writeQueue = Promise.resolve();
  const writeLogLine = (line) => {
    const filePath = getLogFilePath(dirPath, /* @__PURE__ */ new Date());
    writeQueue = writeQueue.then(() => appendFile(filePath, line, "utf8")).catch((error) => {
      originalConsole.error("控制台日志写入失败:", error);
    });
  };
  for (const level of CONSOLE_LEVELS) {
    console[level] = (...args) => {
      originalConsole[level](...args);
      const now = /* @__PURE__ */ new Date();
      const message = args.map(formatConsoleArg).join(" ");
      const line = `${now.toISOString()} [${level.toUpperCase()}] ${message}
`;
      writeLogLine(line);
    };
  }
  return {
    dirPath,
    restore: () => {
      for (const level of CONSOLE_LEVELS) {
        console[level] = originalConsole[level];
      }
    }
  };
};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let restoreConsoleFileLogger = null;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    autoHideMenuBar: true,
    width: 1280,
    height: 1024,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs")
    }
  });
  if (win) {
    setupRendererCommunicator(win);
    initADBox(win);
  }
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
const getLock = app.requestSingleInstanceLock();
if (!getLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}
app.on("ready", () => {
  app.setLoginItemSettings({
    openAtLogin: true
  });
});
app.on("will-finish-launching", () => {
  if (process.platform !== "win32") {
    return;
  }
  if (!fs.existsSync("D:/JJSK_Data")) {
    fs.mkdirSync("D:/JJSK_Data");
  }
  app.setPath("appData", "D:/JJSK_Data");
});
app.on("before-quit", () => {
  win?.removeAllListeners("close");
  globalShortcut.unregisterAll();
  win?.close();
  restoreConsoleFileLogger?.();
  restoreConsoleFileLogger = null;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  const { dirPath, restore } = setupConsoleFileLogger(app);
  restoreConsoleFileLogger = restore;
  console.log("主进程控制台日志已写入:", dirPath);
  createWindow();
});
export {
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
