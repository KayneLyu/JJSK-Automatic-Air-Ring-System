<script setup lang="ts">
import { ref, watch } from 'vue'
import type {
  AirRingConfig,
  RollerConfig,
  RollerResult,
  SystemConfig,
  ThicknessConfig,
  ThicknessResult,
  UpperConfig,
  UpperResult,
} from './useRackDeviceConfig'
import type { IUpperRotationDebugData } from '@/types/ipc'

const props = defineProps<{
  rollerConfig: RollerConfig
  rollerResult: RollerResult
  thicknessConfig: ThicknessConfig
  thicknessResult: ThicknessResult
  upperConfig: UpperConfig
  upperResult: UpperResult
  airRingConfig: AirRingConfig
  systemConfig: SystemConfig
  upperRotationDebug: IUpperRotationDebugData
  isHardwareConnected: boolean
  isCalRoller: boolean
  isCalAngle: boolean
  isCalDistance: boolean
  isCalMembraneWidth: boolean
  onConstantBlur: () => void
  onResultBlur: () => void
  onCalibrateRoller: () => void
  onCalibrateUpperAngle: () => void
  onCalibrateDistance: () => void
  onCalibrateMembraneWidth: () => void
  formatUpperRotationBoolean: (v: boolean | undefined) => string
  formatUpperRotationMotorFrequency: (v: number | undefined) => string
}>()

// mm/脉冲 用本地字符串缓存：el-input v-model.number 在输入 0.1 / 0.0001 这类小数时光标会丢字符
const mmPerPulseInput = ref<string>(
  props.thicknessResult.mmPerPulse !== undefined
    ? String(props.thicknessResult.mmPerPulse)
    : ''
)
watch(
  () => props.thicknessResult.mmPerPulse,
  (v) => {
    const next = v !== undefined ? String(v) : ''
    if (mmPerPulseInput.value !== next) mmPerPulseInput.value = next
  }
)

function onMmPerPulseBlur() {
  const trimmed = mmPerPulseInput.value.trim()
  if (trimmed === '') {
    props.thicknessResult.mmPerPulse = undefined
  } else {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      props.thicknessResult.mmPerPulse = parsed
      mmPerPulseInput.value = String(parsed)
    } else {
      mmPerPulseInput.value =
        props.thicknessResult.mmPerPulse !== undefined
          ? String(props.thicknessResult.mmPerPulse)
          : ''
    }
  }
  props.onResultBlur()
}

// 膜宽 同样用本地字符串缓存：避免 v-model.number 在大数值 + 输入中段时的丢字符问题
const membraneWidthMmInput = ref<string>(
  props.thicknessResult.membraneWidthMm !== undefined
    ? String(props.thicknessResult.membraneWidthMm)
    : ''
)
watch(
  () => props.thicknessResult.membraneWidthMm,
  (v) => {
    const next = v !== undefined ? String(v) : ''
    if (membraneWidthMmInput.value !== next) membraneWidthMmInput.value = next
  }
)

function onMembraneWidthMmBlur() {
  const trimmed = membraneWidthMmInput.value.trim()
  if (trimmed === '') {
    props.thicknessResult.membraneWidthMm = undefined
  } else {
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      props.thicknessResult.membraneWidthMm = parsed
      membraneWidthMmInput.value = String(parsed)
    } else {
      membraneWidthMmInput.value =
        props.thicknessResult.membraneWidthMm !== undefined
          ? String(props.thicknessResult.membraneWidthMm)
          : ''
    }
  }
  props.onResultBlur()
}
</script>

