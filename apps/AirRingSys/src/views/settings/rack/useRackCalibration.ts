import { ref, onMounted, onUnmounted } from 'vue'
import type {
  ICalibrationBridgeState,
  ICalibrationControlResult,
  ICalibrationResult,
} from '@/types/ipc'
import type { useRackDeviceConfig } from './useRackDeviceConfig'
import type { Ref } from 'vue'

const ANGLE_CALIBRATION_TIMEOUT_MS = 120_000

export interface UseRackCalibrationDeps {
  deviceConfig: ReturnType<typeof useRackDeviceConfig>
  isHardwareConnected: Ref<boolean>
  productionSpeed: Ref<string>
}

export function useRackCalibration(deps: UseRackCalibrationDeps) {
  const { deviceConfig, isHardwareConnected, productionSpeed } = deps

  const isCalRoller = ref(false)
  const isCalAngle = ref(false)
  const isCalDistance = ref(false)
  const isApplyingManualTractionSpeed = ref(false)
  const isResettingCalibration = ref(false)
  const manualTractionSpeed = ref('')

  let resolveAngleCalibration: ((angle: number) => void) | null = null

  function formatProductionSpeedValue(value: number | undefined) {
    if (value === undefined || value === null || Number.isNaN(value)) {
      productionSpeed.value = '0.0mm/s'
      return
    }
    productionSpeed.value = `${value.toFixed(2)}mm/s`
  }

  async function loadCalibrationState() {
    try {
      const state = (await window.ipcApi.invoke(
        'calibration-get-state'
      )) as ICalibrationBridgeState
      manualTractionSpeed.value =
        state.manualTractionSpeed === undefined
          ? ''
          : String(state.manualTractionSpeed)
      if (state.manualTractionSpeed !== undefined) {
        formatProductionSpeedValue(state.manualTractionSpeed)
      } else if (state.result?.tractionSpeed !== undefined) {
        formatProductionSpeedValue(state.result.tractionSpeed)
      }
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : '标定状态读取失败'
      )
    }
  }

  async function applyManualTractionSpeed() {
    if (isApplyingManualTractionSpeed.value) return
    const speed = Number(manualTractionSpeed.value)
    if (!Number.isFinite(speed) || speed <= 0) {
      ElMessage.error('请输入大于 0 的有效牵引速度')
      return
    }
    isApplyingManualTractionSpeed.value = true
    try {
      const result = (await window.ipcApi.invoke(
        'calibration-set-manual-traction-speed',
        { manualTractionSpeed: speed }
      )) as ICalibrationControlResult
      if (!result.success) {
        ElMessage.error(result.error ?? '手动牵引速度设置失败')
        return
      }
      manualTractionSpeed.value = String(result.manualTractionSpeed ?? speed)
      formatProductionSpeedValue(result.manualTractionSpeed ?? speed)
      ElMessage.success('牵引速度已设置，标定已按新速度重新开始')
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : '手动牵引速度设置失败'
      )
    } finally {
      isApplyingManualTractionSpeed.value = false
    }
  }

  async function resetCalibration() {
    if (isResettingCalibration.value) return
    isResettingCalibration.value = true
    try {
      const result = (await window.ipcApi.invoke(
        'calibration-reset'
      )) as ICalibrationControlResult
      if (!result.success) {
        ElMessage.error(result.error ?? '本次标定重置失败')
        return
      }
      if (result.manualTractionSpeed !== undefined) {
        formatProductionSpeedValue(result.manualTractionSpeed)
      }
      ElMessage.success('本次标定已重新开始')
    } catch (error) {
      ElMessage.error(
        error instanceof Error ? error.message : '本次标定重置失败'
      )
    } finally {
      isResettingCalibration.value = false
    }
  }

  async function calibrateRollerSpeed() {
    if (isCalRoller.value) return
    isCalRoller.value = true
    try {
      const circumference = deviceConfig.getRollerCircumference()
      if (!Number.isFinite(circumference) || circumference <= 0) {
        ElMessage.error('请输入有效的辊尺寸')
        return
      }
      const r = (await window.ipcApi.invoke('calibration-auto-traction-speed', {
        circumference,
        numCycles:
          Number(deviceConfig.rollerConfig.value.numCycles) || undefined,
      })) as {
        success: boolean
        tractionSpeed?: number
        source?: string
        error?: string
      }
      if (!r.success) {
        ElMessage.error(r.error ?? '标定失败')
        return
      }
      deviceConfig.rollerResult.value = { tractionSpeed: r.tractionSpeed }
      if (r.tractionSpeed !== undefined) {
        window.ipcApi
          .invoke('calibration-set-manual-traction-speed', {
            manualTractionSpeed: r.tractionSpeed,
          })
          .catch(() => {})
      }
      const src = r.source === 'live' ? '实时' : '历史'
      ElMessage.success(`${src}标定完成: ${r.tractionSpeed} mm/s`)
      void deviceConfig.saveCalibrationResults()
    } finally {
      isCalRoller.value = false
    }
  }

  async function calibrateUpperAngle() {
    if (isCalAngle.value) return
    isCalAngle.value = true
    try {
      if (isHardwareConnected.value) {
        ElMessage.info('正在等待实时数据完成上旋角度标定...')
        await window.ipcApi.invoke('calibration-reset')
        const maxAngle = await Promise.race([
          new Promise<number>((resolve) => {
            resolveAngleCalibration = resolve
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), ANGLE_CALIBRATION_TIMEOUT_MS)
          ),
        ])
        resolveAngleCalibration = null
        if (maxAngle === null) {
          ElMessage.error('实时标定超时（120秒），请检查设备连接和数据')
          return
        }
        deviceConfig.upperResult.value = {
          ...deviceConfig.upperResult.value,
          maxAngle,
        }
        ElMessage.success(`上旋最大角度: ${maxAngle}°`)
      } else {
        const r = (await window.ipcApi.invoke(
          'calibration-max-angle-historical',
          {
            deltaMin: Number(deviceConfig.upperConfig.value.deltaMin),
            deltaMax: Number(deviceConfig.upperConfig.value.deltaMax),
            objectiveMode: deviceConfig.upperConfig.value.objectiveMode,
          }
        )) as { success: boolean; maxAngle?: number; error?: string }
        if (!r.success) {
          ElMessage.error(r.error ?? '标定失败')
          return
        }
        deviceConfig.upperResult.value = {
          ...deviceConfig.upperResult.value,
          maxAngle: r.maxAngle,
        }
        ElMessage.success(`上旋最大角度: ${r.maxAngle}°`)
      }
      void deviceConfig.saveCalibrationResults()
    } finally {
      isCalAngle.value = false
    }
  }

  async function calibrateDistance() {
    if (isCalDistance.value) return
    const speed = deviceConfig.rollerResult.value.tractionSpeed
    if (!speed || !Number.isFinite(speed) || speed <= 0) {
      ElMessage.warning('请先标定牵引速度或手动输入')
      return
    }
    const windowSize = deviceConfig.thicknessResult.value.mutationWindowSize
    if (!windowSize || !Number.isFinite(windowSize) || windowSize <= 0) {
      ElMessage.warning('请在测厚仪中输入突变窗口')
      return
    }
    isCalDistance.value = true
    try {
      const r = (await window.ipcApi.invoke('calibration-run-distance', {
        tractionSpeed: speed,
        disturbanceTs: Date.now(),
        windowSize: Math.round(windowSize),
        startMs: 0,
        endMs: Date.now(),
      })) as { success: boolean; distance?: number; error?: string }
      if (!r.success) {
        ElMessage.error(r.error ?? '标定失败')
        return
      }
      deviceConfig.upperResult.value = {
        ...deviceConfig.upperResult.value,
        distance: r.distance,
      }
      ElMessage.success(`测量点距离: ${r.distance} mm`)
      void deviceConfig.saveCalibrationResults()
    } finally {
      isCalDistance.value = false
    }
  }

  function handleCalibrationResult(_: unknown, data: ICalibrationResult) {
    if (data.tractionSpeed !== undefined) {
      deviceConfig.rollerResult.value = { tractionSpeed: data.tractionSpeed }
      formatProductionSpeedValue(data.tractionSpeed)
    }
    if (data.distance !== undefined) {
      deviceConfig.upperResult.value = {
        ...deviceConfig.upperResult.value,
        distance: data.distance,
      }
    }
    if (data.maxAngle !== undefined) {
      deviceConfig.upperResult.value = {
        ...deviceConfig.upperResult.value,
        maxAngle: data.maxAngle,
      }
      resolveAngleCalibration?.(data.maxAngle)
      resolveAngleCalibration = null
    }
    if (data.mutationWindowSize !== undefined) {
      deviceConfig.thicknessResult.value = {
        ...deviceConfig.thicknessResult.value,
        mutationWindowSize: Math.round(data.mutationWindowSize),
      }
    }
  }

  onMounted(() => {
    window.ipcApi.on('calibration-result', handleCalibrationResult)
  })

  onUnmounted(() => {
    window.ipcApi.off('calibration-result', handleCalibrationResult)
  })

  return {
    // state
    isCalRoller,
    isCalAngle,
    isCalDistance,
    isApplyingManualTractionSpeed,
    isResettingCalibration,
    manualTractionSpeed,
    // actions
    loadCalibrationState,
    applyManualTractionSpeed,
    resetCalibration,
    calibrateRollerSpeed,
    calibrateUpperAngle,
    calibrateDistance,
  }
}
