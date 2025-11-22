import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'
import { ThickNessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { calibrate } from './calibration'
import { CalibrationConfig } from './types'

export interface OPCUAControllerOptions {
  airRingUrl: string
  thicknessUrl: string
  config: CalibrationConfig
}
export const OPCUAController = (options: OPCUAControllerOptions) => {
  const { airRingUrl, thicknessUrl, config } = options
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
   * 系统标定
   * */
  const sysCalibrate = async () => {
    // const res = await AirRingClient.setHeats()
    const disturbanceTs = Date.now()
    // if (!res) return
    const buffer: {
      thickness: ThickNessData[]
      airRing: RingData[]
    } = {
      thickness: [],
      airRing: [],
    }
    let pending = false

    const scheduleCalibrate = () => {
      if (pending) return
      pending = true

      queueMicrotask(() => {
        pending = false
        const res = calibrate({
          thicknessData: buffer.thickness,
          ringData: buffer.airRing,
          disturbanceTs,
          config,
        })
        if (res) console.log(res)
      })
    }
    await ThicknessClient.subscribe((data) => {
      buffer.thickness.push(data)
      scheduleCalibrate()
    })
    await AirRingClient.subscribe((data) => {
      buffer.airRing.push(data)
      scheduleCalibrate()
    })
    return new Promise((resolve, reject) => {})
  }
  return {
    testConnect,
    sysCalibrate,
  }
}
