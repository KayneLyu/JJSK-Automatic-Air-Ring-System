import { EventEmitter } from 'events';
import net from 'net';
import { Adb2Config } from '../types';

export class TcpConnection extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private config: Required<Adb2Config>;
  private buffer = Buffer.alloc(0);

  constructor(config: Adb2Config) {
    super();
    this.config = {
      reconnectInterval: 3000,
      requestTimeout: 3000,
      log: false,
      ...config,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) return resolve();
      this.socket?.destroy();

      const socket = new net.Socket();
      this.socket = socket;

      const errHandler = (e: Error) => {
        this.connected = false;
        reject(e);
        this.reconnect();
      };

      socket.once('error', errHandler);
      socket.connect(this.config.port, this.config.host, () => {
        this.connected = true;
        socket.off('error', errHandler);
        this.emit('connect');
        resolve();
      });

      socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        this.emit('data', this.buffer);
      });

      socket.on('close', () => {
        this.connected = false;
        this.emit('disconnect');
        this.reconnect();
      });
    });
  }

  disconnect() {
    this.connected = false;
    this.socket?.destroy();
    this.socket = null;
  }

  write(buf: Buffer) {
    this.socket?.write(buf);
  }

  isConnected() {
    return this.connected;
  }

  clearBuffer() {
    this.buffer = Buffer.alloc(0);
  }

  private reconnect() {
    if (this.connected) return;
    setTimeout(() => this.connect().catch(), this.config.reconnectInterval);
  }
}