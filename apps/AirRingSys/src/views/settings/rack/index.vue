<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type {
   ICalibrationBridgeState,
   ICalibrationControlResult,
   ICalibrationResult,
   IPlcParamData,
   IPlcParamResult,
   IUpperRotationDebugData
} from '@/types/ipc';
import DynamicCharts from "./dynamic.vue";
import SideCharts from './side.vue';
import { calcThickness } from "./utiles.ts";

type Option = {
   label: string;
   value: IState;
}

type IState = 'FWD' | 'REV' | 'STOP' | 'HOME' | 'MEASURE'
type PlcWritableValue = string | number | boolean
type RackParamKey = keyof IPlcParamData
type RackParamNormalizedValue = number | boolean

const REAL_COMPARE_EPSILON = 1e-6

// 顶部状态数据
const currentAD = ref(12345)
const measurePosition = ref(0)
const productionSpeed = ref('0.0m/min')
const thickness = ref('0')
const bubbleChange = ref('0mm')
const calibrationResult = ref<ICalibrationResult>({})
const upperRotationDebug = ref<IUpperRotationDebugData>({})
const manualTractionSpeed = ref('')
const isApplyingManualTractionSpeed = ref(false)
const isResettingCalibration = ref(false)

// 操作栏数据
const targetPulse = ref('1000')
const isApplying = ref(false)
const plcParamBaseline = ref<Partial<IPlcParamResult>>({})

// 标签页
const activeTab = ref('param')

// 表单数据

const hardwareForm = ref({
   frameLength: '13900',
   rollerCircumference: '314',
   encoderRatio: '0.14',
   motorPulse: '4',
   codePulse: '1',
   zeroOffset: '0',
   adDelay: '0'
})

const speedForm = ref({
   scanSpeed: '3000',
   sampleSpeed: '2000',
   debugSpeed: '2000',
   startSpeed: '300',
   resetSpeed1: '2000',
   resetSpeed2: '600',
   accelTime: '400',
   decelTime: '500'
})

const sampleForm = ref({
   sampleInterval: '10',
   samplePosition: '200',
   sampleRadius: '100'
})

const alarmForm = ref({
   alarmActive: false,
   autoTarget: true,
   toleranceZone: '10'
})

const addressItems: IPlcParamData = {
   // 硬件
   frameLength: 'DB4,DINT2', // 机架长度
   rollerCircumference: 'DB4,REAL6', // 测速棍周长
   encoderRatio: 'DB4,REAL10', // 编码器1比例
   motorPulse: 'DB4,DINT14', // 电机脉冲
   codePulse: 'DB4,DINT18', // 编码脉冲
   zeroOffset: 'DB4,DINT22', // 零位偏移
   // adDelay: 'DB4,X0.6'
   // 速度
   scanSpeed: 'DB4,REAL30', // 扫描速度
   sampleSpeed: 'DB4,REAL34', // 采样速度
   debugSpeed: 'DB4,REAL38', // 调试速度
   startSpeed: 'DB4,REAL42', // 开始速度
   resetSpeed1: 'DB4,REAL46', // 归零速度1
   resetSpeed2: 'DB4,REAL50', // 归零速度2
   accelTime: 'DB4,REAL54', // 加速时间
   decelTime: 'DB4,REAL58', // 减速时间
   // 采样
   sampleInterval: 'DB4,DINT62', // 采样间隔
   samplePosition: 'DB4,DINT66', // 采样位置
   sampleRadius: 'DB4,DINT70' // 采样半径
}

const toFormValue = (value: number | boolean | undefined, fallback: string) =>
   value === undefined ? fallback : String(value)

