<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useFrameStore } from '@/store/frame.ts'
import { useProduct } from '@/store/product.ts'
import { useApiDataStore } from '@/store/polling-data.ts'
import {
  normalizeThicknessRealtimePayload,
  createThicknessCollector,
  calcThickness,
} from '@/views/settings/rack/utiles.ts'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IPollingModBusData, IUpperRotationDebugData } from '@/types/ipc'
import HeaderComponent from './header/index.vue'
import MenuComponent from './menu/index.vue'
import ContentComponent from './content/index.vue'

const store = useApiDataStore()
const frameStore = useFrameStore()
const productStore = useProduct()

const meanValue = ref(0)

// ===== ADBox → Dexie 统一时间序列桥接 =====
const frameCollector = createThicknessCollector()

const getAirAD = () => {
  return store.apiThickData.SampleAD || 50300
}

const getGain = () => {
  return productStore.param?.scale || 1.0
}

const processThicknessData = (
  payload: IPollingModBusData | PushData | PushData[]
) => {
  const batch = normalizeThicknessRealtimePayload(payload)
  if (!batch) return

  // 保留 sweep 检测用于实时显示
  const completed = frameCollector.process(batch.pulses, batch.adValues)
  if (!completed) return

  const rawAdValues = completed
    .map((p: { ad: number | null }) => p.ad)
    .filter((v: number | null) => v !== null && Number.isFinite(v)) as number[]

  if (rawAdValues.length < 100) return

  const airAD = getAirAD()
  const gain = getGain()

  const datalist = rawAdValues.map((ad) => calcThickness(ad, { airAD, gain }))
  const validValues = datalist.filter((v) => v > 0)
  if (validValues.length < 100) return

  const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length
  const nowMs = Date.now()

  // 本地 frameStore 更新 (用于实时显示)
  frameStore.updateFrameId = nowMs
  frameStore.meanValue = Math.round(mean * 100) / 100
}

const handleAdboxFrame = (
  _: unknown,
  payload: IPollingModBusData | PushData | PushData[]
) => {
  processThicknessData(payload)
}

window.ipcApi.on('adbox-data', handleAdboxFrame)

// ===== 上旋状态（仅用于本地显示，持久化由主进程 pipeline 处理）=====
const handleUpperRotationData = (_: unknown, data: IUpperRotationDebugData) => {
  // 仅更新实时显示用 store
  if (data.Heats && data.Heats.length > 0) {
    const airRingStore = useApiDataStore()
    // 如果当前 airRing 数据在此轮更新中未变化，则不操作
    // 实际显示由 settings/rack/index.vue 处理
  }
}

window.ipcApi.on('upperRotation-read', handleUpperRotationData)

onBeforeUnmount(() => {
  window.ipcApi.off('adbox-data', handleAdboxFrame)
  window.ipcApi.off('upperRotation-read', handleUpperRotationData)
})
</script>

<template>
  <div class="layout">
    <HeaderComponent />
    <div class="layout_content">
      <div class="layout_menu">
        <MenuComponent />
      </div>
      <div class="layout_main">
        <div class="layout_views">
          <ContentComponent />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.layout_content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;

  .layout_menu {
    height: 100%;
  }

  .layout_main {
    flex: 1;
    min-height: 0;
    background-color: var(--clr);
    display: flex;
    flex-direction: column;

    .layout_views {
      flex: 1;
      min-height: 0;
    }
  }
}
</style>
