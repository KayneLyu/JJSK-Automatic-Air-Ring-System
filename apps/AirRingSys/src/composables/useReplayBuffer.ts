import { ref } from 'vue'
import type { IPollingBatchData } from '@/types/ipc'
import { useFrameStore } from '@/store/frame'

type ReplayBatch = { adValues: number[]; pulses: number[] }

const buffer = ref<ReplayBatch[]>([])
const isProcessing = ref(false)

function detectSweeps(
  allBatches: ReplayBatch[]
): { adValues: number[]; pulses: number[] }[] {
  const allPulses: number[] = []
  const allAdValues: number[] = []

  for (const batch of allBatches) {
    for (let i = 0; i < batch.pulses.length; i++) {
      const pulse = batch.pulses[i]
      if (pulse < 0 || pulse > 6999) continue
      allPulses.push(pulse)
      allAdValues.push(batch.adValues[i])
    }
  }

  const sweeps: { adValues: number[]; pulses: number[] }[] = []
  let currentPulses: number[] = []
  let currentAdValues: number[] = []
  let direction = 0
  let lastValidPulse: number | null = null

  for (let i = 0; i < allPulses.length; i++) {
    const pulse = allPulses[i]
    const ad = allAdValues[i]

    if (lastValidPulse !== null) {
      const delta = pulse - lastValidPulse
      const newDirection = delta > 0 ? 1 : delta < 0 ? -1 : 0

      if (newDirection !== 0 && direction !== 0 && newDirection !== direction) {
        const isBoundary =
          (direction === 1 && lastValidPulse > 6800 && newDirection === -1) ||
          (direction === -1 && lastValidPulse < 200 && newDirection === 1)

        if (isBoundary && currentPulses.length > 100) {
          sweeps.push({
            adValues: [...currentAdValues],
            pulses: [...currentPulses],
          })
          currentPulses = []
          currentAdValues = []
        }
      }

      if (newDirection !== 0) {
        direction = newDirection
      }
    }

    currentPulses.push(pulse)
    currentAdValues.push(ad)
    lastValidPulse = pulse
  }

  if (currentPulses.length > 100) {
    sweeps.push({
      adValues: [...currentAdValues],
      pulses: [...currentPulses],
    })
  }

  return sweeps
}

export function useReplayBuffer() {
  const addReplayBatch = (batch: IPollingBatchData) => {
    buffer.value.push({ adValues: batch.adValues, pulses: batch.pulses })
  }

  const flushReplayBuffer = async () => {
    const batches = buffer.value
    if (batches.length === 0 || isProcessing.value) return

    isProcessing.value = true
    buffer.value = []

    try {
      const sweeps = detectSweeps(batches)
      if (sweeps.length === 0) {
        console.warn('[Import] 未检测到任何完整扫描')
        return
      }

      console.log(`[Import] 检测到 ${sweeps.length} 个扫描，正在导入 SQLite...`)

      const frameStore = useFrameStore()
      let lastFrameId = 0

      for (const sweep of sweeps) {
        const frameId = await window.ipcApi.invoke('db-import-sweep', {
          pulses: sweep.pulses,
          adValues: sweep.adValues,
          source: 'log-import',
        })
        if (frameId > lastFrameId) lastFrameId = frameId
      }

      if (lastFrameId > 0) {
        frameStore.updateFrameId = lastFrameId
      }

      console.log(`[Import] 完成！${sweeps.length} 个帧已导入 SQLite`)
    } finally {
      isProcessing.value = false
    }
  }

  return {
    buffer,
    isProcessing,
    addReplayBatch,
    flushReplayBuffer,
  }
}
