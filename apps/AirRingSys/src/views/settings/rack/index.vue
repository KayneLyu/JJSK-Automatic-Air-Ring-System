<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type {
  ICalibrationBridgeState,
  ICalibrationControlResult,
  ICalibrationResult,
  IDeviceConstants,
  ICalibrationResults,
  IPlcParamData,
  IPlcParamResult,
  IUpperRotationDebugData,
} from '@/types/ipc'
import SideCharts from './side.vue'

type Option = {
  label: string
  value: IState
}

type IState = 'FWD' | 'REV' | 'STOP' | 'HOME' | 'MEASURE'
type PlcWritableValue = string | number | boolean
type RackParamKey = keyof IPlcParamData
type RackParamNormalizedValue = number | boolean

const REAL_COMPARE_EPSILON = 1e-6

// 顶部状态数据
const currentAD = ref(12345)
const measurePosition = ref(0)
const productionSpeed = ref('0.0m/min')
const thickness = ref('0')
const bubbleChange = ref('0mm')
const upperRotationDebug = ref<IUpperRotationDebugData>({})
const manualTractionSpeed = ref('')
const isApplyingManualTractionSpeed = ref(false)
const isResettingCalibration = ref(false)

const isHardwareConnected = ref(false)

let resolveAngleCalibration: ((angle: number) => void) | null = null

// 设备标定配置与结果
const rollerConfig = ref({
  mode: 'circumference' as 'circumference' | 'diameter' | 'radius',
  value: '314',
  numCycles: '10',
})
const thicknessConfig = ref({ airAD: '2048', materialGain: '1.0' })
const upperConfig = ref({
  deltaMin: '180',
  deltaMax: '359',
  objectiveMode: 'auto',
})
const airRingConfig = ref({ airDuctCount: '48' })
const systemConfig = ref({ airDuct1Angle: '0' })
const rollerResult = ref<{ tractionSpeed?: number }>({})
const thicknessResult = ref<{
  frameLengthMM?: number
  frameLengthPulse?: number
  mutationWindowSize?: number
}>({})
const upperResult = ref<{ maxAngle?: number; distance?: number }>({})
const getRollerCircumference = (): number => {
  const v = Number(rollerConfig.value.value)
  if (rollerConfig.value.mode === 'circumference') return v
  if (rollerConfig.value.mode === 'diameter') return Math.PI * v
  return 2 * Math.PI * v
}

const isCalRoller = ref(false)
const isCalThickness = ref(false)
const isCalAngle = ref(false)
const isCalDistance = ref(false)

// 操作栏数据
const targetPulse = ref(1000)
const isApplying = ref(false)
const plcParamBaseline = ref<Partial<IPlcParamResult>>({})

// 标签页
const activeTab = ref('param')

// 表单数据

const hardwareForm = ref({
  frameLength: '13900',
  rollerCircumference: '314',
  encoderRatio: '0.14',
  motorPulse: '4',
  codePulse: '1',
  zeroOffset: '0',
  adDelay: '0',
})

const speedForm = ref({
  scanSpeed: '3000',
  sampleSpeed: '2000',
  debugSpeed: '2000',
  startSpeed: '300',
  resetSpeed1: '2000',
  resetSpeed2: '600',
  accelTime: '400',
  decelTime: '500',
})

const sampleForm = ref({
  sampleInterval: '10',
  samplePosition: '200',
  sampleRadius: '100',
})

const alarmForm = ref({
  alarmActive: false,
  autoTarget: true,
  toleranceZone: '10',
})

const addressItems: IPlcParamData = {
  // 硬件
  frameLength: 'DB4,DINT2', // 机架长度
  rollerCircumference: 'DB4,REAL6', // 测速棍周长
  encoderRatio: 'DB4,REAL10', // 编码器1比例
  motorPulse: 'DB4,DINT14', // 电机脉冲
  codePulse: 'DB4,DINT18', // 编码脉冲
  zeroOffset: 'DB4,DINT22', // 零位偏移
  // adDelay: 'DB4,X0.6'
  // 速度
  scanSpeed: 'DB4,REAL30', // 扫描速度
  sampleSpeed: 'DB4,REAL34', // 采样速度
  debugSpeed: 'DB4,REAL38', // 调试速度
  startSpeed: 'DB4,REAL42', // 开始速度
  resetSpeed1: 'DB4,REAL46', // 归零速度1
  resetSpeed2: 'DB4,REAL50', // 归零速度2
  accelTime: 'DB4,REAL54', // 加速时间
  decelTime: 'DB4,REAL58', // 减速时间
  // 采样
  sampleInterval: 'DB4,DINT62', // 采样间隔
  samplePosition: 'DB4,DINT66', // 采样位置
  sampleRadius: 'DB4,DINT70', // 采样半径
}

