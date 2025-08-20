<script setup lang='ts'>
import { ref } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { useConfigStore } from '@/store/config';
// import { setAutoHeats, getAirRingInfo } from '@/api';
import { Aim, CloseBold, Select } from '@element-plus/icons-vue';
import RobotIcon from "@/components/icons/Robot.vue";
import HandleIcon from "@/components/icons/Handle.vue";
import AutoIcon from "@/components/icons/Auto.vue";
import AllUpIcon from '@/components/icons/Allup.vue';
import AllDownIcon from '@/components/icons/Alldown.vue';
import ResetIcon from '@/components/icons/Reset.vue';
// import SaveChannel from './channels/index.vue';

const store = useApiDataStore()
const configStore = useConfigStore()

const activeName = ref('auto-mode')

// defineProps<{
//   currentId: number,
//   getNewChannel: () => void,
//   cancelChange: () => void,
//   applyHeats: () => void,
//   changeAllHeats: (isReset: boolean , isUp?: boolean) => void,
//   changeCurrentIndexHeats: (isUp: boolean, isCounter?: boolean) => void,
// }>()

// const toggleAutoMode = async () => {
//   try {
//     await setAutoHeats(!store.apiAirRingData.IsAuto)
//     const data = await getAirRingInfo();
//     if (data) {
//       store.updateAirRingData(data)
//       if(data.IsAuto) {
//         const beforeAutoID = store.apiThickData.LastScanDataId
//         configStore.beforeAutoID = beforeAutoID
//       }
//     }
//   } catch (error) {}
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
              <span style="font-size: 13px;">{{ $t("control.autoMode") }}</span>
            </span>
          </template>
          <div class="status_container">
            <div>
              <p>测量:</p>
              <div>
                <img src="" alt="">
              </div>
            </div>
          </div>
          <!-- <div class="status_container">
            <div @click="toggleAutoMode" class="auto_status">
              <el-icon size="50"
                :style="{ color: store.apiAirRingData.IsAuto ? '#34e53a' : '', filter: store.apiAirRingData.IsAuto ? 'drop-shadow(0 0 5px rgba(30, 217, 39, 0.617)' : '' }">
                <AutoIcon />
              </el-icon>
              <p>{{ $t("control.autoMode") }}</p>
            </div>

            <div class="save_channel" style="margin-top: 40px;">
              <SaveChannel :get-current-channel="getNewChannel" :current-id="currentId"/>
            </div>
            <div class="save_channel">
              <div>
                <p><el-button @click="changeAllHeats(false, true)" :disabled="store.apiAirRingData.IsAuto" type="primary"
                    :icon="AllUpIcon"></el-button></p>
                <p>{{ $t("control.allRise") }}</p>
              </div>
              <div>
                <p><el-button @click="changeAllHeats(false, false)" :disabled="store.apiAirRingData.IsAuto" type="primary"
                    :icon="AllDownIcon"></el-button></p>
                <p>{{ $t("control.allDown") }}</p>
              </div>
            </div>
            <div class="status_reset">
              <p><el-button @click="changeAllHeats(true)" :disabled="store.apiAirRingData.IsAuto" type="success" :icon="ResetIcon"></el-button></p>
              <p>{{ $t("control.reset") }}</p>
            </div>
          </div> -->
        </el-tab-pane>

        <!-- <el-tab-pane :disabled="store.apiAirRingData.IsAuto" name="handel-mode">
          <template #label>
            <span class="custom-tabs-label">
              <el-icon size="18" style="margin-right: 5px;">
                <HandleIcon />
              </el-icon>
              <span style="font-size: 13px;">{{ $t("control.manualMode") }}</span>
            </span>
          </template>
          <div class="status_container handle_container">
            <div class="save_channel handel_btn">
              <div>
                <p><el-button @click="changeCurrentIndexHeats(false, true)" :disabled="store.apiAirRingData.IsAuto"
                    type="primary" style="font-size: 20px; "> + </el-button></p>
                <p>{{ $t("control.add") }}</p>
              </div>
              <div>
                <p><el-button @click="changeCurrentIndexHeats(false, false)" :disabled="store.apiAirRingData.IsAuto"
                    type="primary" style="font-size: 24px; "> - </el-button></p>
                <p>{{ $t("control.reduce") }}</p>
              </div>
            </div>

            <div class="save_channel handel_btn">
              <div>
                <p><el-button @click="cancelChange" :disabled="store.apiAirRingData.IsAuto"
                    type="danger" :icon="CloseBold"></el-button></p>
                <p>{{ $t("control.cancel") }}</p>
              </div>
              <div>
                <p><el-button @click="changeCurrentIndexHeats(true)" :disabled="store.apiAirRingData.IsAuto"
                    type="warning" :icon="Aim"></el-button></p>
                <p>{{ $t("control.focus") }}</p>
              </div>
            </div>
            <div  style="margin-top: 20px;">
              <p><el-button @click="applyHeats" :disabled="store.apiAirRingData.IsAuto"
                  type="success" :icon="Select"></el-button></p>
              <p>{{ $t("control.apply") }}</p>
            </div>
          </div>
        </el-tab-pane> -->
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
    text-align: center;
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