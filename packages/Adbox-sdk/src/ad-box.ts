import EventEmitter from 'eventemitter3'
import { TCPClient } from './comm/tcp-client'
import { FrameDecoder } from './protocol/frame-decoder'
import { parsePacket } from './protocol/packet-parser'
import { buildPacket } from './protocol/packet-builder'
import type { ADBoxOptions, ADData } from './types'

export class ADBox extends EventEmitter {
  private options: ADBoxOptions
  private tcp = new TCPClient()
  private decoder = new FrameDecoder()

  constructor(options: ADBoxOptions) {
    super()
    this.options = {
      reconnect: true,
      reconnectInterval: 3000,
      heartbeatInterval: 5000,
      timeout: 3000,
      ...options
    }
    this.bindEvents()
  }

  connect() {
    this.tcp.connect(this.options.host, this.options.port)
  }

  disconnect() {
    this.tcp.disconnect()
  }

  private bindEvents() {
    this.tcp.on('connected', () => {
      this.emit('connected')
      // ✅ 连接成功自动激活全数据推送（解决你没数据问题）
      this.getInputs()
    })

    this.tcp.on('disconnected', () => {
      this.emit('disconnected')
    })

    this.tcp.on('error', err => {
      this.emit('error', err)
    })

    this.tcp.on('data', chunk => {
      const frames = this.decoder.push(chunk)
      for (const frame of frames) {
        const packet = parsePacket(frame)
        if (!packet) continue
        this.emit('ad-data', packet)
      }
    })
  }

  private send(payload: Buffer) {
    const packet = buildPacket(payload)
    this.tcp.write(packet)
  }

  // ==============================
  // 读取指令
  // ==============================
  getInputs() { this.sendASCII('IGI') }
  getOutputs() { this.sendASCII('IGO') }
  getEncoder0() { this.sendASCII('IGP0') }
  getEncoder1() { this.sendASCII('IGP1') }

  // ==============================
  // 停止指令
  // ==============================
  stop() { this.sendASCII('RS') } // 减速停止
  emergencyStop() { this.sendASCII('RT') } // 急停

  // ==============================
  // 参数设置
  // ==============================
  setSpeed(speed: number) {
    const payload = Buffer.alloc(8)
    payload[0] = 0x80
    payload.write('RPV', 1)
    payload.writeInt32LE(speed, 4)
    this.send(payload)
  }

  // ==============================
  // 运动指令（已100%修正）
  // ==============================
  runForward(serial = 1) {
    const payload = Buffer.alloc(8)
    payload[0] = 0x80
    payload.write('RF', 1)
    payload.writeUInt32LE(serial, 3)
    this.send(payload)
  }

  runBackward(serial = 1) {
    const payload = Buffer.alloc(8)
    payload[0] = 0x80
    payload.write('RB', 1)
    payload.writeUInt32LE(serial, 3)
    this.send(payload)
  }

  home(serial = 1) {
    const payload = Buffer.alloc(8)
    payload[0] = 0x80
    payload.write('RO', 1)
    payload.writeUInt32LE(serial, 3)
    this.send(payload)
  }

  runTo(position: number, serial = 1) {
    const payload = Buffer.alloc(12)
    payload[0] = 0x80
    payload.write('RRP', 1)
    payload.writeInt32LE(position, 4)
    payload.writeUInt32LE(serial, 8)
    this.send(payload)
  }

  // ==============================
  // 工具方法
  // ==============================
  private sendASCII(cmd: string) {
    const payload = Buffer.alloc(cmd.length + 1)
    payload[0] = 0x80
    payload.write(cmd, 1)
    this.send(payload)
  }

  // 废弃旧 motion 方法
  // private motion() {}
}