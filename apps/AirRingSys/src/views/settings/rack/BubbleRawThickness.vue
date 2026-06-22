<script setup lang="ts">
import { computed } from 'vue'
import { useBubbleSweeps } from './useBubbleSweeps'
import BubbleStatusBar from './BubbleStatusBar.vue'
import BubbleNavBar from './BubbleNavBar.vue'
import BubblePolarChart from './BubblePolarChart.vue'
import type { ViewMode } from './bubbleRawThickness.constants'

const {
  sortedSweeps,
  mergedSweeps,
  selectedIndex,
  selectedMergedIndex,
  activeSweep,
  overlaySweeps,
  viewMode,
  canGoPrev,
  canGoNext,
  dataMode,
  autoRefresh,
  lastUpdatedAt,
  errorMessage,
  calResults,
  thicknessCfg,
  prevSweep,
  nextSweep,
} = useBubbleSweeps()

const selectedMinCoverage = computed(() => {
  const s = activeSweep.value
  if (!s) return 0
  return Math.min(...s.binCoverage)
})

const selectedMeanCoverage = computed(() => {
  const s = activeSweep.value
  if (!s || s.binCoverage.length === 0) return 0
  return s.binCoverage.reduce((a, b) => a + b, 0) / s.binCoverage.length
})

function onAutoRefreshChange(v: boolean) {
  autoRefresh.value = v
}

function onViewModeChange(v: ViewMode) {
  viewMode.value = v
}

const navIndex = computed(() =>
  viewMode.value === 'merged' ? selectedMergedIndex.value : selectedIndex.value
)
const navTotal = computed(() =>
  viewMode.value === 'merged' ? mergedSweeps.value.length : sortedSweeps.value.length
)
</script>

<template>
  <div class="bubble-raw-thickness">
    <BubbleStatusBar
      :data-mode="dataMode"
      :sweeps-count="sortedSweeps.length"
      :merged-count="mergedSweeps.length"
      :cal-results="calResults"
      :thickness-cfg="thicknessCfg"
      :last-updated-at="lastUpdatedAt"
      :selected-mean-coverage="selectedMeanCoverage"
      :selected-min-coverage="selectedMinCoverage"
      :has-selected-sweep="activeSweep !== null"
      :auto-refresh="autoRefresh"
      :view-mode="viewMode"
      @update:auto-refresh="onAutoRefreshChange"
      @update:view-mode="onViewModeChange"
    />

    <!-- 上一幅/下一幅：只历史模式显示，实时模式不显示
         （参考 LongitudinalCharts:317 `v-if="!isConnected"`） -->
    <BubbleNavBar
      v-if="dataMode === 'historical'"
      :selected-sweep="activeSweep"
      :can-go-prev="canGoPrev"
      :can-go-next="canGoNext"
      :selected-index="navIndex"
      :total-count="navTotal"
      @prev="prevSweep"
      @next="nextSweep"
    />

    <BubblePolarChart
      :selected-sweep="activeSweep"
      :overlay-sweeps="overlaySweeps"
      :error-message="errorMessage"
    />
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
</style>
