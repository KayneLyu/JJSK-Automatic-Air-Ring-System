<script setup lang="ts">
import {
  DEFAULT_NUM_BINS,
  DEFAULT_MEMBRANE_WIDTH_MM,
  type DataMode,
} from './bubbleRawThickness.constants'

import type { ICalibrationResults } from '@/types/ipc'

const props = defineProps<{
  dataMode: DataMode
  calResults: ICalibrationResults
  thicknessCfg: { airAD: string; materialGain: string }
  lastUpdatedAt: number | null
  selectedMeanCoverage: number
  selectedMinCoverage: number
  selectedProfileMinThickness: number | null
  selectedProfileMaxThickness: number | null
  thetaCoverageText: string
  deltaBandwidthText: string
  effectiveConstraintBinRatio: number
  transportDelayStatus?: string | null
  hasSelectedSweep: boolean
  autoRefresh: boolean
}>()

const emit = defineEmits<{
  (e: 'update:autoRefresh', value: boolean): void
}>()

function mmPerPulseLabel(): string {
  const { frameLengthMM, frameLengthPulse, mmPerPulse } = props.calResults
  if (mmPerPulse !== undefined && Number.isFinite(mmPerPulse)) {
    return mmPerPulse.toFixed(4)
  }
  if (frameLengthMM && frameLengthPulse) {
    return (frameLengthMM / frameLengthPulse).toFixed(4)
  }
  return '0.1000'
}

function formatClock(t: number): string {
  return new Date(t).toLocaleTimeString()
}

// 膜宽显示：寻边标定的膜宽 > 机架长度（mm）> 默认值（与 useBubbleSweeps.params 优先级保持一致）
function membraneWidthMmLabel(): string {
  const { membraneWidthMm, frameLengthMM } = props.calResults
  if (membraneWidthMm !== undefined && membraneWidthMm > 0) {
    return String(membraneWidthMm)
  }
  if (frameLengthMM && frameLengthMM > 0) {
    return String(frameLengthMM)
  }
  return String(DEFAULT_MEMBRANE_WIDTH_MM)
}
</script>

<template>
  <div class="status-bar">
    <span :class="['mode-badge', dataMode]">
      {{ dataMode === 'live' ? '实时' : '历史' }}
    </span>
    <span class="status-text">
      分箱 {{ DEFAULT_NUM_BINS }} · 膜宽 {{ membraneWidthMmLabel() }} mm
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
      当前：约束计数均 {{ selectedMeanCoverage.toFixed(1) }} / 最小
      {{ selectedMinCoverage.toFixed(1) }}
    </span>
    <span class="param-text" v-if="hasSelectedSweep" style="color: #409eff">
      单层膜厚：最小
      {{ selectedProfileMinThickness == null ? '--' : `${selectedProfileMinThickness.toFixed(1)}μm` }}
      / 最大
      {{ selectedProfileMaxThickness == null ? '--' : `${selectedProfileMaxThickness.toFixed(1)}μm` }}
      <template
        v-if="selectedProfileMinThickness != null && selectedProfileMaxThickness != null"
      >
        / 差
        {{ (selectedProfileMaxThickness - selectedProfileMinThickness).toFixed(1) }}μm
      </template>
    </span>
    <span class="param-text" v-if="hasSelectedSweep" style="color: #e6a23c">
      重建条件：θ覆盖 {{ thetaCoverageText }} · δ带宽 {{ deltaBandwidthText }} ·
      约束bin {{ (effectiveConstraintBinRatio * 100).toFixed(1) }}%
    </span>
    <span class="param-text" v-if="transportDelayStatus" style="color: #909399">
      {{ transportDelayStatus }}
    </span>
    <div class="actions">
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
