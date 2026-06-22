<script setup lang="ts">
import {
  DEFAULT_NUM_BINS,
  DEFAULT_MEMBRANE_WIDTH_MM,
  type DataMode,
  type ViewMode,
} from './bubbleRawThickness.constants'

interface CalibrationResults {
  frameLengthMM?: number
  frameLengthPulse?: number
  upperMaxAngle?: number
}

const props = defineProps<{
  dataMode: DataMode
  sweepsCount: number
  mergedCount: number
  calResults: CalibrationResults
  thicknessCfg: { airAD: string; materialGain: string }
  lastUpdatedAt: number | null
  selectedMeanCoverage: number
  selectedMinCoverage: number
  hasSelectedSweep: boolean
  autoRefresh: boolean
  viewMode: ViewMode
}>()

const emit = defineEmits<{
  (e: 'update:autoRefresh', value: boolean): void
  (e: 'update:viewMode', value: ViewMode): void
}>()

function mmPerPulseLabel(): string {
  const { frameLengthMM, frameLengthPulse } = props.calResults
  if (frameLengthMM && frameLengthPulse) {
    return (frameLengthMM / frameLengthPulse).toFixed(4)
  }
  return '0.1000'
}

function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString()
}
</script>

<template>
  <div class="status-bar">
    <span :class="['mode-badge', dataMode]">
      {{ dataMode === 'live' ? '实时' : '历史' }}
    </span>
    <span class="status-text">
      算法：<code>reconstructBubbleThickness</code> · 分箱 {{ DEFAULT_NUM_BINS }} ·
      膜宽 {{ DEFAULT_MEMBRANE_WIDTH_MM }} mm · 已加载 {{ sweepsCount }} 趟
    </span>
    <span class="param-text">
      θ<sub>max</sub> = {{ calResults.upperMaxAngle ?? '未标定' }}° ·
      mm/脉冲 = {{ mmPerPulseLabel() }}
    </span>
    <span class="param-text">
      空气 AD: {{ thicknessCfg.airAD }} · 补偿: {{ thicknessCfg.materialGain }}
    </span>
    <span class="param-text" v-if="lastUpdatedAt">
      上次更新: {{ formatClock(lastUpdatedAt) }}
    </span>
    <span class="param-text" v-if="hasSelectedSweep" style="color: #67c23a">
      当前：覆盖均 {{ selectedMeanCoverage.toFixed(1) }} / 最小
      {{ selectedMinCoverage.toFixed(1) }}
    </span>
    <div class="actions">
      <div class="view-toggle">
        <button
          :class="['toggle-btn', { active: viewMode === 'single' }]"
          @click="emit('update:viewMode', 'single')"
        >
          单趟
        </button>
        <button
          :class="['toggle-btn', { active: viewMode === 'merged' }]"
          @click="emit('update:viewMode', 'merged')"
          :disabled="mergedCount === 0"
          :title="mergedCount === 0 ? '无可用合并对' : `共 ${mergedCount} 对`"
        >
          合并 ({{ mergedCount }})
        </button>
      </div>
      <label class="toggle" v-if="dataMode === 'live'">
        <input
          :checked="autoRefresh"
          type="checkbox"
          @change="(e) => emit('update:autoRefresh', (e.target as HTMLInputElement).checked)"
        />
        自动刷新
      </label>
    </div>
  </div>
</template>

<style scoped lang="less">
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.mode-badge.live {
  background: #67c23a;
}

.mode-badge.historical {
  background: #e6a23c;
}

.status-text {
  color: #606266;
  font-weight: 500;
}

.status-text code {
  background: #f0f9eb;
  color: #67c23a;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.param-text {
  color: #909399;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}

.view-toggle {
  display: inline-flex;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}

.toggle-btn {
  padding: 3px 12px;
  border: none;
  background: #fff;
  color: #606266;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.toggle-btn.active {
  background: #409eff;
  color: #fff;
}

.toggle-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #606266;
  cursor: pointer;
}

.action-btn {
  padding: 2px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #606266;
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  border-color: #67c23a;
  color: #67c23a;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
