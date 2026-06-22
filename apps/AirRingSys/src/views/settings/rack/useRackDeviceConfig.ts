import { ref } from 'vue'
import type { IDeviceConstants, ICalibrationResults } from '@/types/ipc'

export type RollerMode = 'circumference' | 'diameter' | 'radius'

export interface RollerConfig {
  mode: RollerMode
  value: string
  numCycles: string
}

export interface ThicknessConfig {
  airAD: string
  materialGain: string
}

export interface UpperConfig {
  deltaMin: string
  deltaMax: string
  objectiveMode: string
}

export interface AirRingConfig {
  airDuctCount: string
}

export interface SystemConfig {
  airDuct1Angle: string
}

export interface RollerResult {
  tractionSpeed?: number
}

export interface ThicknessResult {
  frameLengthMM?: number
  frameLengthPulse?: number
  mutationWindowSize?: number
}

export interface UpperResult {
  maxAngle?: number
  distance?: number
}

export function useRackDeviceConfig() {
  const rollerConfig = ref<RollerConfig>({
    mode: 'circumference',
    value: '314',
    numCycles: '10',
  })
  const thicknessConfig = ref<ThicknessConfig>({
    airAD: '2048',
    materialGain: '1.0',
  })
  const upperConfig = ref<UpperConfig>({
    deltaMin: '180',
    deltaMax: '359',
    objectiveMode: 'auto',
  })
  const airRingConfig = ref<AirRingConfig>({ airDuctCount: '48' })
  const systemConfig = ref<SystemConfig>({ airDuct1Angle: '0' })

  const rollerResult = ref<RollerResult>({})
  const thicknessResult = ref<ThicknessResult>({})
  const upperResult = ref<UpperResult>({})

  const getRollerCircumference = (): number => {
    const v = Number(rollerConfig.value.value)
    if (rollerConfig.value.mode === 'circumference') return v
    if (rollerConfig.value.mode === 'diameter') return Math.PI * v
    return 2 * Math.PI * v
  }

  async function loadDeviceConstants() {
    try {
      const params = (await window.ipcApi.invoke(
        'config-get-device-constants'
      )) as IDeviceConstants
      rollerConfig.value = {
        mode: params.rollerMode as RollerMode,
        value: params.rollerValue,
        numCycles: params.rollerNumCycles,
      }
      thicknessConfig.value = {
        airAD: params.airAD,
        materialGain: params.materialGain,
      }
      upperConfig.value = {
        deltaMin: params.upperDeltaMin,
        deltaMax: params.upperDeltaMax,
        objectiveMode: params.upperObjectiveMode,
      }
      airRingConfig.value = { airDuctCount: params.airDuctCount }
      systemConfig.value = { airDuct1Angle: params.systemAirDuct1Angle }
    } catch (e) {
      console.error('加载设备常量失败:', e)
    }
  }

  async function loadCalibrationResults() {
    try {
      const results = (await window.ipcApi.invoke(
        'config-get-calibration-results'
      )) as ICalibrationResults
      rollerResult.value =
        results.rollerTractionSpeed !== undefined
          ? { tractionSpeed: results.rollerTractionSpeed }
          : {}
      thicknessResult.value = {
        ...(results.frameLengthMM !== undefined
          ? { frameLengthMM: results.frameLengthMM }
          : {}),
        ...(results.frameLengthPulse !== undefined
          ? { frameLengthPulse: results.frameLengthPulse }
          : {}),
        ...(results.mutationWindowSize !== undefined
          ? { mutationWindowSize: results.mutationWindowSize }
          : {}),
      }
      upperResult.value = {
        ...(results.upperMaxAngle !== undefined
          ? { maxAngle: results.upperMaxAngle }
          : {}),
        ...(results.upperDistance !== undefined
          ? { distance: results.upperDistance }
          : {}),
      }
    } catch (e) {
      console.error('加载标定结果失败:', e)
    }
  }

  async function saveDeviceConstants() {
    try {
      const params: IDeviceConstants = {
        rollerMode: rollerConfig.value.mode,
        rollerValue: rollerConfig.value.value,
        rollerNumCycles: rollerConfig.value.numCycles,
        airAD: thicknessConfig.value.airAD,
        materialGain: thicknessConfig.value.materialGain,
        upperDeltaMin: upperConfig.value.deltaMin,
        upperDeltaMax: upperConfig.value.deltaMax,
        upperObjectiveMode: upperConfig.value.objectiveMode,
        airDuctCount: airRingConfig.value.airDuctCount,
        systemAirDuct1Angle: systemConfig.value.airDuct1Angle,
      }
      await window.ipcApi.invoke('config-set-device-constants', params)
    } catch (e) {
      console.error('保存设备常量失败:', e)
    }
  }

  async function saveCalibrationResults() {
    try {
      const results: ICalibrationResults = {
        rollerTractionSpeed: rollerResult.value.tractionSpeed,
        frameLengthMM: thicknessResult.value.frameLengthMM,
        frameLengthPulse: thicknessResult.value.frameLengthPulse,
        mutationWindowSize: thicknessResult.value.mutationWindowSize,
        upperMaxAngle: upperResult.value.maxAngle,
        upperDistance: upperResult.value.distance,
      }
      await window.ipcApi.invoke('config-set-calibration-results', results)
    } catch (e) {
      console.error('保存标定结果失败:', e)
    }
  }

  function onConstantBlur() {
    void saveDeviceConstants()
  }

  function onResultBlur() {
    void saveCalibrationResults()
    const pulse = thicknessResult.value.frameLengthPulse
    if (pulse !== undefined && Number.isFinite(pulse) && pulse > 0) {
      window.ipcApi.invoke('config-set-max-pulse', pulse).catch(() => {})
    }
  }

  return {
    // configs
    rollerConfig,
    thicknessConfig,
    upperConfig,
    airRingConfig,
    systemConfig,
    // results
    rollerResult,
    thicknessResult,
    upperResult,
    // helpers
    getRollerCircumference,
    // io
    loadDeviceConstants,
    loadCalibrationResults,
    saveDeviceConstants,
    saveCalibrationResults,
    onConstantBlur,
    onResultBlur,
  }
}
