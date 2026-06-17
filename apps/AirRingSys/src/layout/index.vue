<script setup lang='ts'>
import { watch, ref, onBeforeUnmount } from 'vue';
import { useFrameStore } from '@/store/frame.ts';
import { useProduct } from '@/store/product.ts';
import { useApiDataStore } from '@/store/polling-data.ts';
import { normalizeThicknessRealtimePayload, createThicknessCollector, calcThickness } from '@/views/settings/rack/utiles.ts'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IPollingModBusData, IUpperRotationDebugData, FrameBatchItem } from '@/types/ipc'
import HeaderComponent from './header/index.vue';
import MenuComponent from './menu/index.vue';
import ContentComponent from './content/index.vue';

const store = useApiDataStore();
const frameStore = useFrameStore();
const productStore = useProduct();

const meanValue = ref(0);

// ===== ADBox → Dexie 统一时间序列桥接 =====
const frameCollector = createThicknessCollector()

const getAirAD = () => {
    return store.apiThickData.SampleAD || 50300
}

const getGain = () => {
    return productStore.param?.scale || 1.0
}

const processThicknessData = (payload: IPollingModBusData | PushData | PushData[]) => {
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

    const datalist = rawAdValues.map(ad => calcThickness(ad, { airAD, gain }))
    const validValues = datalist.filter(v => v > 0)
    if (validValues.length < 100) return

    const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length
    const variance = validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length
    const sigmaVal = Math.sqrt(variance) * 2
    const sigmaPercent = mean > 0 ? (sigmaVal / mean) * 100 : 0
    const minVal = Math.min(...validValues)
    const maxVal = Math.max(...validValues)

    const nowMs = Date.now()
    const now = new Date(nowMs)
    const tpl = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${now.getFullYear()}-${tpl(now.getMonth()+1)}-${tpl(now.getDate())} ${tpl(now.getHours())}:${tpl(now.getMinutes())}:${tpl(now.getSeconds())}`

    const frame: FrameBatchItem = {
        startTime: timeStr,
        endTime: timeStr,
        startTimestamp: nowMs,
        endTimestamp: nowMs,
        speed: 0,
        width: 0,
        rotateSpeed: 0,
        sigmaVal: Math.round(sigmaVal * 100) / 100,
        sigmaPercent: Math.round(sigmaPercent * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        minVal,
        minPercent: mean > 0 ? Math.round((1 - minVal / mean) * 10000) / 100 : 0,
        maxVal,
        maxPercent: mean > 0 ? Math.round((maxVal / mean - 1) * 10000) / 100 : 0,
        IsBackw: false,
        source: 'adbox',
        airAD,
        gain,
        datalist,
        rawDatalist: rawAdValues,
    }

    // 通过 IPC 持久化 Frame 到 SQLite (主进程)
    window.ipcApi.invoke('db-persist-frame', frame).catch((err) => {
        console.warn('[ADBox→SQLite] 持久化 Frame 失败:', err)
    })

    // 本地 frameStore 更新 (用于实时显示)
    frameStore.updateFrameId = nowMs
    frameStore.meanValue = Math.round(mean * 100) / 100
}

const handleAdboxFrame = (_: unknown, payload: IPollingModBusData | PushData | PushData[]) => {
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