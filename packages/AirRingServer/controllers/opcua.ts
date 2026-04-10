import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'
import { calibrate } from './calibration'
import { CalibrationConfig, Scalar } from '../types'
import { adjustments } from './adjustments'
import {
  thicknessReversal,
  ThicknessReversalOptions,
  ThicknessReversalResult,
} from './thicknessReversal'

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

    return new Promise((resolve, reject) => {
      void (async () => {
        const { next } = calibrate({
          disturbanceTs,
          config,
          standardized,
        })
        const unsub1 = await ThicknessClient.subscribe((data) => {
          const result = next({ thickness: data })
          if (result) {
            resolve(result)

            unsub1()
            unsub2()
          }
        })
        const unsub2 = await AirRingClient.subscribe((data) => {
          const result = next({ airRing: data })
          if (result) {
            resolve(result)

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
      })().catch(reject)
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
      next({ thickness: data })
    })

    const unsub2 = await AirRingClient.subscribe((data) => {
      next({ airRing: data })
    })
    return () => {
      unsub1()
      unsub2()
    }
  }

  /**
   * 自动反推原始膜泡厚度
   * */
  const autoThicknessReversal = async (
    options: ThicknessReversalOptions,
    onResult?: (result: ThicknessReversalResult) => void
  ) => {
    const controller = thicknessReversal(options)

    const unsub1 = await ThicknessClient.subscribe((data) => {
      const result = controller.next({ thickness: data })
      if (result) {
        onResult?.(result)
      }
    })

    const unsub2 = await AirRingClient.subscribe((data) => {
      const result = controller.next({ airRing: data })
      if (result) {
        onResult?.(result)
      }
    })

    return {
      stop: () => {
        unsub1()
        unsub2()
      },
      getStatistics: controller.getStatistics,
      getState: controller.getState,
      getHistory: controller.getHistory,
      reset: controller.reset,
    }
  }
  return {
    testConnect,
    sysCalibrate,
    autoAdjustment,
    autoThicknessReversal,
  }
}
