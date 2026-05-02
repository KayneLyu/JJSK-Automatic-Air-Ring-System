import S7Client from 'nodes7'

export class PLCConnector {
  private static instance: PLCConnector
  private client: S7Client
  private isConnected: boolean = false

  constructor(
    private ip: string = '192.168.2.20',
    private port: number = 102
  ) {
    this.client = new S7Client()
  }

  // 单例访问入口
  public static getInstance(): PLCConnector {
    if (!PLCConnector.instance) {
      PLCConnector.instance = new PLCConnector()
    }
    return PLCConnector.instance
  }

  async connectIfNeeded(): Promise<void> {
    if (this.isConnected) {
      return
    }
    return new Promise((resolve, reject) => {
      this.client.initiateConnection(
        { host: this.ip, port: this.port, rack: 0, slot: 1 },
        (err) => {
          if (err) return reject(new Error('PLC 连接失败: ' + err.message))
          this.isConnected = true
          resolve()
        }
      )
    })
  }

  defineItems(defs: Record<string, string>) {
    this.client.setTranslationCB((tag: any) => defs[tag])
    this.client.addItems(Object.keys(defs))
  }

  async readAll(): Promise<Record<string, any>> {
    await this.connectIfNeeded()
    return new Promise((resolve, reject) => {
      this.client.readAllItems((err, values) => {
        if (err) return reject(new Error('PLC 读取失败: ' + err))
        resolve(values)
      })
    })
  }

  async writeItems(address: string, value: any): Promise<void> {
    await this.connectIfNeeded()
    return new Promise((resolve, reject) => {
      this.client.writeItems(address, value, (err) => {
        if (err) return reject(new Error('PLC 写入失败'))
        resolve()
      })
    })
  }

  disconnect() {
    if (this.isConnected) {
      this.client.dropConnection(() => {
        console.log('[PLC] Disconnected')
      })
      this.isConnected = false
    }
  }
}
