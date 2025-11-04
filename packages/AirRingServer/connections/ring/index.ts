import { Client } from './opcua'

export interface RingConnectionOptions {
  /**
   * 连接类型
   * */
  type: 'opcua'
  /**
   * 连接地址
   * */
  url: string
}

/**
 * 上旋及风环连接（上旋与风环使用同一个PLC连接）
 * */
export const RingConnection = async (options: RingConnectionOptions) => {
  const { type, url } = options
  if (type === 'opcua') {
    const OPCUAClient = Client(url)
  }
}
