import { ref } from 'vue'
import type {
  IPlcParamData,
  IPlcParamResult,
  IPlcWriteMessage,
} from '@/types/ipc'

const REAL_COMPARE_EPSILON = 1e-6

type PlcWritableValue = string | number | boolean
type RackParamKey = keyof IPlcParamData
type RackParamNormalizedValue = number | boolean

export interface HardwareForm {
  frameLength: string
  rollerCircumference: string
  encoderRatio: string
  motorPulse: string
  codePulse: string
  zeroOffset: string
  adDelay: string
}

export interface SpeedForm {
  scanSpeed: string
  sampleSpeed: string
  debugSpeed: string
  startSpeed: string
  resetSpeed1: string
  resetSpeed2: string
  accelTime: string
  decelTime: string
}

export interface SampleForm {
  sampleInterval: string
  samplePosition: string
  sampleRadius: string
}

export interface AlarmForm {
  alarmActive: boolean
  autoTarget: boolean
  toleranceZone: string
}

export const ADDRESS_ITEMS: IPlcParamData = {
  frameLength: 'DB4,DINT2',
  rollerCircumference: 'DB4,REAL6',
  encoderRatio: 'DB4,REAL10',
  motorPulse: 'DB4,DINT14',
  codePulse: 'DB4,DINT18',
  zeroOffset: 'DB4,DINT22',
  scanSpeed: 'DB4,REAL30',
  sampleSpeed: 'DB4,REAL34',
  debugSpeed: 'DB4,REAL38',
  startSpeed: 'DB4,REAL42',
  resetSpeed1: 'DB4,REAL46',
  resetSpeed2: 'DB4,REAL50',
  accelTime: 'DB4,REAL54',
  decelTime: 'DB4,REAL58',
  sampleInterval: 'DB4,DINT62',
  samplePosition: 'DB4,DINT66',
  sampleRadius: 'DB4,DINT70',
}

function normalizeBooleanValue(value: PlcWritableValue): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'on', 'yes'].includes(normalized)) return true
  if (['false', '0', 'off', 'no'].includes(normalized)) return false
  throw new Error('布尔类型PLC写入值无效')
}

function normalizePlcValue(
  address: string,
  value: PlcWritableValue
): number | boolean {
  const valueType = address.split(',')[1] ?? ''
  if (valueType.startsWith('X')) return normalizeBooleanValue(value)
  if (typeof value === 'string' && value.trim() === '') {
    throw new Error(`地址 ${address} 的写入值不能为空`)
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`地址 ${address} 的写入值不是有效数字`)
  }
  if (valueType.startsWith('DINT')) return Math.trunc(numeric)
  return numeric
}

function isSamePlcValue(
  address: string,
  currentValue: RackParamNormalizedValue,
  baselineValue: number | boolean | undefined
): boolean {
  if (baselineValue === undefined) return false
  const valueType = address.split(',')[1] ?? ''
  if (valueType.startsWith('REAL')) {
    return (
      Math.abs(Number(currentValue) - Number(baselineValue)) <=
      REAL_COMPARE_EPSILON
    )
  }
  return currentValue === baselineValue
}

export function useRackPlcParams() {
  const hardwareForm = ref<HardwareForm>({
    frameLength: '13900',
    rollerCircumference: '314',
    encoderRatio: '0.14',
    motorPulse: '4',
    codePulse: '1',
    zeroOffset: '0',
    adDelay: '0',
  })
  const speedForm = ref<SpeedForm>({
    scanSpeed: '3000',
    sampleSpeed: '2000',
    debugSpeed: '2000',
    startSpeed: '300',
    resetSpeed1: '2000',
    resetSpeed2: '600',
    accelTime: '400',
    decelTime: '500',
  })
  const sampleForm = ref<SampleForm>({
    sampleInterval: '10',
    samplePosition: '200',
    sampleRadius: '100',
  })
  const alarmForm = ref<AlarmForm>({
    alarmActive: false,
    autoTarget: true,
    toleranceZone: '10',
  })

  const plcParamBaseline = ref<Partial<IPlcParamResult>>({})
  const isApplying = ref(false)

  function getRackParamValues(): Record<RackParamKey, string> {
    return {
      ...hardwareForm.value,
      ...speedForm.value,
      ...sampleForm.value,
    } as Record<RackParamKey, string>
  }

  function getChangedRackParams() {
    const rackParamValues = getRackParamValues()
    const changed: Array<{
      key: RackParamKey
      address: string
      value: RackParamNormalizedValue
    }> = []
    for (const [key, address] of Object.entries(ADDRESS_ITEMS) as [
      RackParamKey,
      string,
    ][]) {
      const normalized = normalizePlcValue(
        address,
        rackParamValues[key]
      ) as RackParamNormalizedValue
      const baseline = plcParamBaseline.value[key]
      if (!isSamePlcValue(address, normalized, baseline)) {
        changed.push({ key, address, value: normalized })
      }
    }
    return changed
  }

  async function writePlcValue(address: string, value: PlcWritableValue) {
    const message: IPlcWriteMessage = {
      address,
      value: normalizePlcValue(address, value),
    }
    const result = await window.ipcApi.invoke('plc-writeValue', message)
    if (!result.success) {
      throw new Error(result.error ?? `地址 ${address} 写入失败`)
    }
    return result
  }

  async function applyPlcParams() {
    if (isApplying.value) return
    isApplying.value = true
    try {
      if (
        Object.keys(plcParamBaseline.value).length !==
        Object.keys(ADDRESS_ITEMS).length
      ) {
        ElMessage.error('PLC 参数尚未完成初始化，请稍后重试')
        return
      }
      const changed = getChangedRackParams()
      if (changed.length === 0) {
        ElMessage.success('未检测到参数变化')
        return
      }
      const failedKeys: RackParamKey[] = []
      let successCount = 0
      for (const item of changed) {
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
      ElMessage.error(
        error instanceof Error ? error.message : 'PLC 参数写入失败'
      )
    } finally {
      isApplying.value = false
    }
  }

  return {
    hardwareForm,
    speedForm,
    sampleForm,
    alarmForm,
    isApplying,
    applyPlcParams,
  }
}
