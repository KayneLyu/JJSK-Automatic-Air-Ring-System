/**
 * 设备常数 & 标定结果 共享加载
 *
 * 替代 useScannerTripReconstruction / useBubbleSweeps 中各自重复的 loadConfigs。
 * airAD 缺失时直接抛错，不使用硬编码 fallback。
 */
import { ref, type Ref } from 'vue'
import type { ICalibrationResults, IDeviceConstants } from '@/types/ipc'
import type { ThicknessConfig } from './utiles'

export interface DeviceConfigReturn {
  thicknessCfg: Ref<ThicknessConfig>
  angleOffsetDeg: Ref<number>
  calResults: Ref<ICalibrationResults>
  errorMessage: Ref<string | null>
  loadConfigs: () => Promise<void>
}

export function useDeviceConfig(
  errorMessageRef?: Ref<string | null>
): DeviceConfigReturn {
  const thicknessCfg = ref<ThicknessConfig>({ airAD: 0, gain: 1.0 })
  const angleOffsetDeg = ref(0)
  const calResults = ref<ICalibrationResults>({})

  const setError = (msg: string) => {
    if (errorMessageRef) {
      errorMessageRef.value = msg
    } else {
      console.error(`[useDeviceConfig] ${msg}`)
    }
  }

  async function loadConfigs() {
    try {
      const dev = (await window.ipcApi.invoke(
        'config-get-device-constants'
      )) as IDeviceConstants
      const airADNum = Number(dev?.airAD)
      if (!Number.isFinite(airADNum) || airADNum <= 0) {
        setError('设备常数未配置 airAD，请在设置页填写后刷新')
      } else {
        thicknessCfg.value.airAD = airADNum
      }
      if (dev?.materialGain) {
        const gainNum = Number(dev.materialGain)
        if (Number.isFinite(gainNum) && gainNum > 0) {
          thicknessCfg.value.gain = gainNum
        }
      }
      if (dev?.angleOffsetDeg) {
        angleOffsetDeg.value = Number(dev.angleOffsetDeg) || 0
      }
    } catch {
      setError('无法获取设备常数，请检查连接')
    }
    try {
      const cal = (await window.ipcApi.invoke(
        'config-get-calibration-results'
      )) as ICalibrationResults
      calResults.value = cal
    } catch {
      /* 标定结果可选 */
    }
  }

  return { thicknessCfg, angleOffsetDeg, calResults, errorMessage: errorMessageRef ?? ref(null), loadConfigs }
}
