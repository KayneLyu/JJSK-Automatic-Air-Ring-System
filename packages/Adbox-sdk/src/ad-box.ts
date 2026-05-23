import EventEmitter from 'eventemitter3'

import { TCPClient } from './comm/tcp-client'

import { FrameDecoder } from './protocol/frame-decoder'

import { parsePacket } from './protocol/packet-parser'

import { buildPacket } from './protocol/packet-builder'

import type {
  ADBoxOptions,
  ADData
} from './types'

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

    this.tcp.connect(
      this.options.host,
      this.options.port
    )
  }

  disconnect() {

    this.tcp.disconnect()
  }

  private bindEvents() {

    this.tcp.on('connected', () => {

      this.emit('connected')
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

        if (!packet) {
          continue
        }

        this.emit('ad-data', packet)
      }
    })
  }

  private send(payload: Buffer) {

    const packet = buildPacket(payload)

    this.tcp.write(packet)
  }

  private sendASCII(cmd: string) {

    const payload = Buffer.alloc(cmd.length + 1)

    payload[0] = 0x80

    payload.write(cmd, 1)

    this.send(payload)
  }

  getInputs() {

    this.sendASCII('IGI')
  }

  getOutputs() {

    this.sendASCII('IGO')
  }

  getEncoder0() {

    this.sendASCII('IGP0')
  }

  getEncoder1() {

    this.sendASCII('IGP1')
  }

  stop() {

    this.sendASCII('RS')
  }

  emergencyStop() {

    this.sendASCII('RT')
  }

  setSpeed(speed: number) {

    const payload = Buffer.alloc(8)

    payload[0] = 0x80

    payload.write('RPV', 1)

    payload.writeInt32LE(speed, 4)

    this.send(payload)
  }

  runForward(step: number) {

    this.motion('RF', step)
  }

  runBackward(step: number) {

    this.motion('RB', step)
  }

  home(step = 0) {

    this.motion('RO', step)
  }

  runTo(position: number) {

    const payload = Buffer.alloc(11)

    payload[0] = 0x80

    payload.write('RRP', 1)

    payload.writeInt32LE(position, 4)

    this.send(payload)
  }

  setOutputs(mask: number, value: number) {

    const payload = Buffer.alloc(9)

    payload[0] = 0x80

    payload.write('ISO', 1)

    payload.writeUInt16LE(mask, 4)

    payload.writeUInt16LE(value, 6)

    this.send(payload)
  }

  private motion(cmd: string, value: number) {

    const payload = Buffer.alloc(7)

    payload[0] = 0x80

    payload.write(cmd, 1)

    payload.writeInt32LE(value, 3)

    this.send(payload)
  }
}