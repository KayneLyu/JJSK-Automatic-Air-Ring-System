<script setup lang="ts">
import { toRef } from 'vue'
import { useBubblePolarChart } from './useBubblePolarChart'
import type { BubbleSweepResult } from '@/types/ipc'

const props = defineProps<{
  selectedSweep: BubbleSweepResult | null
  errorMessage: string | null
}>()

useBubblePolarChart(toRef(props, 'selectedSweep'))
</script>

<template>
  <div class="chart-pane">
    <div ref="chartRef" class="chart-container"></div>
    <div v-if="errorMessage" class="empty-overlay">{{ errorMessage }}</div>
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

.empty-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 14px;
  pointer-events: none;
}
</style>
