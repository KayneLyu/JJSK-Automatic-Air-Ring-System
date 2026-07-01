<script setup lang="ts">
import { computed } from 'vue'
import { useScannerTripReconstruction } from './useScannerTripReconstruction'
import BubbleStatusBar from './BubbleStatusBar.vue'
import BubbleNavBar from './BubbleNavBar.vue'
import BubblePolarChart from './BubblePolarChart.vue'
import type { ExtendedBubbleSweepResult } from './useBubblePolarChart'

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
  scannerTrips,
  upperSweeps,
  prevTrip,
  nextTrip,
} = useScannerTripReconstruction()

/**
 * 把重构结果打包成 BubbleSweepResult 形状,
 * 喂给 BubbleNavBar / BubbleStatusBar / BubblePolarChart(它们接口不变)
 */
let cachedSyntheticSweep: ExtendedBubbleSweepResult | null = null
let cachedResultRef: object | null = null
let cachedBaselineKey = ''

const syntheticSweep = computed<ExtendedBubbleSweepResult | null>(() => {
  const r = currentReconstruction.value
  const b = selectedBaseline.value
  if (!r || !b) {
    cachedSyntheticSweep = null
    cachedResultRef = null
    cachedBaselineKey = ''
    return null
  }

  const baselineKey = `${b.sweepId}:${b.startTs}:${b.endTs}:${b.direction}`
  const resultRef = r.result as object
  if (
    cachedSyntheticSweep &&
    cachedResultRef === resultRef &&
    cachedBaselineKey === baselineKey
  ) {
    return cachedSyntheticSweep
  }

  cachedBaselineKey = baselineKey
  cachedResultRef = resultRef
  cachedSyntheticSweep = {
    ...r.result,
    id: b.sweepId,
    time: b.startTs,
    direction: b.direction === 'forward' ? 'forward' : 'reverse',
    cycleDurationMs: b.endTs - b.startTs,
    inProgress: false,
  }
  return cachedSyntheticSweep
})

/**
 * 诊断: 为什么极坐标图显示空状态
 * 返回 null 表示正常(有数据), 否则返回原因描述
 */
const chartDiagnostic = computed<string | null>(() => {
  if (errorMessage.value) return errorMessage.value
  if (syntheticSweep.value) return null // 有数据,正常
  if (isReconstructing.value) return '正在重构 B(φ)…'
  if (scannerTrips.value.length === 0) {
    if (calResults.value && Object.keys(calResults.value).length === 0)
      return '缺少标定参数 (airAD / membraneWidth / upperMaxAngle)，无法加载扫描趟'
    return '无测厚仪扫描趟数据 — 请确认 ADBox 已连接且正在采集'
  }
  if (upperSweeps.value.length === 0)
    return '无上旋趟数据 — 请确认上旋参数 (upperDistance / rollerTractionSpeed) 已标定'
  if (!selectedBaseline.value)
    return '无法选择基线扫描趟'
  if (!currentReconstruction.value)
    return '重构尚未完成，请稍候…'
  return null
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
      :error-message="chartDiagnostic"
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
