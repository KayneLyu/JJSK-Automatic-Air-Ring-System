<script setup lang="ts">
import { computed } from 'vue'
import { useScannerTripReconstruction } from './useScannerTripReconstruction'
import BubbleStatusBar from './BubbleStatusBar.vue'
import BubbleNavBar from './BubbleNavBar.vue'
import BubblePolarChart from './BubblePolarChart.vue'
import type { BubbleSweepResult } from '@/types/ipc'

const {
  selectedBaseline,
  currentReconstruction,
  canGoPrev,
  canGoNext,
  dataMode,
  autoRefresh,
  lastUpdatedAt,
  errorMessage,
  isReconstructing,
  calResults,
  thicknessCfg,
  prevTrip,
  nextTrip,
} = useScannerTripReconstruction()

/**
 * 把重构结果打包成 BubbleSweepResult 形状,
 * 喂给 BubbleNavBar / BubbleStatusBar / BubblePolarChart(它们接口不变)
 */
const syntheticSweep = computed<BubbleSweepResult | null>(() => {
  const r = currentReconstruction.value
  const b = selectedBaseline.value
  if (!r || !b) return null
  return {
    ...r.result,
    id: b.sweepId,
    time: b.startTs,
    direction: b.direction === 'forward' ? 'forward' : 'reverse',
    cycleDurationMs: b.endTs - b.startTs,
    inProgress: false,
  }
})

const selectedMeanCoverage = computed(() => {
  const s = syntheticSweep.value
  if (!s || s.binCoverage.length === 0) return 0
  return s.binCoverage.reduce((a, b) => a + b, 0) / s.binCoverage.length
})

const selectedMinCoverage = computed(() => {
  const s = syntheticSweep.value
  if (!s) return 0
  return Math.min(...s.binCoverage)
})

function onAutoRefreshChange(v: boolean) {
  autoRefresh.value = v
}
</script>

<template>
  <div class="bubble-raw-thickness">
    <BubbleStatusBar
      :data-mode="dataMode"
      :cal-results="calResults"
      :thickness-cfg="thicknessCfg"
      :last-updated-at="lastUpdatedAt"
      :selected-mean-coverage="selectedMeanCoverage"
      :selected-min-coverage="selectedMinCoverage"
      :has-selected-sweep="syntheticSweep !== null"
      :auto-refresh="autoRefresh"
      @update:auto-refresh="onAutoRefreshChange"
    />

    <BubbleNavBar
      :selected-sweep="syntheticSweep"
      :can-go-prev="canGoPrev"
      :can-go-next="canGoNext"
      @prev="prevTrip"
      @next="nextTrip"
    />

    <BubblePolarChart
      :selected-sweep="syntheticSweep"
      :error-message="errorMessage"
    />

    <div v-if="isReconstructing" class="reconstructing-hint">
      正在重构 B(φ)…
    </div>
  </div>
</template>

<style scoped lang="less">
.bubble-raw-thickness {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
  position: relative;
}
.reconstructing-hint {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(64, 158, 255, 0.85);
  border-radius: 10px;
  z-index: 5;
}
</style>
