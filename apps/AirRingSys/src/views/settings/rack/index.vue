<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRackStatus } from './useRackStatus'
import { useRackActions } from './useRackActions'
import { useRackDeviceConfig } from './useRackDeviceConfig'
import { useRackCalibration } from './useRackCalibration'
import { useRackPlcParams } from './useRackPlcParams'
import { useUpperRotationDebug } from './useUpperRotationDebug'
import RackStatusBar from './RackStatusBar.vue'
import RackActionBar from './RackActionBar.vue'
import DeviceCardsPanel from './DeviceCardsPanel.vue'
import PlcFormsPanel from './PlcFormsPanel.vue'
import SideCharts from './side.vue'
import LongitudinalCharts from './LongitudinalCharts.vue'
import BubbleRawThickness from './BubbleRawThickness.vue'

const status = useRackStatus()
const actions = useRackActions()
const deviceConfig = useRackDeviceConfig()
const debug = useUpperRotationDebug()
const calibration = useRackCalibration({
  deviceConfig,
  isHardwareConnected: debug.isHardwareConnected,
  productionSpeed: status.productionSpeed,
})
const plcParams = useRackPlcParams()

const activeTab = ref('param')

onMounted(() => {
  void calibration.loadCalibrationState()
  void deviceConfig.loadDeviceConstants()
  void deviceConfig.loadCalibrationResults()
  void debug.checkHardwareConnection()
})
</script>

<template>
  <el-card class="control-container">
    <div class="thickness-measure-container">
      <!-- 顶部状态栏 -->
      <RackStatusBar
        :current-a-d="status.currentAD.value"
        :measure-position="status.measurePosition.value"
        :production-speed="status.productionSpeed.value"
        :thickness="status.thickness.value"
        :bubble-change="status.bubbleChange.value"
      />

      <!-- 操作按钮区 -->
      <RackActionBar
        :running-state="actions.runningState.value"
        :target-pulse="actions.targetPulse.value"
        :state-options="actions.stateOptions"
        @update:running-state="actions.changeState"
        @update:target-pulse="(v) => (actions.targetPulse.value = v)"
        @move="actions.moveToPulsePosition"
      />

      <!-- 标签页 -->
      <el-tabs v-model="activeTab" class="tab-container">
        <el-tab-pane label="参数" name="param">
          <div class="tab-pane-body">
            <DeviceCardsPanel
              :roller-config="deviceConfig.rollerConfig.value"
              :roller-result="deviceConfig.rollerResult.value"
              :thickness-config="deviceConfig.thicknessConfig.value"
              :thickness-result="deviceConfig.thicknessResult.value"
              :upper-config="deviceConfig.upperConfig.value"
              :upper-result="deviceConfig.upperResult.value"
              :air-ring-config="deviceConfig.airRingConfig.value"
              :system-config="deviceConfig.systemConfig.value"
              :upper-rotation-debug="debug.upperRotationDebug.value"
              :is-hardware-connected="debug.isHardwareConnected.value"
              :is-cal-roller="calibration.isCalRoller.value"
              :is-cal-angle="calibration.isCalAngle.value"
              :is-cal-distance="calibration.isCalDistance.value"
              :is-cal-membrane-width="calibration.isCalMembraneWidth.value"
              :on-constant-blur="deviceConfig.onConstantBlur"
              :on-result-blur="deviceConfig.onResultBlur"
              :on-calibrate-roller="calibration.calibrateRollerSpeed"
              :on-calibrate-upper-angle="calibration.calibrateUpperAngle"
              :on-calibrate-distance="calibration.calibrateDistance"
              :on-calibrate-membrane-width="calibration.calibrateMembraneWidth"
              :format-upper-rotation-boolean="debug.formatUpperRotationBoolean"
              :format-upper-rotation-motor-frequency="
                debug.formatUpperRotationMotorFrequency
              "
            />
            <PlcFormsPanel
              :hardware-form="plcParams.hardwareForm.value"
              :speed-form="plcParams.speedForm.value"
              :sample-form="plcParams.sampleForm.value"
              :alarm-form="plcParams.alarmForm.value"
              :is-applying="plcParams.isApplying.value"
              @apply="plcParams.applyPlcParams"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="纵向" name="longitudinal" lazy>
          <div class="tab-pane-body">
            <LongitudinalCharts v-if="activeTab === 'longitudinal'" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="横向" name="lateral">
          <div class="tab-pane-body"></div>
        </el-tab-pane>

        <el-tab-pane label="寻边" name="edge">
          <div class="tab-pane-body">
            <div class="chart-container">
              <SideCharts />
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="膜泡原始厚度" name="bubble-raw-thickness" lazy>
          <div class="tab-pane-body">
            <div class="chart-container">
              <BubbleRawThickness v-if="activeTab === 'bubble-raw-thickness'" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-card>
</template>

<style scoped lang="less">
.control-container {
  width: 100%;
  height: 100%;
  min-height: 0;

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background-color: #f5f7fa;
  }
}

.thickness-measure-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.tab-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  :deep(.el-tabs__header) {
    flex-shrink: 0;
  }

  :deep(.el-tabs__content) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :deep(.el-tab-pane) {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.tab-pane-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding-right: 4px;
  padding-bottom: 28px;
}

.chart-container {
  height: 600px;
}
</style>
