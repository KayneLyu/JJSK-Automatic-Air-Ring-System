import { ref, onUnmounted } from 'vue'
import type { PushData } from '@jjsk/adbox-sdk'

export function useRackStatus() {
  const currentAD = ref(12345)
  const measurePosition = ref(0)
  const productionSpeed = ref('0.0m/min')
  const thickness = ref('0')
  const bubbleChange = ref('0mm')

  function handleAdboxData(_: unknown, data: PushData) {
    currentAD.value = data.ad0
    if (data.pos0) {
      measurePosition.value = data.pos0
    }
  }

  function handleAdboxRunResult(_: unknown, data: unknown) {
    console.log('运动指令反馈', data)
  }

  window.ipcApi.on('adbox-data', handleAdboxData)
  window.ipcApi.on('adbox-run-result', handleAdboxRunResult)

  onUnmounted(() => {
    window.ipcApi.off('adbox-data', handleAdboxData)
    window.ipcApi.off('adbox-run-result', handleAdboxRunResult)
  })

  return {
    currentAD,
    measurePosition,
    productionSpeed,
    thickness,
    bubbleChange,
  }
}
