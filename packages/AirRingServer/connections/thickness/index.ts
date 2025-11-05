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
export const ThicknessConnection = (options: ThicknessConnectionOptions) => {
  const { type, url } = options
  if (type === 'opcua') {
    return Client(url)
  }
  throw new Error('Thickness connection type not supported')
}