const setFormValuesFromPlc = (data: IPlcParamResult) => {
   hardwareForm.value = {
      ...hardwareForm.value,
      frameLength: toFormValue(data.frameLength, hardwareForm.value.frameLength),
      rollerCircumference: toFormValue(data.rollerCircumference, hardwareForm.value.rollerCircumference),
      encoderRatio: toFormValue(data.encoderRatio, hardwareForm.value.encoderRatio),
      motorPulse: toFormValue(data.motorPulse, hardwareForm.value.motorPulse),
      codePulse: toFormValue(data.codePulse, hardwareForm.value.codePulse),
      zeroOffset: toFormValue(data.zeroOffset, hardwareForm.value.zeroOffset)
   }

   speedForm.value = {
      ...speedForm.value,
      scanSpeed: toFormValue(data.scanSpeed, speedForm.value.scanSpeed),
      sampleSpeed: toFormValue(data.sampleSpeed, speedForm.value.sampleSpeed),
      debugSpeed: toFormValue(data.debugSpeed, speedForm.value.debugSpeed),
      startSpeed: toFormValue(data.startSpeed, speedForm.value.startSpeed),
      resetSpeed1: toFormValue(data.resetSpeed1, speedForm.value.resetSpeed1),
      resetSpeed2: toFormValue(data.resetSpeed2, speedForm.value.resetSpeed2),
      accelTime: toFormValue(data.accelTime, speedForm.value.accelTime),
      decelTime: toFormValue(data.decelTime, speedForm.value.decelTime)
   }

   sampleForm.value = {
      ...sampleForm.value,
      sampleInterval: toFormValue(data.sampleInterval, sampleForm.value.sampleInterval),
      samplePosition: toFormValue(data.samplePosition, sampleForm.value.samplePosition),
      sampleRadius: toFormValue(data.sampleRadius, sampleForm.value.sampleRadius)
   }
}

const normalizeBooleanValue = (value: PlcWritableValue) => {
   if (typeof value === 'boolean') {
      return value
   }

   if (typeof value === 'number') {
      return value !== 0
   }

   const normalizedValue = value.trim().toLowerCase()

   if (['true', '1', 'on', 'yes'].includes(normalizedValue)) {
      return true
   }

   if (['false', '0', 'off', 'no'].includes(normalizedValue)) {
      return false
   }

   throw new Error('布尔类型PLC写入值无效')
}

const normalizePlcValue = (address: string, value: PlcWritableValue) => {
   const valueType = address.split(',')[1] ?? ''

   if (valueType.startsWith('X')) {
      return normalizeBooleanValue(value)
   }

   if (typeof value === 'string' && value.trim() === '') {
      throw new Error(`地址 ${address} 的写入值不能为空`)
   }

   const numericValue = typeof value === 'number' ? value : Number(value)

   if (!Number.isFinite(numericValue)) {
      throw new Error(`地址 ${address} 的写入值不是有效数字`)
   }

   if (valueType.startsWith('DINT')) {
      return Math.trunc(numericValue)
   }

   return numericValue
}

const isPlcParamBaselineReady = () =>
   Object.keys(plcParamBaseline.value).length === Object.keys(addressItems).length

const isSamePlcValue = (
   address: string,
   currentValue: RackParamNormalizedValue,
   baselineValue: number | boolean | undefined
) => {
   if (baselineValue === undefined) {
      return false
   }

   const valueType = address.split(',')[1] ?? ''

   if (valueType.startsWith('REAL')) {
      return Math.abs(Number(currentValue) - Number(baselineValue)) <= REAL_COMPARE_EPSILON
   }

   return currentValue === baselineValue
}

const writePlcValue = async (address: string, value: PlcWritableValue) => {
   const result = await window.ipcApi.invoke('plc-writeValue', {
      address,
      value: normalizePlcValue(address, value)
   })

   if (!result.success) {
      throw new Error(result.error ?? `地址 ${address} 写入失败`)
   }

   return result
}

const getRackParamValues = (): Record<RackParamKey, string> => ({
   ...hardwareForm.value,
   ...speedForm.value,
   ...sampleForm.value
}) as Record<RackParamKey, string>

