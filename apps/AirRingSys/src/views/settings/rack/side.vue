<script setup lang="ts">
import { ref, onUnmounted, computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { createThicknessCollector, normalizeThicknessRealtimePayload } from './utiles'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IPollingModBusData } from '@/types/ipc'

use([TitleComponent, TooltipComponent, GridComponent, LineChart, CanvasRenderer])

const collector = createThicknessCollector()

let dataList: [number, number][] = []
const previewPoints = ref<[number, number][]>([])
const fullDataPoints = ref<[number, number][]>([])

let pendingRaf: number | null = null

const flushChart = () => {
  pendingRaf = null
  previewPoints.value = collector.getPreviewData() as [number, number][]
  fullDataPoints.value = dataList
}

const chartOption = computed(() => ({
  title: { text: '寻边预览' },
  tooltip: { trigger: 'axis', axisPointer: { animation: false } },
  xAxis: { min: 0, max: 7000, type: 'value' as const, splitLine: { show: false } },
  yAxis: { type: 'value' as const, min: 4500, splitLine: { show: false } },
  series: [
    { name: '实时预览', type: 'line', showSymbol: false, data: previewPoints.value },
    { name: '完整扫描', type: 'line', showSymbol: false, lineStyle: { width: 3, color: 'pink' }, data: fullDataPoints.value },
  ],
}))

function handleRealtimeThickness(_: unknown, payload: IPollingModBusData | PushData | PushData[]) {
  const data = normalizeThicknessRealtimePayload(payload)
  if (!data) return
  const { pulses, adValues } = data
  const fullData = collector.process(pulses, adValues)
  if (fullData) {
    dataList = fullData.map(function(item) { return [item.pulse, item.ad] as [number, number] })
  }
  if (pendingRaf === null) {
    pendingRaf = requestAnimationFrame(flushChart)
  }
}

window.ipcApi.on('adbox-data', handleRealtimeThickness)

onUnmounted(() => {
  if (pendingRaf !== null) cancelAnimationFrame(pendingRaf)
  window.ipcApi.off('adbox-data', handleRealtimeThickness)
})
</script>

<template>
  <VChart style="width:99%;height:100%" :option="chartOption" autoresize />
</template>
