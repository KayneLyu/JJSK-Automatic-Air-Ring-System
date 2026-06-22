<script setup lang="ts">
import {
  directionColor,
  directionLabel,
  formatTime,
  isInProgress,
  MERGED_COLOR,
  type ChartSweepData,
} from './bubbleRawThickness.constants'

const props = defineProps<{
  selectedSweep: ChartSweepData | null
  canGoPrev: boolean
  canGoNext: boolean
  selectedIndex: number
  totalCount: number
}>()

const emit = defineEmits<{
  (e: 'prev'): void
  (e: 'next'): void
}>()

function directionTagStyle(direction: ChartSweepData['direction']) {
  const color = directionColor(direction)
  if (direction === 'merged') {
    return {
      background: 'rgba(103, 194, 58, 0.15)',
      color: MERGED_COLOR,
      borderColor: MERGED_COLOR,
    }
  }
  return {
    background:
      direction === 'forward'
        ? 'rgba(64, 158, 255, 0.15)'
        : 'rgba(230, 162, 60, 0.15)',
    color,
    borderColor: color,
  }
}
</script>

<template>
  <div class="nav-bar">
    <button
      class="nav-btn"
      :disabled="!canGoPrev"
      @click="emit('prev')"
      title="上一幅（←）"
    >
      ← 上一幅
    </button>
    <div class="nav-info">
      <template v-if="selectedSweep">
        <span
          class="direction-tag"
          :style="directionTagStyle(selectedSweep.direction)"
        >
          {{ directionLabel(selectedSweep.direction) }}<template v-if="selectedSweep.direction !== 'merged'">向</template>
        </span>
        <span class="nav-time">{{ formatTime(selectedSweep.time) }}</span>
        <span class="nav-meta">
          {{ (selectedSweep.cycleDurationMs / 60_000).toFixed(1) }} min ·
          {{ selectedSweep.numMeasurements }} 点
        </span>
        <span
          v-if="isInProgress(selectedSweep, Date.now())"
          class="in-progress-badge"
          >进行中</span
        >
      </template>
      <template v-else>无选中扫描</template>
    </div>
    <span class="nav-counter" v-if="totalCount > 0">
      {{ selectedIndex + 1 }} / {{ totalCount }}
    </span>
    <button
      class="nav-btn"
      :disabled="!canGoNext"
      @click="emit('next')"
      title="下一幅（→）"
    >
      下一幅 →
    </button>
  </div>
</template>

<style scoped lang="less">
.nav-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  flex-shrink: 0;
}

.nav-btn {
  padding: 4px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.nav-btn:hover:not(:disabled) {
  border-color: #409eff;
  color: #409eff;
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 12px;
}

.direction-tag {
  display: inline-block;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid;
  border-radius: 10px;
}

.nav-time {
  font-weight: 600;
  color: #303133;
  font-family: monospace;
}

.nav-meta {
  color: #909399;
  font-size: 11px;
}

.nav-counter {
  color: #606266;
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
}

.in-progress-badge {
  display: inline-block;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  background: #e6a23c;
  border-radius: 8px;
  line-height: 16px;
}
</style>