const getChangedRackParams = () => {
   const rackParamValues = getRackParamValues()
   const changedEntries: Array<{
      key: RackParamKey
      address: string
      value: RackParamNormalizedValue
   }> = []

   for (const [key, address] of Object.entries(addressItems) as [RackParamKey, string][]) {
      const normalizedValue = normalizePlcValue(address, rackParamValues[key]) as RackParamNormalizedValue
      const baselineValue = plcParamBaseline.value[key]

      if (!isSamePlcValue(address, normalizedValue, baselineValue)) {
         changedEntries.push({
            key,
            address,
            value: normalizedValue
         })
      }
   }

   return changedEntries
}

const applyPlcParams = async () => {
   if (isApplying.value) {
      return
   }

   isApplying.value = true

   try {
      if (!isPlcParamBaselineReady()) {
         ElMessage.error('PLC 参数尚未完成初始化，请稍后重试')
         return
      }

      const changedParams = getChangedRackParams()

      if (changedParams.length === 0) {
         ElMessage.success('未检测到参数变化')
         return
      }

      const failedKeys: RackParamKey[] = []
      let successCount = 0

      for (const item of changedParams) {
         try {
            await writePlcValue(item.address, item.value)
            plcParamBaseline.value[item.key] = item.value
            successCount += 1
         } catch (error) {
            console.error(`PLC 参数 ${item.key} 写入失败:`, error)
            failedKeys.push(item.key)
         }
      }

      if (failedKeys.length === 0) {
         ElMessage.success(`PLC 参数已写入 ${successCount} 项`)
         return
      }

      if (successCount > 0) {
         ElMessage.warning(`已写入 ${successCount} 项，失败 ${failedKeys.length} 项：${failedKeys.join('、')}`)
         return
      }

      ElMessage.error(`PLC 参数写入失败：${failedKeys.join('、')}`)
   } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : 'PLC 参数写入失败')
   } finally {
      isApplying.value = false
   }
}

const loadPlcParams = async () => {
   try {
      // const data = await window.ipcApi.invoke('plc-paramData', addressItems)
      // setFormValuesFromPlc(data)
      // plcParamBaseline.value = { ...data }
   } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : 'PLC 参数读取失败')
   }
}

const formatProductionSpeedValue = (value: number | undefined) => {
   if (value === undefined || value === null || Number.isNaN(value)) {
      productionSpeed.value = '0.0mm/s'
      return
   }

   productionSpeed.value = `${value.toFixed(2)}mm/s`
}

const loadCalibrationState = async () => {
   try {
      const state = await window.ipcApi.invoke('calibration-get-state') as ICalibrationBridgeState

      manualTractionSpeed.value =
         state.manualTractionSpeed === undefined
            ? ''
            : String(state.manualTractionSpeed)

      calibrationResult.value = state.result ?? {}

      if (state.manualTractionSpeed !== undefined) {
         formatProductionSpeedValue(state.manualTractionSpeed)
      } else if (state.result?.tractionSpeed !== undefined) {
         formatProductionSpeedValue(state.result.tractionSpeed)
      }
   } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '标定状态读取失败')
   }
}

const applyManualTractionSpeed = async () => {
   if (isApplyingManualTractionSpeed.value) {
      return
   }

   const speed = Number(manualTractionSpeed.value)

   if (!Number.isFinite(speed) || speed <= 0) {
      ElMessage.error('请输入大于 0 的有效牵引速度')
      return
   }

   isApplyingManualTractionSpeed.value = true

   try {
      const result = await window.ipcApi.invoke(
         'calibration-set-manual-traction-speed',
         {
            manualTractionSpeed: speed
         }
      ) as ICalibrationControlResult

      if (!result.success) {
         ElMessage.error(result.error ?? '手动牵引速度设置失败')
         return
      }

      manualTractionSpeed.value = String(result.manualTractionSpeed ?? speed)
      calibrationResult.value = {
         tractionSpeed: result.manualTractionSpeed ?? speed
      }
      formatProductionSpeedValue(result.manualTractionSpeed ?? speed)
      ElMessage.success('牵引速度已设置，标定已按新速度重新开始')
   } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '手动牵引速度设置失败')
   } finally {
      isApplyingManualTractionSpeed.value = false
   }
}