<template>
  <div class="device-single-row">
    <el-card shadow="hover" class="device-card device-card-wide">
      <template #header>
        <div class="device-card-header">
          <span>上旋</span>
          <span
            class="device-status"
            :class="{ connected: isHardwareConnected }"
          >
            <span class="status-dot"></span>
            信号
          </span>
        </div>
      </template>
      <div class="device-card-body">
        <div class="upper-debug-grid">
          <div class="debug-item">
            <span class="debug-label">正转</span>
            <span class="debug-value">{{
              formatUpperRotationBoolean(upperRotationDebug.ForwardRotation)
            }}</span>
          </div>
          <div class="debug-item">
            <span class="debug-label">反转</span>
            <span class="debug-value">{{
              formatUpperRotationBoolean(upperRotationDebug.ReverseRotation)
            }}</span>
          </div>
          <div class="debug-item">
            <span class="debug-label">正换向</span>
            <span class="debug-value">{{
              formatUpperRotationBoolean(
                upperRotationDebug.ForwardDirectionChange
              )
            }}</span>
          </div>
          <div class="debug-item">
            <span class="debug-label">反换向</span>
            <span class="debug-value">{{
              formatUpperRotationBoolean(
                upperRotationDebug.ReverseDirectionChange
              )
            }}</span>
          </div>
          <div class="debug-item">
            <span class="debug-label">复位</span>
            <span class="debug-value">{{
              formatUpperRotationBoolean(upperRotationDebug.Reset)
            }}</span>
          </div>
          <div class="debug-item">
            <span class="debug-label">电机频率</span>
            <span class="debug-value">{{
              formatUpperRotationMotorFrequency(
                upperRotationDebug.MotorFrequency
              )
            }}</span>
          </div>
        </div>
        <div class="device-constants">
          <el-input
            v-model.number="upperResult.maxAngle"
            size="small"
            placeholder="最大角度"
            @blur="onResultBlur"
          >
            <template #prepend>最大角度</template>
            <template #append>°</template>
          </el-input>
        </div>
        <div class="device-actions">
          <el-button
            type="primary"
            size="small"
            :loading="isCalAngle"
            @click="onCalibrateUpperAngle"
            >标定</el-button
          >
        </div>
      </div>
    </el-card>
  </div>

  <div class="device-cards-row">
    <!-- 测厚仪 -->
    <el-card shadow="hover" class="device-card">
      <template #header>
        <div class="device-card-header">
          <span>测厚仪</span>
          <span
            class="device-status"
            :class="{ connected: isHardwareConnected }"
          >
            <span class="status-dot"></span>
            数据
          </span>
        </div>
      </template>
      <div class="device-card-body">
        <div class="device-constants">
          <el-input
            v-model="thicknessConfig.airAD"
            size="small"
            placeholder="空气 AD 值"
            @blur="onConstantBlur"
          >
            <template #prepend>空气 AD</template>
          </el-input>
          <el-input
            v-model="thicknessConfig.materialGain"
            size="small"
            placeholder="材料补偿倍率"
            @blur="onConstantBlur"
          >
            <template #prepend>补偿倍率</template>
          </el-input>
        </div>
        <div class="device-constants">
          <el-input
            v-model.number="thicknessResult.frameLengthPulse"
            size="small"
            placeholder="机架长度（脉冲量）"
            @blur="onResultBlur"
          >
            <template #prepend>机架长度（脉冲量）</template>
          </el-input>
          <el-input
            v-model="mmPerPulseInput"
            size="small"
            placeholder="mm/脉冲"
            @blur="onMmPerPulseBlur"
          >
            <template #prepend>机架·mm/脉冲</template>
          </el-input>
          <el-input
            v-model="membraneWidthMmInput"
            size="small"
            placeholder="膜宽"
            @blur="onMembraneWidthMmBlur"
          >
            <template #prepend>膜宽</template>
            <template #append>
              <el-button
                size="small"
                type="primary"
                link
                :loading="isCalMembraneWidth"
                @click="onCalibrateMembraneWidth"
              >
                标定
              </el-button>
            </template>
          </el-input>
        </div>
        <div class="device-result">
          <span class="result-label">机架长度（mm）</span>
          <span class="result-value">{{
            thicknessResult.frameLengthMM !== undefined
              ? String(thicknessResult.frameLengthMM)
              : '--'
          }}</span>
        </div>
      </div>
    </el-card>
    <!-- 收卷辊 -->
    <el-card shadow="hover" class="device-card">
      <template #header>
        <div class="device-card-header">
          <span>收卷辊</span>
          <span
            class="device-status"
            :class="{ connected: isHardwareConnected }"
          >
            <span class="status-dot"></span>
            辊速信号
          </span>
        </div>
      </template>
      <div class="device-card-body">
        <div class="roller-dim-row">
          <el-input
            v-model="rollerConfig.value"
            size="small"
            placeholder="数值"
            @blur="onConstantBlur"
          >
            <template #prepend>
              <el-select
                v-model="rollerConfig.mode"
                size="small"
                style="width: 88px"
                @blur="onConstantBlur"
              >
                <el-option label="周长" value="circumference" />
                <el-option label="直径" value="diameter" />
                <el-option label="半径" value="radius" />
              </el-select>
            </template>
            <template #append>mm</template>
          </el-input>
        </div>
        <el-input
          v-model="rollerConfig.numCycles"
          size="small"
          placeholder="圈数"
          @blur="onConstantBlur"
        >
          <template #prepend>标定圈数</template>
        </el-input>
        <el-input
          v-model.number="rollerResult.tractionSpeed"
          size="small"
          placeholder="牵引速度"
          @blur="onResultBlur"
        >
          <template #prepend>牵引速度</template>
          <template #append>mm/s</template>
        </el-input>
        <div class="device-actions">
          <el-button
            type="primary"
            size="small"
            :loading="isCalRoller"
            @click="onCalibrateRoller"
            >标定</el-button
          >
        </div>
      </div>
    </el-card>
    <!-- 风环 -->
    <el-card shadow="hover" class="device-card">
      <template #header>
        <div class="device-card-header">
          <span>风环</span>
          <span
            class="device-status"
            :class="{ connected: isHardwareConnected }"
          >
            <span class="status-dot"></span>
            状态
          </span>
        </div>
      </template>
      <div class="device-card-body">
        <div class="device-constants">
          <el-input
            v-model="airRingConfig.airDuctCount"
            size="small"
            placeholder="风道数量"
            @blur="onConstantBlur"
          >
            <template #prepend>风道数量</template>
          </el-input>
        </div>
      </div>
    </el-card>

    <!-- 系统 -->
    <el-card shadow="hover" class="device-card">
      <template #header>
        <div class="device-card-header">
          <span>系统</span>
          <span
            class="device-status"
            :class="{ connected: isHardwareConnected }"
          >
            <span class="status-dot"></span>
            状态
          </span>
        </div>
      </template>
      <div class="device-card-body">
        <div class="device-constants">
          <el-input
            v-model="systemConfig.airDuct1Angle"
            size="small"
            placeholder="1号风道角度"
            @blur="onConstantBlur"
          >
            <template #prepend>1号风道角度</template>
            <template #append>°</template>
          </el-input>
        </div>
        <div class="device-constants">
          <el-input
            v-model.number="upperResult.distance"
            size="small"
            placeholder="测量点距离"
            @blur="onResultBlur"
          >
            <template #prepend>测量点距离</template>
            <template #append>mm</template>
          </el-input>
        </div>
        <div class="device-constants">
          <el-input
            v-model.number="thicknessResult.mutationWindowSize"
            size="small"
            placeholder="突变窗口"
            @blur="onResultBlur"
          >
            <template #prepend>突变窗口</template>
          </el-input>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="less">
