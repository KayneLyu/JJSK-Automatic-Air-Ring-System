import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'
import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { tracker } from '../utils/tracker'

export interface OPCUAControllerOptions {
  airRingUrl: string
  thicknessUrl: string
  /**
   * 上旋电机速率 即每Hz旋转多少圈rpm
   * */
  UP_FREQ_TO_RPS: number
}
export const OPCUAController = (options: OPCUAControllerOptions) => {
  const { airRingUrl, thicknessUrl, UP_FREQ_TO_RPS } = options
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
    const buffer: {
      thickness: ThickNessData[]
      airRing: RingData[]
    } = {
      thickness: [],
      airRing: [],
    }
    await ThicknessClient.subscribe((data) => {
      buffer.thickness.push(data)
      const { maxAngle } = tracker(buffer, { UP_FREQ_TO_RPS })
    })
    await AirRingClient.subscribe((data) => {
      buffer.thickness.push(data)
      const { maxAngle } = tracker(buffer, { UP_FREQ_TO_RPS })
    })
  }
  return {
    testConnect,
    testDisconnect,
  }
}
