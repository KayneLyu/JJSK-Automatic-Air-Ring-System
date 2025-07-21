// src/main/PLCConnector.ts
import S7Client from 'nodes7';


export class PLCConnector {
  private client: S7Client;
  private isConnected: boolean = false;
  private disconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private ip: string = '192.168.2.10',
    private port: number = 102,
    private idleTimeout: number = 5000
  ) {
    this.client = new S7Client();
  }

  async connectIfNeeded(): Promise<void> {
    if (this.isConnected) {
      this.resetIdleTimer();
      return;
    }
    return new Promise((resolve, reject) => {
      this.client.initiateConnection(
        { host: this.ip, port: this.port, rack: 0, slot: 1 },
        (err) => {
          if (err) return reject(new Error('PLC 连接失败: ' + err.message));
          this.isConnected = true;
          console.log('[PLC] Connected');
          this.resetIdleTimer();
          resolve();
        }
      );
    });
  }

  defineItems(defs: Record<string, string>) {
    this.client.setTranslationCB((tag) => tag);
    this.client.addItems(Object.keys(defs));
  }

  async readAll(): Promise<Record<string, any>> {
    await this.connectIfNeeded();

    return new Promise((resolve, reject) => {
      this.client.readAllItems((err, values) => {
        if (err) return reject(new Error('PLC 读取失败: ' + err));
        this.resetIdleTimer();
        resolve(values);
      });
    });
  }

  async writeItems(address: string, value: boolean, callback: () => void): Promise<void> {
    await this.connectIfNeeded();
    this.client.writeItems(address, value, callback)
  }

  disconnect() {
    if (this.isConnected) {
      this.client.dropConnection(() => {
        console.log('[PLC] Disconnected');
      });
      this.isConnected = false;
    }
  }

  private resetIdleTimer() {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = setTimeout(() => this.disconnect(), this.idleTimeout);
  }
}
