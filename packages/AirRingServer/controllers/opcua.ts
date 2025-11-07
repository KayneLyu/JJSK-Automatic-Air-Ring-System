import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'

export interface OPCUAControllerOptions {
  airRingUrl: string
  thicknessUrl: string
}
export const OPCUAController = (options: OPCUAControllerOptions) => {
  const { airRingUrl, thicknessUrl } = options
  const AirRingClient = AirRingConnection({
    url: airRingUrl,
    type: 'opcua',
  })
  const ThicknessClient = ThicknessConnection({
    url: thicknessUrl,
    type: 'opcua',
  })

  /**
   * 测试连接
   * */
  const testConnect = (type: 'thickness' | 'airRing') => {
    if (type === 'airRing') {
      return AirRingClient.testConnect()
    }
    if (type === 'thickness') {
      return ThicknessClient.testConnect()
    }
    throw new Error('Unexpected connection type')
  }

  /**
   * 测试距离
   * 测厚仪到上旋距离 L1
   * 上旋到风环距离 L2
   * */
  const testDisconnect = async () => {
    await AirRingClient.setHeats()
    await AirRingClient.subscribe((data) => {
      if (data.angleRange) {
        /* */
      }
    })
  }
  return {
    testConnect,
    testDisconnect,
  }
}
