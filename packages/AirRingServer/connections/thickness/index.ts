import { Client } from './opcua'

export interface ThicknessConnectionOptions {
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
 * 测厚仪连接
 * */
export const ThicknessConnection = async (
  options: ThicknessConnectionOptions
) => {
  const { type, url } = options
  if (type === 'opcua') {
    const OPCUAClient = Client(url)
  }
}