const resetCalibration = async () => {
   if (isResettingCalibration.value) {
      return
   }

   isResettingCalibration.value = true

   try {
      const result = await window.ipcApi.invoke('calibration-reset') as ICalibrationControlResult

      if (!result.success) {
         ElMessage.error(result.error ?? '本次标定重置失败')
         return
      }

      calibrationResult.value = result.manualTractionSpeed === undefined
         ? {}
         : { tractionSpeed: result.manualTractionSpeed }

      if (result.manualTractionSpeed !== undefined) {
         formatProductionSpeedValue(result.manualTractionSpeed)
      }

      ElMessage.success('本次标定已重新开始')
   } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '本次标定重置失败')
   } finally {
      isResettingCalibration.value = false
   }
}

const formatCalibrationValue = (
   value: number | undefined,
   digits: number = 2,
   unit: string = ''
) => {
   if (value === undefined || value === null || Number.isNaN(value)) {
      return '--'
   }

   return `${value.toFixed(digits)}${unit}`
}

const getCalibrationDisplayValue = (key: keyof ICalibrationResult) => {
   const value = calibrationResult.value[key]

   if (key === 'mutationWindowSize') {
      return value === undefined ? '--' : String(Math.round(value))
   }

   if (key === 'tractionSpeed') {
      return formatCalibrationValue(value, 2, ' mm/s')
   }

   if (key === 'distance') {
      return formatCalibrationValue(value, 2, ' mm')
   }

   if (key === 'maxAngle') {
      return formatCalibrationValue(value, 1, '°')
   }

   return formatCalibrationValue(value)
}

const handleCalibrationResult = (_: unknown, data: ICalibrationResult) => {
   calibrationResult.value = data

   if (data.tractionSpeed !== undefined) {
      formatProductionSpeedValue(data.tractionSpeed)
   }
}

const formatUpperRotationBoolean = (value: boolean | undefined) => {
   if (value === undefined) {
      return '--'
   }

   return value ? 'ON' : 'OFF'
}

const formatUpperRotationMotorFrequency = (value: number | undefined) => {
   if (value === undefined || Number.isNaN(value)) {
      return '--'
   }

   return `${value.toFixed(2)} Hz`
}

const formatUpperRotationHeats = (value: number[] | undefined) => {
   if (!value || value.length === 0) {
      return '--'
   }

   return value.join(', ')
}

const handleUpperRotationData = (_: unknown, data: IUpperRotationDebugData) => {
   upperRotationDebug.value = {
      ...upperRotationDebug.value,
      ...data
   }
}

// onMounted(() => {
//    void loadPlcParams()
//    void loadCalibrationState()
//    window.ipcApi.on('calibration-result', handleCalibrationResult)
//    window.ipcApi.on('upperRotation-read', handleUpperRotationData)
// })

// onUnmounted(() => {
//    window.ipcApi.off('calibration-result', handleCalibrationResult)
//    window.ipcApi.off('upperRotation-read', handleUpperRotationData)
// })

// 运行状态
const runningState = ref<IState>('STOP')

const options: Option[] = [
   {
      label: "正行",
      value: 'FWD',
   },
   {
      label: "反行",
      value: "REV"
   },
   {
      label: "停止",
      value: "STOP"
   },
   {
      label: "归边",
      value: "HOME"
   },
   {
      label: "扫描",
      value: "MEASURE"
   },
]

// 运行状态切换
const inputChangeState = async (options: IState) => {
   switch (options) {
      case 'FWD':
         await window.ipcApi.invoke('adbox-forward');
         break;
      case 'REV':
         await window.ipcApi.invoke('adbox-backward');
         break;
      case 'STOP':
         await window.ipcApi.invoke('adbox-stop');
         break;
      case 'HOME':
         await window.ipcApi.invoke('adbox-home');
         break;
      case 'MEASURE':
         await window.ipcApi.invoke('adbox-start-scan');
         break;
      // 可选：兜底处理未知状态
      default:
         console.warn('未知的状态类型:', options);
   }
};

