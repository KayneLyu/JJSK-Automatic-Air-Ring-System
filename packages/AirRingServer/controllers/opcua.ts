import { AirRingConnection } from '../connections/airRing'
import { ThicknessConnection } from '../connections/thickness'
import { ThicknessData } from '../connections/thickness/opcua'
import { RingData } from '../connections/airRing/opcua'
import { calibrate } from './calibration'
import { CalibrationConfig } from '../types'
import { atom } from 'nanostores'
import { findMutation } from '../algorithms/thickness'

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
    const buffer = atom<{
      thickness: ThicknessData[]
      airRing: RingData[]
    }>({
      thickness: [],
      airRing: [],
    })
    const unsub1 = await ThicknessClient.subscribe((data) => {
      buffer.set({
        airRing: buffer.get().airRing,
        thickness: [...buffer.value.thickness, data],
      })
    })
    const unsub2 = await AirRingClient.subscribe((data) => {
      buffer.set({
        airRing: [...buffer.get().airRing, data],
        thickness: buffer.value.thickness,
      })
    })
    return new Promise((resolve, reject) => {
      let pending = false

      const scheduleCalibrate = (data: {
        thickness: ThicknessData[]
        airRing: RingData[]
      }) => {
        if (pending) return
        pending = true

        queueMicrotask(() => {
          pending = false
          const res = calibrate({
            thicknessData: data.thickness,
            ringData: data.airRing,
            disturbanceTs,
            config,
            standardized: {},
          })
          if (res) {
            resolve(res)
            unsub1()
            unsub2()
            unsub()
          }
        })
      }

      const unsub = buffer.subscribe(scheduleCalibrate)
      const timer = setTimeout(
        () => {
          reject()
          unsub1()
          unsub2()
          unsub()
          clearTimeout(timer)
        },
        30 * 60 * 1000
      )
    })
  }

  /**
   * 自动调节风环
   * */
  const autoAdjustment = async () => {
    let thicknessData: ThicknessData[] = []
    const unsub1 = await ThicknessClient.subscribe((data) => {
      thicknessData.push(data)
      const dip = findMutation(thicknessData)
      if (dip === null) {
      }
    })
    let preSignal: boolean | null = null
    const unsub2 = await AirRingClient.subscribe((data) => {
      const currentSignal = !!data.ForwardRotation && !data.ReverseRotation
      if (currentSignal != preSignal) {
        /* 换向之后清空厚度数据 */
        thicknessData = []
        preSignal = currentSignal
      }
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