const toFormValue = (value: number | boolean | undefined, fallback: string) =>
  value === undefined ? fallback : String(value)

const setFormValuesFromPlc = (data: IPlcParamResult) => {
  hardwareForm.value = {
    ...hardwareForm.value,
    frameLength: toFormValue(data.frameLength, hardwareForm.value.frameLength),
    rollerCircumference: toFormValue(
      data.rollerCircumference,
      hardwareForm.value.rollerCircumference
    ),
    encoderRatio: toFormValue(
      data.encoderRatio,
      hardwareForm.value.encoderRatio
    ),
    motorPulse: toFormValue(data.motorPulse, hardwareForm.value.motorPulse),
    codePulse: toFormValue(data.codePulse, hardwareForm.value.codePulse),
    zeroOffset: toFormValue(data.zeroOffset, hardwareForm.value.zeroOffset),
  }

  speedForm.value = {
    ...speedForm.value,
    scanSpeed: toFormValue(data.scanSpeed, speedForm.value.scanSpeed),
    sampleSpeed: toFormValue(data.sampleSpeed, speedForm.value.sampleSpeed),
    debugSpeed: toFormValue(data.debugSpeed, speedForm.value.debugSpeed),
    startSpeed: toFormValue(data.startSpeed, speedForm.value.startSpeed),
    resetSpeed1: toFormValue(data.resetSpeed1, speedForm.value.resetSpeed1),
    resetSpeed2: toFormValue(data.resetSpeed2, speedForm.value.resetSpeed2),
    accelTime: toFormValue(data.accelTime, speedForm.value.accelTime),
    decelTime: toFormValue(data.decelTime, speedForm.value.decelTime),
  }

  sampleForm.value = {
    ...sampleForm.value,
    sampleInterval: toFormValue(
      data.sampleInterval,
      sampleForm.value.sampleInterval
    ),
    samplePosition: toFormValue(
      data.samplePosition,
      sampleForm.value.samplePosition
    ),
    sampleRadius: toFormValue(data.sampleRadius, sampleForm.value.sampleRadius),
  }
}

const normalizeBooleanValue = (value: PlcWritableValue) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  const normalizedValue = value.trim().toLowerCase()

  if (['true', '1', 'on', 'yes'].includes(normalizedValue)) {
    return true
  }

  if (['false', '0', 'off', 'no'].includes(normalizedValue)) {
    return false
  }

  throw new Error('布尔类型PLC写入值无效')
}

const normalizePlcValue = (address: string, value: PlcWritableValue) => {
  const valueType = address.split(',')[1] ?? ''

  if (valueType.startsWith('X')) {
    return normalizeBooleanValue(value)
  }

  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`地址 ${address} 的写入值不能为空`)
  }

  const numericValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    throw new Error(`地址 ${address} 的写入值不是有效数字`)
  }

  if (valueType.startsWith('DINT')) {
    return Math.trunc(numericValue)
  }

  return numericValue
}

const isPlcParamBaselineReady = () =>
  Object.keys(plcParamBaseline.value).length ===
  Object.keys(addressItems).length

const isSamePlcValue = (
  address: string,
  currentValue: RackParamNormalizedValue,
  baselineValue: number | boolean | undefined
) => {
  if (baselineValue === undefined) {
    return false
  }

  const valueType = address.split(',')[1] ?? ''

  if (valueType.startsWith('REAL')) {
    return (
      Math.abs(Number(currentValue) - Number(baselineValue)) <=
      REAL_COMPARE_EPSILON
    )
  }

  return currentValue === baselineValue
}

const writePlcValue = async (address: string, value: PlcWritableValue) => {
  const result = await window.ipcApi.invoke('plc-writeValue', {
    address,
    value: normalizePlcValue(address, value),
  })

  if (!result.success) {
    throw new Error(result.error ?? `地址 ${address} 写入失败`)
  }

  return result
}

const getRackParamValues = (): Record<RackParamKey, string> =>
  ({
    ...hardwareForm.value,
    ...speedForm.value,
    ...sampleForm.value,
  }) as Record<RackParamKey, string>

const getChangedRackParams = () => {
  const rackParamValues = getRackParamValues()
  const changedEntries: Array<{
    key: RackParamKey
    address: string
    value: RackParamNormalizedValue
  }> = []

  for (const [key, address] of Object.entries(addressItems) as [
    RackParamKey,
    string,
  ][]) {
    const normalizedValue = normalizePlcValue(
      address,
      rackParamValues[key]
    ) as RackParamNormalizedValue
    const baselineValue = plcParamBaseline.value[key]

    if (!isSamePlcValue(address, normalizedValue, baselineValue)) {
      changedEntries.push({
        key,
        address,
        value: normalizedValue,
      })
    }
  }

  return changedEntries
}

