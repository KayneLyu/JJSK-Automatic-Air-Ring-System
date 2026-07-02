import { ref, onMounted, onUnmounted } from 'vue'
import type { IUpperRotationDebugData } from '@/types/ipc'

export function useUpperRotationDebug() {
  const upperRotationDebug = ref<IUpperRotationDebugData>({})
  const isHardwareConnected = ref(false)

  function handleUpperRotationData(_: unknown, data: IUpperRotationDebugData) {
    upperRotationDebug.value = {
      ...upperRotationDebug.value,
      ...data,
    }
  }

  async function checkHardwareConnection() {
    try {
      isHardwareConnected.value = (await window.ipcApi.invoke(
        'adbox-get-connection-status'
      )) as boolean
    } catch {
      isHardwareConnected.value = false
    }
  }

  function formatUpperRotationBoolean(value: boolean | undefined): string {
    if (value === undefined) return '--'
    return value ? 'ON' : 'OFF'
  }

  function formatUpperRotationMotorFrequency(
    value: number | undefined
  ): string {
    if (value === undefined || Number.isNaN(value)) return '--'
    return `${value.toFixed(2)} Hz`
  }

  function formatUpperRotationHeats(value: number[] | undefined): string {
    if (!value || value.length === 0) return '--'
    return value.join(', ')
  }

  onMounted(() => {
    window.ipcApi.on('upperRotation-read', handleUpperRotationData)
  })

  onUnmounted(() => {
    window.ipcApi.off('upperRotation-read', handleUpperRotationData)
  })

  return {
    upperRotationDebug,
    isHardwareConnected,
    checkHardwareConnection,
    formatUpperRotationBoolean,
    formatUpperRotationMotorFrequency,
    formatUpperRotationHeats,
  }
}
