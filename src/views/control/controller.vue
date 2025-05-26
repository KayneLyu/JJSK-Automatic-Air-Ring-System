<script setup lang='ts'>
import { ref } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { setAutoHeats, getAirRingInfo } from '@/api';
import { Aim, CloseBold, Select } from '@element-plus/icons-vue';
import RobotIcon from "@/components/icons/Robot.vue";
import HandleIcon from "@/components/icons/Handle.vue";
import AutoIcon from "@/components/icons/Auto.vue";
import SaveIcon from '@/components/icons/Save.vue';
import HistoryIcon from "@/components/icons/History.vue";
import AllUpIcon from '@/components/icons/Allup.vue';
import AllDownIcon from '@/components/icons/Alldown.vue';
import ResetIcon from '@/components/icons/Reset.vue';

const store = useApiDataStore()

const activeName = ref('auto-mode')

const props = defineProps<{
  cancelChange: () => void,
  applyHeats: () => void,
  changeAllHeats: (isReset: boolean , isUp?: boolean) => void,
  changeCurrentIndexHeats: (isUp: boolean, isCounter?: boolean) => void,
}>()

const toggleAutoMode = async () => {
  try {
    await setAutoHeats(!store.apiAirRingData.IsAuto)
    const data = await getAirRingInfo();
    if (data) {
      store.updateAirRingData(data)
    }
  } catch (error) {
  }
}
// // 升降控制
// const handleUpDown = (isUp: boolean) => {
//   props.changeAllHeats(isUp)
// }

</script>

<template>
  <el-card>
    <div class="control_container">
      <el-tabs v-model="activeName" type="card" class="demo-tabs">
        <el-tab-pane name="auto-mode">
          <template #label>
            <span class="custom-tabs-label">
              <el-icon size="18" style="margin-right: 5px;">
                <RobotIcon />
              </el-icon>
              <span style="font-size: 13px;">自动模式</span>
            </span>
          </template>
          <div class="status_container">
            <div @click="toggleAutoMode" class="auto_status">
              <el-icon size="50"
                :style="{ color: store.apiAirRingData.IsAuto ? '#34e53a' : '', filter: store.apiAirRingData.IsAuto ? 'drop-shadow(0 0 5px rgba(30, 217, 39, 0.617)' : '' }">
                <AutoIcon />
              </el-icon>
              <p>自动模式</p>
            </div>

            <!-- <div class="save_channel" style="margin-top: 40px;">
              <div>
                <p><el-button type="primary" :icon="SaveIcon"></el-button></p>
                <p>保存通道</p>
              </div>
              <div>
                <p><el-button type="primary" :icon="HistoryIcon"></el-button></p>
                <p>历史通道</p>
              </div>
            </div> -->
            <div class="save_channel">
              <div>
                <p><el-button @click="changeAllHeats(false, true)" :disabled="store.apiAirRingData.IsAuto" type="primary"
                    :icon="AllUpIcon"></el-button></p>
                <p>全升</p>
              </div>
              <div>
                <p><el-button @click="changeAllHeats(false, false)" :disabled="store.apiAirRingData.IsAuto" type="primary"
                    :icon="AllDownIcon"></el-button></p>
                <p>全降</p>
              </div>
            </div>
            <div class="status_reset">
              <p><el-button @click="changeAllHeats(true)" :disabled="store.apiAirRingData.IsAuto" type="primary" :icon="ResetIcon"></el-button></p>
              <p>复位</p>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :disabled="store.apiAirRingData.IsAuto" name="handel-mode">
          <template #label>
            <span class="custom-tabs-label">
              <el-icon size="18" style="margin-right: 5px;">
                <HandleIcon />
              </el-icon>
              <span style="font-size: 13px;">手动模式</span>
            </span>
          </template>
          <div class="status_container handle_container">
            <div class="save_channel handel_btn">
              <div>
                <p><el-button @click="changeCurrentIndexHeats(false, true)" :disabled="store.apiAirRingData.IsAuto"
                    type="primary" style="font-size: 20px; "> + </el-button></p>
                <p>增加</p>
              </div>
              <div>
                <p><el-button @click="changeCurrentIndexHeats(false, false)" :disabled="store.apiAirRingData.IsAuto"
                    type="primary" style="font-size: 24px; "> - </el-button></p>
                <p>减少</p>
              </div>
            </div>

            <div class="save_channel handel_btn">
              <div>
                <p><el-button @click="cancelChange" :disabled="store.apiAirRingData.IsAuto"
                    type="danger" :icon="CloseBold"></el-button></p>
                <p>取消</p>
              </div>
              <div>
                <p><el-button @click="changeCurrentIndexHeats(true)" :disabled="store.apiAirRingData.IsAuto"
                    type="warning" :icon="Aim"></el-button></p>
                <p>对位</p>
              </div>
            </div>
            <div  style="margin-top: 20px;">
              <p><el-button @click="applyHeats" :disabled="store.apiAirRingData.IsAuto"
                  type="success" :icon="Select"></el-button></p>
              <p>应用</p>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-card>
</template>

<style scoped lang="less">
.control_container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 200px;
  height: 100%;
  box-sizing: border-box;
  padding: 10px;
}

:deep(.el-tabs__nav) {
  width: 100%;
}

:deep(.el-tabs__item) {
  width: 50%;
}

:deep(.control_container) {
  padding: 5px;
}

:deep(.el-tabs--card) {
  height: 100%;
}

:deep(.el-tab-pane) {
  height: 100%;
}

.custom-tabs-label {
  display: flex;
  align-items: center;
}

.status_container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: space-around;

  .auto_status {
    cursor: pointer;
  }

  .save_channel {
    display: flex;
    width: 100%;
    justify-content: space-around;
  }

  p {
    text-align: center;
    font-size: 13px;
    margin-top: 4px;
  }
}

.handle_container {
  justify-content: unset;

}

.handel_btn {
  margin: 6px 0;
}
</style>