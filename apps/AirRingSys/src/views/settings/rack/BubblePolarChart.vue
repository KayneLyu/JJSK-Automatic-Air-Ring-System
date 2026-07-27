<script setup lang="ts">
import { toRef, computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import VChart from 'vue-echarts'
import { useBubblePolarChart, type ExtendedBubbleSweepResult } from './useBubblePolarChart'

const props = defineProps<{
  selectedSweep: ExtendedBubbleSweepResult | null
  errorMessage: string | null
  membraneWidthMm: number
}>()

const paneRef = ref<HTMLElement | null>(null)
const paneSize = useElementSize(paneRef)
const isPaneReady = computed(
  () => paneSize.width.value > 0 && paneSize.height.value > 0
)

const widthMmRef = computed(() => props.membraneWidthMm || 0)

const chart = useBubblePolarChart(
  toRef(props, 'selectedSweep'),
  widthMmRef,
)

const displayOption = computed(() => {
  if (props.errorMessage) {
    return {
      title: {
        text: props.errorMessage,
        left: 'center',
        top: 'middle',
        textStyle: { color: '#f56c6c', fontSize: 14, fontWeight: 'normal' },
      },
    }
  }
  return chart.chartOption.value
})
</script>

<template>
  <div ref="paneRef" class="chart-pane">
    <VChart v-if="isPaneReady" class="chart-container" :option="displayOption" autoresize />
  </div>
</template>

<style scoped lang="less">
.chart-pane {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.chart-container {
  width: 100%;
  height: 100%;
}
</style>