.device-single-row {
  margin-bottom: 16px;
}

.device-card-wide {
  width: 100%;
}

.device-cards-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.device-card {
  display: flex;
  flex-direction: column;

  :deep(.el-card__body) {
    padding: 14px 18px;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
}

.device-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 14px;
}

.device-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 400;
  color: #909399;
}

.device-status .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e0e0e0;
  display: inline-block;
}

.device-status.connected .status-dot {
  background: #67c23a;
}

.device-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;

  :deep(.el-input__wrapper),
  :deep(.el-select),
  :deep(.el-button),
  .device-result {
    height: 40px;
  }

  :deep(.el-input__wrapper) {
    border-radius: 4px;
  }

  :deep(.el-select) {
    align-items: center;
  }

  :deep(.el-select__wrapper) {
    height: 40px;
  }
}

.roller-dim-row {
  display: flex;
  gap: 4px;

  :deep(.el-select) {
    width: 80px;
    flex-shrink: 0;
  }

  :deep(.el-input) {
    flex: 1;
  }
}

.device-constants {
  display: flex;
  flex-direction: column;
  gap: 6px;

  :deep(.el-input) {
    width: 100%;
  }
}

.device-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.device-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  flex-wrap: wrap;
}

.device-result .result-label {
  color: #909399;
  font-size: 12px;
}

.device-result .result-value {
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.upper-debug-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.debug-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 4px;
  background: #fff;
}

.debug-label {
  color: #909399;
  font-size: 11px;
}

.debug-value {
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}
</style>
