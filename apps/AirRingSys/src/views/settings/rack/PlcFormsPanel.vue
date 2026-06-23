<script setup lang="ts">
import type {
  AlarmForm,
  HardwareForm,
  SampleForm,
  SpeedForm,
} from './useRackPlcParams'

defineProps<{
  hardwareForm: HardwareForm
  speedForm: SpeedForm
  sampleForm: SampleForm
  alarmForm: AlarmForm
  isApplying: boolean
}>()

const emit = defineEmits<{
  (e: 'apply'): void
}>()
</script>

<template>
  <el-row :gutter="20" class="form-row">
    <!-- 硬件 -->
    <el-col :span="6">
      <el-card shadow="hover" header="硬件">
        <el-form
          :model="hardwareForm"
          label-width="100px"
          label-position="top"
        >
          <el-form-item label="机架长度(脉冲)">
            <el-input v-model="hardwareForm.frameLength" suffix="mm/脉冲" />
          </el-form-item>
          <el-form-item label="收卷辊周长">
            <el-input
              v-model="hardwareForm.rollerCircumference"
              suffix="mm/脉冲"
            />
          </el-form-item>
          <el-form-item label="编码器1比例">
            <el-input v-model="hardwareForm.encoderRatio" suffix="mm/脉冲" />
          </el-form-item>
          <el-form-item label="电机脉冲">
            <el-input v-model="hardwareForm.motorPulse" />
          </el-form-item>
          <el-form-item label="编码脉冲">
            <el-input v-model="hardwareForm.codePulse" />
          </el-form-item>
          <el-form-item label="零位偏移">
            <el-input v-model="hardwareForm.zeroOffset" suffix="脉冲" />
          </el-form-item>
        </el-form>
      </el-card>
    </el-col>

    <!-- 速度 -->
    <el-col :span="6">
      <el-card shadow="hover" header="速度">
        <el-form
          :model="speedForm"
          label-width="100px"
          label-position="top"
        >
          <el-form-item label="扫描速度">
            <el-input
              v-model="speedForm.scanSpeed"
              suffix="脉冲/s | 6.3m/min"
            />
          </el-form-item>
          <el-form-item label="采样速度">
            <el-input
              v-model="speedForm.sampleSpeed"
              suffix="脉冲/s | 4.2m/min"
            />
          </el-form-item>
          <el-form-item label="调试速度">
            <el-input
              v-model="speedForm.debugSpeed"
              suffix="脉冲/s | 4.2m/min"
            />
          </el-form-item>
          <el-form-item label="开始速度">
            <el-input
              v-model="speedForm.startSpeed"
              suffix="脉冲/s | 0.6m/min"
            />
          </el-form-item>
          <el-form-item label="归零速度1">
            <el-input
              v-model="speedForm.resetSpeed1"
              suffix="脉冲/s | 4.2m/min"
            />
          </el-form-item>
          <el-form-item label="归零速度2">
            <el-input
              v-model="speedForm.resetSpeed2"
              suffix="脉冲/s | 1.3m/min"
            />
          </el-form-item>
          <el-row :gutter="10">
            <el-col :span="12">
              <el-form-item label="加速时间">
                <el-input v-model="speedForm.accelTime" suffix="ms" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="减速时间">
                <el-input v-model="speedForm.decelTime" suffix="ms" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-card>
    </el-col>

    <!-- 采样 -->
    <el-col :span="6">
      <el-card shadow="hover" header="采样">
        <el-form
          :model="sampleForm"
          label-width="100px"
          label-position="top"
        >
          <el-form-item label="采样间隔">
            <el-input v-model="sampleForm.sampleInterval" suffix="min" />
          </el-form-item>
          <el-form-item label="采样位置">
            <el-input
              v-model="sampleForm.samplePosition"
              suffix="脉冲 | 28mm"
            />
          </el-form-item>
          <el-form-item label="采样半径">
            <el-input
              v-model="sampleForm.sampleRadius"
              suffix="脉冲 | 14mm"
            />
          </el-form-item>
        </el-form>
      </el-card>
    </el-col>

    <!-- 厚度报警 -->
    <el-col :span="6">
      <div class="alarm-form">
        <el-card shadow="hover" header="厚度报警">
          <el-form
            :model="alarmForm"
            label-width="100px"
            label-position="top"
          >
            <el-form-item>
              <el-checkbox v-model="alarmForm.alarmActive">报警激活</el-checkbox>
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="alarmForm.autoTarget">自动目标值</el-checkbox>
            </el-form-item>
            <el-form-item label="公差报警(分区)">
              <el-input v-model="alarmForm.toleranceZone" />
            </el-form-item>
            <div class="alarm-tip">
              连续N个分区超出公差范围触发报警!!
            </div>
          </el-form>
        </el-card>
        <div class="bottom-action">
          <el-button
            type="primary"
            size="large"
            :loading="isApplying"
            @click="emit('apply')"
            >应用</el-button
          >
        </div>
      </div>
    </el-col>
  </el-row>
</template>

<style scoped lang="less">
.form-row {
  margin-bottom: 16px;
}

.alarm-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.alarm-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 10px;
}

.bottom-action {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-right: 20px;
}
</style>