const applyPlcParams = async () => {
  if (isApplying.value) {
    return
  }

  isApplying.value = true

  try {
    if (!isPlcParamBaselineReady()) {
      ElMessage.error('PLC 参数尚未完成初始化，请稍后重试')
      return
    }

    const changedParams = getChangedRackParams()

    if (changedParams.length === 0) {
      ElMessage.success('未检测到参数变化')
      return
    }

    const failedKeys: RackParamKey[] = []
    let successCount = 0

    for (const item of changedParams) {
      try {
        await writePlcValue(item.address, item.value)
        plcParamBaseline.value[item.key] = item.value
        successCount += 1
      } catch (error) {
        console.error(`PLC 参数 ${item.key} 写入失败:`, error)
        failedKeys.push(item.key)
      }
    }

    if (failedKeys.length === 0) {
      ElMessage.success(`PLC 参数已写入 ${successCount} 项`)
      return
    }

    if (successCount > 0) {
      ElMessage.warning(
        `已写入 ${successCount} 项，失败 ${failedKeys.length} 项：${failedKeys.join('、')}`
      )
      return
    }

    ElMessage.error(`PLC 参数写入失败：${failedKeys.join('、')}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'PLC 参数写入失败')
  } finally {
    isApplying.value = false
  }
}

const loadPlcParams = async () => {
  try {
    // const data = await window.ipcApi.invoke('plc-paramData', addressItems)
    // setFormValuesFromPlc(data)
    // plcParamBaseline.value = { ...data }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'PLC 参数读取失败')
  }
}

const formatProductionSpeedValue = (value: number | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    productionSpeed.value = '0.0mm/s'
    return
  }

  productionSpeed.value = `${value.toFixed(2)}mm/s`
}

const loadCalibrationState = async () => {
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
    ElMessage.error(error instanceof Error ? error.message : '标定状态读取失败')
  }
}

const applyManualTractionSpeed = async () => {
  if (isApplyingManualTractionSpeed.value) {
    return
  }

  const speed = Number(manualTractionSpeed.value)

  if (!Number.isFinite(speed) || speed <= 0) {
    ElMessage.error('请输入大于 0 的有效牵引速度')
    return
  }

  isApplyingManualTractionSpeed.value = true

  try {
    const result = (await window.ipcApi.invoke(
      'calibration-set-manual-traction-speed',
      {
        manualTractionSpeed: speed,
      }
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

const resetCalibration = async () => {
  if (isResettingCalibration.value) {
    return
  }

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
    ElMessage.error(error instanceof Error ? error.message : '本次标定重置失败')
  } finally {
    isResettingCalibration.value = false
  }
}

const loadDeviceConstants = async () => {
  try {
    const params = (await window.ipcApi.invoke(
      'config-get-device-constants'
    )) as IDeviceConstants
    rollerConfig.value = {
      mode: params.rollerMode as 'circumference' | 'diameter' | 'radius',
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

const loadCalibrationResults = async () => {
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

const saveDeviceConstants = async () => {
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

const saveCalibrationResults = async () => {
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

const onConstantBlur = () => {
  void saveDeviceConstants()
}
const onResultBlur = () => {
  void saveCalibrationResults()
  const pulse = thicknessResult.value.frameLengthPulse
  if (pulse !== undefined && Number.isFinite(pulse) && pulse > 0) {
    window.ipcApi.invoke('config-set-max-pulse', pulse).catch(() => {})
  }
}

const calibrateRollerSpeed = async () => {
  if (isCalRoller.value) return
  isCalRoller.value = true
  try {
    const circumference = getRollerCircumference()
    if (!Number.isFinite(circumference) || circumference <= 0) {
      ElMessage.error('请输入有效的辊尺寸')
      return
    }
    const r = (await window.ipcApi.invoke('calibration-auto-traction-speed', {
      circumference,
      numCycles: Number(rollerConfig.value.numCycles) || undefined,
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
    rollerResult.value = { tractionSpeed: r.tractionSpeed }
    if (r.tractionSpeed !== undefined) {
      window.ipcApi
        .invoke('calibration-set-manual-traction-speed', {
          manualTractionSpeed: r.tractionSpeed,
        })
        .catch(() => {})
    }
    const src = r.source === 'live' ? '实时' : '历史'
    ElMessage.success(`${src}标定完成: ${r.tractionSpeed} mm/s`)
    void saveCalibrationResults()
  } finally {
    isCalRoller.value = false
  }
}

const calibrateUpperAngle = async () => {
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
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
      ])
      resolveAngleCalibration = null
      if (maxAngle === null) {
        ElMessage.error('实时标定超时（120秒），请检查设备连接和数据')
        return
      }
      upperResult.value = { ...upperResult.value, maxAngle }
      ElMessage.success(`上旋最大角度: ${maxAngle}°`)
    } else {
      const r = (await window.ipcApi.invoke('calibration-max-angle-historical', {
        deltaMin: Number(upperConfig.value.deltaMin),
        deltaMax: Number(upperConfig.value.deltaMax),
        objectiveMode: upperConfig.value.objectiveMode,
      })) as { success: boolean; maxAngle?: number; error?: string }
      if (!r.success) {
        ElMessage.error(r.error ?? '标定失败')
        return
      }
      upperResult.value = { ...upperResult.value, maxAngle: r.maxAngle }
      ElMessage.success(`上旋最大角度: ${r.maxAngle}°`)
    }
    void saveCalibrationResults()
  } finally {
    isCalAngle.value = false
  }
}

const calibrateDistance = async () => {
  if (isCalDistance.value) return
  const speed = rollerResult.value.tractionSpeed
  if (!speed || !Number.isFinite(speed) || speed <= 0) {
    ElMessage.warning('请先标定牵引速度或手动输入')
    return
  }
  const windowSize = thicknessResult.value.mutationWindowSize
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
    })) as { success: boolean; distance?: number; error?: string }
    if (!r.success) {
      ElMessage.error(r.error ?? '标定失败')
      return
    }
    upperResult.value = { ...upperResult.value, distance: r.distance }
    ElMessage.success(`测量点距离: ${r.distance} mm`)
    void saveCalibrationResults()
  } finally {
    isCalDistance.value = false
  }
}

const formatCalibrationValue = (
  value: number | undefined,
  digits: number = 2,
  unit: string = ''
) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--'
  }

  return `${value.toFixed(digits)}${unit}`
}

const handleCalibrationResult = (_: unknown, data: ICalibrationResult) => {
  // 动态标定结果自动填充到设备标定结果
  if (data.tractionSpeed !== undefined) {
    rollerResult.value = { tractionSpeed: data.tractionSpeed }
    formatProductionSpeedValue(data.tractionSpeed)
  }
  if (data.distance !== undefined) {
    upperResult.value = { ...upperResult.value, distance: data.distance }
  }
  if (data.maxAngle !== undefined) {
    upperResult.value = { ...upperResult.value, maxAngle: data.maxAngle }
    resolveAngleCalibration?.(data.maxAngle)
    resolveAngleCalibration = null
  }
  if (data.mutationWindowSize !== undefined) {
    thicknessResult.value = {
      ...thicknessResult.value,
      mutationWindowSize: Math.round(data.mutationWindowSize),
    }
  }
}

const formatUpperRotationBoolean = (value: boolean | undefined) => {
  if (value === undefined) {
    return '--'
  }

  return value ? 'ON' : 'OFF'
}

const formatUpperRotationMotorFrequency = (value: number | undefined) => {
  if (value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return `${value.toFixed(2)} Hz`
}

const formatUpperRotationHeats = (value: number[] | undefined) => {
  if (!value || value.length === 0) {
    return '--'
  }

  return value.join(', ')
}

const handleUpperRotationData = (_: unknown, data: IUpperRotationDebugData) => {
  upperRotationDebug.value = {
    ...upperRotationDebug.value,
    ...data,
  }
}

const checkHardwareConnection = async () => {
  try {
    isHardwareConnected.value = (await window.ipcApi.invoke(
      'adbox-get-connection-status'
    )) as boolean
  } catch {
    isHardwareConnected.value = false
  }
}

onMounted(() => {
  void loadPlcParams()
  void loadCalibrationState()
  void loadDeviceConstants()
  void loadCalibrationResults()
  void checkHardwareConnection()
  window.ipcApi.on('calibration-result', handleCalibrationResult)
  window.ipcApi.on('upperRotation-read', handleUpperRotationData)
})

onUnmounted(() => {
  window.ipcApi.off('upperRotation-read', handleUpperRotationData)
})

// 运行状态
const runningState = ref<IState>('STOP')

const options: Option[] = [
  {
    label: '正行',
    value: 'FWD',
  },
  {
    label: '反行',
    value: 'REV',
  },
  {
    label: '停止',
    value: 'STOP',
  },
  {
    label: '归边',
    value: 'HOME',
  },
  {
    label: '扫描',
    value: 'MEASURE',
  },
]

// 运行状态切换
const inputChangeState = async (options: IState) => {
  switch (options) {
    case 'FWD':
      await window.ipcApi.invoke('adbox-forward')
      break
    case 'REV':
      await window.ipcApi.invoke('adbox-backward')
      break
    case 'STOP':
      await window.ipcApi.invoke('adbox-stop')
      break
    case 'HOME':
      await window.ipcApi.invoke('adbox-home')
      break
    case 'MEASURE':
      await window.ipcApi.invoke('adbox-start-scan')
      break
    // 可选：兜底处理未知状态
    default:
      console.warn('未知的状态类型:', options)
  }
}

// 移动到脉冲位置
const moveToPulsePosition = async () => {
  await window.ipcApi.invoke('adbox-move-to', targetPulse.value)
}

// 监听adbox:data
window.ipcApi.on('adbox-data', (_, data) => {
  currentAD.value = data.ad0
  // thickness.value = calcThickness(data.ad0, { airAD: 50300, gain: 1.35 }).toFixed(2)
  if (data.pos0) {
    measurePosition.value = data.pos0
  }
})

window.ipcApi.on('adbox-run-result', (_, data) => {
  console.log('运动指令反馈', data)
})
</script>
<template>
  <el-card class="control-container">
    <div class="thickness-measure-container">
      <!-- 顶部状态栏 -->
      <el-card class="status-card" shadow="never">
        <div class="status-row">
          <div class="status-item">
            <span class="label">当前AD:</span>
            <span class="value" style="width: 100px">{{ currentAD }}</span>
          </div>
          <div class="status-item">
            <span class="label">测量位置:</span>
            <span class="value">{{ measurePosition }}</span>
          </div>
          <div class="status-item">
            <span class="label">生产速度:</span>
            <span class="value">{{ productionSpeed }}</span>
          </div>
          <div class="status-item">
            <span class="label">厚度:</span>
            <span class="value">{{ thickness }} um</span>
          </div>
          <div class="status-item">
            <span class="label">膜泡折变:</span>
            <span class="value">{{ bubbleChange }}</span>
          </div>
        </div>
      </el-card>

      <!-- 操作按钮区 -->
      <div class="action-bar">
        <div class="controls_container">
          <el-segmented
            @change="inputChangeState"
            style="height: 45px"
            v-model="runningState"
            :options="options"
            block
            size="large"
          >
            <template #default="{ item }">
              <div>
                <div>{{ (item as Option).label }}</div>
              </div>
            </template>
          </el-segmented>
        </div>
        <el-input
          v-model="targetPulse"
          class="pulse-input"
          placeholder="目标脉冲"
        />
        <el-button @click="moveToPulsePosition" type="success"
          >到达(脉冲)</el-button
        >
      </div>

      <!-- 标签页 -->
      <el-tabs v-model="activeTab" class="tab-container">
        <el-tab-pane label="参数" name="param">
          <div class="tab-pane-body">
            <!-- 上旋 - 单独一行 -->
            <div class="device-single-row">
              <el-card shadow="hover" class="device-card device-card-wide">
                <template #header>
                  <div class="device-card-header">
                    <span>上旋</span>
                    <span
                      class="device-status"
                      :class="{ connected: isHardwareConnected }"
                    >
                      <span class="status-dot"></span>
                      信号
                    </span>
                  </div>
                </template>
                <div class="device-card-body">
                  <div class="upper-debug-grid">
                    <div class="debug-item">
                      <span class="debug-label">正转</span>
                      <span class="debug-value">{{
                        formatUpperRotationBoolean(
                          upperRotationDebug.ForwardRotation
                        )
                      }}</span>
                    </div>
                    <div class="debug-item">
                      <span class="debug-label">反转</span>
                      <span class="debug-value">{{
                        formatUpperRotationBoolean(
                          upperRotationDebug.ReverseRotation
                        )
                      }}</span>
                    </div>
                    <div class="debug-item">
                      <span class="debug-label">正换向</span>
                      <span class="debug-value">{{
                        formatUpperRotationBoolean(
                          upperRotationDebug.ForwardDirectionChange
                        )
                      }}</span>
                    </div>
                    <div class="debug-item">
                      <span class="debug-label">反换向</span>
                      <span class="debug-value">{{
                        formatUpperRotationBoolean(
                          upperRotationDebug.ReverseDirectionChange
                        )
                      }}</span>
                    </div>
                    <div class="debug-item">
                      <span class="debug-label">复位</span>
                      <span class="debug-value">{{
                        formatUpperRotationBoolean(upperRotationDebug.Reset)
                      }}</span>
                    </div>
                    <div class="debug-item">
                      <span class="debug-label">电机频率</span>
                      <span class="debug-value">{{
                        formatUpperRotationMotorFrequency(
                          upperRotationDebug.MotorFrequency
                        )
                      }}</span>
                    </div>
                  </div>
                  <div class="device-constants">
                    <el-input
                      v-model.number="upperResult.maxAngle"
                      size="small"
                      placeholder="最大角度"
                      @blur="onResultBlur"
                    >
                      <template #prepend>最大角度</template>
                      <template #append>°</template>
                    </el-input>
                  </div>
                  <div class="device-actions">
                    <el-button
                      type="primary"
                      size="small"
                      :loading="isCalAngle"
                      @click="calibrateUpperAngle"
                      >标定</el-button
                    >
                  </div>
                </div>
              </el-card>
            </div>
            <div class="device-cards-row">
              <!-- 收卷辊 -->
              <el-card shadow="hover" class="device-card">
                <template #header>
                  <div class="device-card-header">
                    <span>收卷辊</span>
                    <span
                      class="device-status"
                      :class="{ connected: isHardwareConnected }"
                    >
                      <span class="status-dot"></span>
                      辊速信号
                    </span>
                  </div>
                </template>
                <div class="device-card-body">
                  <div class="roller-dim-row">
                    <el-input
                      v-model="rollerConfig.value"
                      size="small"
                      placeholder="数值"
                      @blur="onConstantBlur"
                    >
                      <template #prepend>
                        <el-select
                          v-model="rollerConfig.mode"
                          size="small"
                          style="width: 88px"
                          @blur="onConstantBlur"
                        >
                          <el-option label="周长" value="circumference" />
                          <el-option label="直径" value="diameter" />
                          <el-option label="半径" value="radius" /> </el-select
                      ></template>
                      <template #append>mm</template>
                    </el-input>
                  </div>
                  <el-input
                    v-model="rollerConfig.numCycles"
                    size="small"
                    placeholder="圈数"
                    @blur="onConstantBlur"
                  >
                    <template #prepend>标定圈数</template>
                  </el-input>
                  <el-input
                    v-model.number="rollerResult.tractionSpeed"
                    size="small"
                    placeholder="牵引速度"
                    @blur="onResultBlur"
                  >
                    <template #prepend>牵引速度</template>
                    <template #append>mm/s</template>
                  </el-input>
                  <div class="device-actions">
                    <el-button
                      type="primary"
                      size="small"
                      :loading="isCalRoller"
                      @click="calibrateRollerSpeed"
                      >标定</el-button
                    >
                  </div>
                </div>
              </el-card>

              <!-- 测厚仪 -->
              <el-card shadow="hover" class="device-card">
                <template #header>
                  <div class="device-card-header">
                    <span>测厚仪</span>
                    <span
                      class="device-status"
                      :class="{ connected: isHardwareConnected }"
                    >
                      <span class="status-dot"></span>
                      数据
                    </span>
                  </div>
                </template>
                <div class="device-card-body">
                  <div class="device-constants">
                    <el-input
                      v-model="thicknessConfig.airAD"
                      size="small"
                      placeholder="空气 AD 值"
                      @blur="onConstantBlur"
                    >
                      <template #prepend>空气 AD</template>
                    </el-input>
                    <el-input
                      v-model="thicknessConfig.materialGain"
                      size="small"
                      placeholder="材料补偿倍率"
                      @blur="onConstantBlur"
                    >
                      <template #prepend>补偿倍率</template>
                    </el-input>
                  </div>
                  <div class="device-constants">
                    <el-input
                      v-model.number="thicknessResult.frameLengthPulse"
                      size="small"
                      placeholder="机架长度（脉冲量）"
                      @blur="onResultBlur"
                    >
                      <template #prepend>机架长度（脉冲量）</template>
                    </el-input>
                  </div>
                  <div class="device-result">
                    <span class="result-label">机架长度（mm）</span>
                    <span class="result-value">{{
                      thicknessResult.frameLengthMM !== undefined
                        ? String(thicknessResult.frameLengthMM)
                        : '--'
                    }}</span>
                  </div>
                </div>
              </el-card>

              <!-- 风环 -->
              <el-card shadow="hover" class="device-card">
                <template #header>
                  <div class="device-card-header">
                    <span>风环</span>
                    <span
                      class="device-status"
                      :class="{ connected: isHardwareConnected }"
                    >
                      <span class="status-dot"></span>
                      状态
                    </span>
                  </div>
                </template>
                <div class="device-card-body">
                  <div class="device-constants">
                    <el-input
                      v-model="airRingConfig.airDuctCount"
                      size="small"
                      placeholder="风道数量"
                      @blur="onConstantBlur"
                    >
                      <template #prepend>风道数量</template>
                    </el-input>
                  </div>
                </div>
              </el-card>

              <!-- 系统 -->
              <el-card shadow="hover" class="device-card">
                <template #header>
                  <div class="device-card-header">
                    <span>系统</span>
                    <span
                      class="device-status"
                      :class="{ connected: isHardwareConnected }"
                    >
                      <span class="status-dot"></span>
                      状态
                    </span>
                  </div>
                </template>
                <div class="device-card-body">
                  <div class="device-constants">
                    <el-input
                      v-model="systemConfig.airDuct1Angle"
                      size="small"
                      placeholder="1号风道角度"
                      @blur="onConstantBlur"
                    >
                      <template #prepend>1号风道角度</template>
                      <template #append>°</template>
                    </el-input>
                  </div>
                  <div class="device-constants">
                    <el-input
                      v-model.number="upperResult.distance"
                      size="small"
                      placeholder="测量点距离"
                      @blur="onResultBlur"
                    >
                      <template #prepend>测量点距离</template>
                      <template #append>mm</template>
                    </el-input>
                  </div>
                  <div class="device-constants">
                    <el-input
                      v-model.number="thicknessResult.mutationWindowSize"
                      size="small"
                      placeholder="突变窗口"
                      @blur="onResultBlur"
                    >
                      <template #prepend>突变窗口</template>
                    </el-input>
                  </div>
                </div>
              </el-card>
            </div>

            <!-- 硬件/速度/采样/报警 四列布局 -->
            <el-row :gutter="20" class="form-row">
              <!-- 硬件 -->
              <el-col :span="6">
                <el-card shadow="hover" header="硬件">
                  <el-form
                    :model="hardwareForm"
                    label-width="100px"
                    label-position="top"
                  >
                    <el-form-item label="机架长度(脉冲)">
                      <el-input
                        v-model="hardwareForm.frameLength"
                        suffix="mm/脉冲"
                      />
                    </el-form-item>
                    <el-form-item label="收卷辊周长">
                      <el-input
                        v-model="hardwareForm.rollerCircumference"
                        suffix="mm/脉冲"
                      />
                    </el-form-item>
                    <el-form-item label="编码器1比例">
                      <el-input
                        v-model="hardwareForm.encoderRatio"
                        suffix="mm/脉冲"
                      />
                    </el-form-item>
                    <el-form-item label="电机脉冲">
                      <el-input v-model="hardwareForm.motorPulse" />
                    </el-form-item>
                    <el-form-item label="编码脉冲">
                      <el-input v-model="hardwareForm.codePulse" />
                    </el-form-item>
                    <el-form-item label="零位偏移">
                      <el-input
                        v-model="hardwareForm.zeroOffset"
                        suffix="脉冲"
                      />
                    </el-form-item>
                    <!-- <el-form-item label="AD滞后">
                              <el-input v-model="hardwareForm.adDelay" suffix="ms" />
                           </el-form-item> -->
                  </el-form>
                </el-card>
              </el-col>

              <!-- 速度 -->
              <el-col :span="6">
                <el-card shadow="hover" header="速度">
                  <el-form
                    :model="speedForm"
                    label-width="100px"
                    label-position="top"
                  >
                    <el-form-item label="扫描速度">
                      <el-input
                        v-model="speedForm.scanSpeed"
                        suffix="脉冲/s | 6.3m/min"
                      />
                    </el-form-item>
                    <el-form-item label="采样速度">
                      <el-input
                        v-model="speedForm.sampleSpeed"
                        suffix="脉冲/s | 4.2m/min"
                      />
                    </el-form-item>
                    <el-form-item label="调试速度">
                      <el-input
                        v-model="speedForm.debugSpeed"
                        suffix="脉冲/s | 4.2m/min"
                      />
                    </el-form-item>
                    <el-form-item label="开始速度">
                      <el-input
                        v-model="speedForm.startSpeed"
                        suffix="脉冲/s | 0.6m/min"
                      />
                    </el-form-item>
                    <el-form-item label="归零速度1">
                      <el-input
                        v-model="speedForm.resetSpeed1"
                        suffix="脉冲/s | 4.2m/min"
                      />
                    </el-form-item>
                    <el-form-item label="归零速度2">
                      <el-input
                        v-model="speedForm.resetSpeed2"
                        suffix="脉冲/s | 1.3m/min"
                      />
                    </el-form-item>
                    <el-row :gutter="10">
                      <el-col :span="12">
                        <el-form-item label="加速时间">
                          <el-input v-model="speedForm.accelTime" suffix="ms" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="减速时间">
                          <el-input v-model="speedForm.decelTime" suffix="ms" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </el-form>
                </el-card>
              </el-col>

              <!-- 采样 -->
              <el-col :span="6">
                <el-card shadow="hover" header="采样">
                  <el-form
                    :model="sampleForm"
                    label-width="100px"
                    label-position="top"
                  >
                    <el-form-item label="采样间隔">
                      <el-input
                        v-model="sampleForm.sampleInterval"
                        suffix="min"
                      />
                    </el-form-item>
                    <el-form-item label="采样位置">
                      <el-input
                        v-model="sampleForm.samplePosition"
                        suffix="脉冲 | 28mm"
                      />
                    </el-form-item>
                    <el-form-item label="采样半径">
                      <el-input
                        v-model="sampleForm.sampleRadius"
                        suffix="脉冲 | 14mm"
                      />
                    </el-form-item>
                  </el-form>
                </el-card>
              </el-col>

              <!-- 厚度报警 -->
              <el-col :span="6">
                <div class="alarm-form">
                  <el-card shadow="hover" header="厚度报警">
                    <el-form
                      :model="alarmForm"
                      label-width="100px"
                      label-position="top"
                    >
                      <el-form-item>
                        <el-checkbox v-model="alarmForm.alarmActive"
                          >报警激活</el-checkbox
                        >
                      </el-form-item>
                      <el-form-item>
                        <el-checkbox v-model="alarmForm.autoTarget"
                          >自动目标值</el-checkbox
                        >
                      </el-form-item>
                      <el-form-item label="公差报警(分区)">
                        <el-input v-model="alarmForm.toleranceZone" />
                      </el-form-item>
                      <div class="alarm-tip">
                        连续N个分区超出公差范围触发报警!!
                      </div>
                    </el-form>
                  </el-card>
                  <!-- 底部按钮 -->
                  <div class="bottom-action">
                    <el-button
                      type="primary"
                      size="large"
                      :loading="isApplying"
                      @click="applyPlcParams"
                      >应用</el-button
                    >
                  </div>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <el-tab-pane label="横向" name="lateral">
          <div class="tab-pane-body">
            <!-- 横向 -->
          </div>
        </el-tab-pane>

        <el-tab-pane label="寻边" name="edge">
          <div class="tab-pane-body">
            <!-- 寻边 -->
            <div class="chart-container">
              <SideCharts />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-card>
</template>

<style scoped lang="less">
.control-container {
  width: 100%;
  height: 100%;
  min-height: 0;

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background-color: #f5f7fa;
  }
}

.thickness-measure-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.tab-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  :deep(.el-tabs__header) {
    flex-shrink: 0;
  }

  :deep(.el-tabs__content) {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.el-tab-pane) {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.tab-pane-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding-right: 4px;
  padding-bottom: 28px;
}

.chart-container {
  height: 600px;
}

.calibration-result-card {
  margin-bottom: 20px;
}

.calibration-control-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.manual-traction-speed-input {
  width: 220px;
}

.calibration-control-tip {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.calibration-result-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.dynamic-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #909399;
  padding: 4px 12px;
  border-radius: 12px;
  background: #f5f7fa;
}

.dynamic-status .status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e0e0e0;
  display: inline-block;
}

.dynamic-status.connected .status-dot {
  background: #67c23a;
}

.dynamic-status.connected {
  color: #67c23a;
  background: #f0f9eb;
}

.dynamic-result {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

.device-single-row {
  margin-bottom: 16px;
}

.device-card-wide {
  width: 100%;
}

.device-cards-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.device-card {
  display: flex;
  flex-direction: column;
}

.device-card :deep(.el-card__body) {
  padding: 14px 18px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.device-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
}

.device-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 400;
  color: #909399;
}

.device-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e0e0e0;
  display: inline-block;
}

.device-status.connected .status-dot {
  background: #67c23a;
}

.device-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.device-card-body :deep(.el-input__wrapper),
.device-card-body :deep(.el-select),
.device-card-body :deep(.el-button),
.device-card-body .device-result {
  height: 40px;
}

.device-card-body :deep(.el-input__wrapper) {
  border-radius: 4px;
}

.device-card-body :deep(.el-select) {
  align-items: center;
}

.device-card-body :deep(.el-select__wrapper) {
  height: 40px;
}

.roller-dim-row {
  display: flex;
  gap: 4px;
}

.roller-dim-row :deep(.el-select) {
  width: 80px;
  flex-shrink: 0;
}

.roller-dim-row :deep(.el-input) {
  flex: 1;
}

.device-constants {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.device-constants :deep(.el-input) {
  width: 100%;
}

.constants-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.constants-row :deep(.el-input) {
  flex: 1;
}

.constants-sep {
  color: #909399;
  flex-shrink: 0;
}

.device-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.device-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  flex-wrap: wrap;
}

.device-result .result-label {
  color: #909399;
  font-size: 12px;
}

.device-result .result-value {
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.upper-debug-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.debug-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 4px;
  background: #fff;
}

.debug-item-wide {
  grid-column: span 3;
}

.debug-label {
  color: #909399;
  font-size: 11px;
}

.debug-value {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.upper-rotation-debug-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.calibration-result-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.calibration-result-item .label {
  color: #909399;
  font-size: 13px;
}

.calibration-result-item .value {
  color: #303133;
  font-size: 20px;
  font-weight: 600;
}

.upper-rotation-heats-item {
  grid-column: span 2;
}

.controls_container {
  width: 400px;
  border: 1px solid #c1c1c1;
  border-radius: 5px;
  margin-right: 50px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-item .label {
  color: #606266;
  font-size: 14px;
}

.status-item .value {
  color: #303133;
  font-weight: 600;
  font-size: 15px;
}

.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0;
}

.pulse-input {
  width: 150px;
}

.alarm-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 10px;
}

.alarm-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.bottom-action {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-right: 20px;
}
</style>
