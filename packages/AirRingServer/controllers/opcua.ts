import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'
import { calibrate } from './calibration'
import { CalibrationConfig, Scalar } from '../types'
import { adjustments } from './adjustments'

export interface OPCUAControllerOptions {
  airRingUrl: string
  thicknessUrl: string
  config: CalibrationConfig
  standardized: Scalar
}
export const OPCUAController = (options: OPCUAControllerOptions) => {
  const { airRingUrl, thicknessUrl, config, standardized } = options
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

    return new Promise(async (resolve, reject) => {
      const { next } = calibrate({
        disturbanceTs,
        config,
        standardized,
      })
      const unsub1 = await ThicknessClient.subscribe((data) => {
        const res = next({ thickness: data })
        if (res) {
          resolve(res)

          unsub1()
          unsub2()
        }
      })
      const unsub2 = await AirRingClient.subscribe((data) => {
        const res = next({ airRing: data })
        if (res) {
          resolve(res)

          unsub1()
          unsub2()
        }
      })
      const timer = setTimeout(
        () => {
          reject()
          unsub1()
          unsub2()
          clearTimeout(timer)
        },
        30 * 60 * 1000
      )
    })
  }

  /**
   * 自动调节风环
   * */
  const autoAdjustment = async (
    windowSize: number,
    thetaMaxDeg: number,
    T_half: number
  ) => {
    const { next } = adjustments(
      {
        windowSize,
        thetaMaxDeg,
        T_half,
      },
      standardized
    )
    const unsub1 = await ThicknessClient.subscribe((data) => {
      const res = next({ thickness: data })
    })

    const unsub2 = await AirRingClient.subscribe((data) => {
      const res = next({ airRing: data })
    })
    return () => {
      unsub1()
      unsub2()
    }
  }
  return {
    testConnect,
    sysCalibrate,
    autoAdjustment,
  }
}