// 移动到脉冲位置
const moveToPulsePosition = async () => { 
   await window.ipcApi.invoke('adbox-movePosition');
}

// 监听adbox:data
window.ipcApi.on("adbox-data", (_, data) => {
   currentAD.value = data.ad0;
   // thickness.value = calcThickness(data.ad0, { airAD: 50300, gain: 1.35 }).toFixed(2)
   if (data.pos0Raw) {
      console.log(data);
      measurePosition.value = data.pos0Raw;
   }
})

window.ipcApi.on("adbox-run-result", (_, data) => {
   console.log("运动指令反馈", data);
})

</script>
<template>
   <el-card class="control-container">
      <div class="thickness-measure-container">
         <!-- 顶部状态栏 -->
         <el-card class="status-card" shadow="never">
            <div class="status-row">
               <div class="status-item">
                  <span class="label">当前AD:</span>
                  <span class="value" style="width: 100px;">{{ currentAD }}</span>
               </div>
               <div class="status-item">
                  <span class="label">测量位置:</span>
                  <span class="value">{{ measurePosition }}</span>
               </div>
               <div class="status-item">
                  <span class="label">生产速度:</span>
                  <span class="value">{{ productionSpeed }}</span>
               </div>
               <div class="status-item">
                  <span class="label">厚度:</span>
                  <span class="value">{{ thickness }} um</span>
               </div>
               <div class="status-item">
                  <span class="label">膜泡折变:</span>
                  <span class="value">{{ bubbleChange }}</span>
               </div>

            </div>
         </el-card>

         <!-- 操作按钮区 -->
         <div class="action-bar">
            <div class="controls_container">
               <el-segmented @change="inputChangeState" style="height: 45px;" v-model="runningState" :options="options"
                  block size="large">
                  <template #default="{ item }">
                     <div>
                        <div>{{ (item as Option).label }}</div>
                     </div>
                  </template>
               </el-segmented>
            </div>
            <el-input v-model="targetPulse" class="pulse-input" placeholder="目标脉冲" />
            <el-button @click="moveToPulsePosition" type="success">到达(脉冲)</el-button>

         </div>

         <!-- 标签页 -->
         <el-tabs v-model="activeTab" class="tab-container">
            <el-tab-pane label="参数" name="param">
               <div class="tab-pane-body">
                  <el-card shadow="hover" header="标定结果" class="calibration-result-card">
                     <div class="calibration-control-bar">
                        <el-input v-model="manualTractionSpeed" class="manual-traction-speed-input"
                           placeholder="手动牵引速度">
                           <template #append>mm/s</template>
                        </el-input>
                        <el-button type="primary" :loading="isApplyingManualTractionSpeed"
                           @click="applyManualTractionSpeed">
                           应用牵引速度
                        </el-button>
                        <el-button :loading="isResettingCalibration" @click="resetCalibration">
                           开始/重置本次标定
                        </el-button>
                        <span class="calibration-control-tip">
                           应用牵引速度会更新速度并重新开始；开始/重置本次标定会沿用当前速度，仅重置本次扰动起点
                        </span>
                     </div>

                     <div class="calibration-result-grid">
                        <div class="calibration-result-item">
                           <span class="label">牵引速度</span>
                           <span class="value">{{ getCalibrationDisplayValue('tractionSpeed') }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">扰动距离</span>
                           <span class="value">{{ getCalibrationDisplayValue('distance') }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">上旋最大角度</span>
                           <span class="value">{{ getCalibrationDisplayValue('maxAngle') }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">突变窗口</span>
                           <span class="value">{{ getCalibrationDisplayValue('mutationWindowSize') }}</span>
                        </div>
                     </div>
                  </el-card>

                  <el-card shadow="hover" header="上旋调试信号" class="calibration-result-card">
                     <div class="calibration-result-grid upper-rotation-debug-grid">
                        <div class="calibration-result-item">
                           <span class="label">正转</span>
                           <span class="value">{{ formatUpperRotationBoolean(upperRotationDebug.ForwardRotation)
                              }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">反转</span>
                           <span class="value">{{ formatUpperRotationBoolean(upperRotationDebug.ReverseRotation)
                              }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">正换向</span>
                           <span class="value">{{ formatUpperRotationBoolean(upperRotationDebug.ForwardDirectionChange)
                              }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">反换向</span>
                           <span class="value">{{ formatUpperRotationBoolean(upperRotationDebug.ReverseDirectionChange)
                              }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">复位</span>
                           <span class="value">{{ formatUpperRotationBoolean(upperRotationDebug.Reset) }}</span>
                        </div>
                        <div class="calibration-result-item">
                           <span class="label">电机频率</span>
                           <span class="value">{{ formatUpperRotationMotorFrequency(upperRotationDebug.MotorFrequency)
                              }}</span>
                        </div>
                        <div class="calibration-result-item upper-rotation-heats-item">
                           <span class="label">热量</span>
                           <span class="value">{{ formatUpperRotationHeats(upperRotationDebug.Heats) }}</span>
                        </div>
                     </div>
                  </el-card>

                  <!-- 硬件/速度/采样/报警 四列布局 -->
                  <el-row :gutter="20" class="form-row">
                     <!-- 硬件 -->
                     <el-col :span="6">
                        <el-card shadow="hover" header="硬件">
                           <el-form :model="hardwareForm" label-width="100px" label-position="top">
                              <el-form-item label="机架长度(脉冲)">
                                 <el-input v-model="hardwareForm.frameLength" suffix="mm/脉冲" />
                              </el-form-item>
                              <el-form-item label="测速辊周长">
                                 <el-input v-model="hardwareForm.rollerCircumference" suffix="mm/脉冲" />
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
                              <!-- <el-form-item label="AD滞后">
                              <el-input v-model="hardwareForm.adDelay" suffix="ms" />
                           </el-form-item> -->
                           </el-form>
                        </el-card>
                     </el-col>

                     <!-- 速度 -->
                     <el-col :span="6">
                        <el-card shadow="hover" header="速度">
                           <el-form :model="speedForm" label-width="100px" label-position="top">
                              <el-form-item label="扫描速度">
                                 <el-input v-model="speedForm.scanSpeed" suffix="脉冲/s | 6.3m/min" />
                              </el-form-item>
                              <el-form-item label="采样速度">
                                 <el-input v-model="speedForm.sampleSpeed" suffix="脉冲/s | 4.2m/min" />
                              </el-form-item>
                              <el-form-item label="调试速度">
                                 <el-input v-model="speedForm.debugSpeed" suffix="脉冲/s | 4.2m/min" />
                              </el-form-item>
                              <el-form-item label="开始速度">
                                 <el-input v-model="speedForm.startSpeed" suffix="脉冲/s | 0.6m/min" />
                              </el-form-item>
                              <el-form-item label="归零速度1">
                                 <el-input v-model="speedForm.resetSpeed1" suffix="脉冲/s | 4.2m/min" />
                              </el-form-item>
                              <el-form-item label="归零速度2">
                                 <el-input v-model="speedForm.resetSpeed2" suffix="脉冲/s | 1.3m/min" />
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
                           <el-form :model="sampleForm" label-width="100px" label-position="top">
                              <el-form-item label="采样间隔">
                                 <el-input v-model="sampleForm.sampleInterval" suffix="min" />
                              </el-form-item>
                              <el-form-item label="采样位置">
                                 <el-input v-model="sampleForm.samplePosition" suffix="脉冲 | 28mm" />
                              </el-form-item>
                              <el-form-item label="采样半径">
                                 <el-input v-model="sampleForm.sampleRadius" suffix="脉冲 | 14mm" />
                              </el-form-item>
                           </el-form>
                        </el-card>
                     </el-col>

                     <!-- 厚度报警 -->
                     <el-col :span="6">
                        <div class="alarm-form">
                           <el-card shadow="hover" header="厚度报警">
                              <el-form :model="alarmForm" label-width="100px" label-position="top">
                                 <el-form-item>
                                    <el-checkbox v-model="alarmForm.alarmActive">报警激活</el-checkbox>
                                 </el-form-item>
                                 <el-form-item>
                                    <el-checkbox v-model="alarmForm.autoTarget">自动目标值</el-checkbox>
                                 </el-form-item>
                                 <el-form-item label="公差报警(分区)">
                                    <el-input v-model="alarmForm.toleranceZone" />
                                 </el-form-item>
                                 <div class="alarm-tip">连续N个分区超出公差范围触发报警!!</div>
                              </el-form>
                           </el-card>
                           <!-- 底部按钮 -->
                           <div class="bottom-action">
                              <el-button type="primary" size="large" :loading="isApplying"
                                 @click="applyPlcParams">应用</el-button>
                           </div>
                        </div>
                     </el-col>
                  </el-row>
               </div>

            </el-tab-pane>

            <el-tab-pane label="纵向" name="longitudinal">
               <div class="tab-pane-body">
                  <!-- 纵向 -->
                  <div class="chart-container">
                     <DynamicCharts />
                  </div>
               </div>
            </el-tab-pane>

            <el-tab-pane label="横向" name="lateral">
               <div class="tab-pane-body">
                  <!-- 横向 -->
               </div>
            </el-tab-pane>

            <el-tab-pane label="寻边" name="edge">
               <div class="tab-pane-body">
                  <!-- 寻边 -->
                  <div class="chart-container">
                     <SideCharts />
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

.calibration-result-card {
   margin-bottom: 20px;
}

.calibration-control-bar {
   display: flex;
   align-items: center;
   gap: 12px;
   margin-bottom: 16px;
   flex-wrap: wrap;
}

.manual-traction-speed-input {
   width: 220px;
}

.calibration-control-tip {
   color: #909399;
   font-size: 12px;
   line-height: 1.4;
}

.calibration-result-grid {
   display: grid;
   grid-template-columns: repeat(4, minmax(0, 1fr));
   gap: 16px;
}

.upper-rotation-debug-grid {
   grid-template-columns: repeat(4, minmax(0, 1fr));
}

.calibration-result-item {
   display: flex;
   flex-direction: column;
   gap: 8px;
   padding: 12px 16px;
   background: #f8fafc;
   border: 1px solid #e4e7ed;
   border-radius: 8px;
}

.calibration-result-item .label {
   color: #909399;
   font-size: 13px;
}

.calibration-result-item .value {
   color: #303133;
   font-size: 20px;
   font-weight: 600;
}

.upper-rotation-heats-item {
   grid-column: span 2;
}

.controls_container {
   width: 400px;
   border: 1px solid #c1c1c1;
   border-radius: 5px;
   margin-right: 100px;
}

.status-row {
   display: flex;
   align-items: center;
   justify-content: space-between;
   flex-wrap: wrap;
   gap: 15px;
}

.status-item {
   display: flex;
   align-items: center;
   gap: 8px;
}

.status-item .label {
   color: #606266;
   font-size: 14px;
}

.status-item .value {
   color: #303133;
   font-weight: 600;
   font-size: 15px;
}



.action-bar {
   display: flex;
   align-items: center;
   gap: 8px;
   margin: 20px 0;
}

.pulse-input {
   width: 150px;
}

.alarm-tip {
   color: #909399;
   font-size: 12px;
   margin-top: 10px;
}

.alarm-form {
   display: flex;
   flex-direction: column;
   justify-content: space-between;
   height: 100%;

}

.bottom-action {
   display: flex;
   justify-content: flex-end;
   margin-top: 20px;
   padding-right: 20px;
}
</style>