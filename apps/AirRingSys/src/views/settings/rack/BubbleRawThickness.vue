<script setup lang="ts">
import { computed } from 'vue'
import { useBubbleSweeps } from './useBubbleSweeps'
import BubbleStatusBar from './BubbleStatusBar.vue'
import BubbleNavBar from './BubbleNavBar.vue'
import BubblePolarChart from './BubblePolarChart.vue'

const {
  sortedSweeps,
  selectedIndex,
  selectedSweep,
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
  const s = selectedSweep.value
  if (!s) return 0
  return Math.min(...s.binCoverage)
})

const selectedMeanCoverage = computed(() => {
  const s = selectedSweep.value
  if (!s || s.binCoverage.length === 0) return 0
  return s.binCoverage.reduce((a, b) => a + b, 0) / s.binCoverage.length
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
      :has-selected-sweep="selectedSweep !== null"
      :auto-refresh="autoRefresh"
      @update:auto-refresh="onAutoRefreshChange"
    />

    <!-- 上一幅/下一幅：只历史模式显示，实时模式不显示
         （参考 LongitudinalCharts:317 `v-if="!isConnected"`） -->
    <BubbleNavBar
      v-if="dataMode === 'historical'"
      :selected-sweep="selectedSweep"
      :can-go-prev="canGoPrev"
      :can-go-next="canGoNext"
      @prev="prevSweep"
      @next="nextSweep"
    />

    <BubblePolarChart
      :selected-sweep="selectedSweep"
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
