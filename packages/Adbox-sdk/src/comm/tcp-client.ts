import net from 'net'
import EventEmitter from 'eventemitter3'

export class TCPClient extends EventEmitter {

  private socket: net.Socket | null = null

  private reconnectTimer: NodeJS.Timeout | null = null

  private connected = false

  connect(host: string, port: number) {

    if (this.connected) {
      return
    }

    this.socket = new net.Socket()

    this.socket.connect(port, host, () => {

      this.connected = true

      this.emit('connected')
    })

    this.socket.on('data', (data) => {

      this.emit('data', data)
    })

    this.socket.on('close', () => {

      this.connected = false

      this.emit('disconnected')

      this.reconnect(host, port)
    })

    this.socket.on('error', (err) => {

      this.emit('error', err)
    })
  }

  write(buffer: Buffer) {

    if (!this.connected) {
      return
    }

    this.socket?.write(buffer)
  }

  disconnect() {

    this.socket?.destroy()

    this.connected = false
  }

  private reconnect(host: string, port: number) {

    if (this.reconnectTimer) {
      return
    }

    this.reconnectTimer = setTimeout(() => {

      this.reconnectTimer = null

      this.connect(host, port)

    }, 3000)
  }
}