<script setup lang="ts">
import type { IState, StateOption } from './rack.constants'

defineProps<{
  runningState: IState
  targetPulse: number
  stateOptions: StateOption[]
}>()

const emit = defineEmits<{
  (e: 'update:runningState', value: IState): void
  (e: 'update:targetPulse', value: number): void
  (e: 'move'): void
}>()

function onSegmentedChange(value: IState) {
  emit('update:runningState', value)
}

function onPulseInput(value: number) {
  emit('update:targetPulse', value)
}
</script>

<template>
  <div class="action-bar">
    <div class="controls_container">
      <el-segmented
        :model-value="runningState"
        :options="stateOptions"
        block
        size="large"
        style="height: 45px"
        @change="onSegmentedChange"
      >
        <template #default="{ item }">
          <div>
            <div>{{ (item as StateOption).label }}</div>
          </div>
        </template>
      </el-segmented>
    </div>
    <el-input
      :model-value="targetPulse"
      class="pulse-input"
      placeholder="目标脉冲"
      @update:model-value="onPulseInput"
    />
    <el-button type="success" @click="emit('move')">到达(脉冲)</el-button>
  </div>
</template>

<style scoped lang="less">
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0;
}

.controls_container {
  width: 400px;
  border: 1px solid #c1c1c1;
  border-radius: 5px;
  margin-right: 50px;
}

.pulse-input {
  width: 150px;
}
</style>
