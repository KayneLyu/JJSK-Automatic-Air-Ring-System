<script setup lang='ts'>
import { ref } from 'vue';
import RobotIcon from "@/components/icons/Robot.vue";
import { setVDPButtonStatus, setKPEButtonStatus } from '@/api';
import { showNotification } from "@/utils/common";
import StatusButton from "./button.vue";
import { useI18n } from 'vue-i18n';
import { useConfigStore } from '@/store/config';
import { useApiDataStore } from '@/store/polling-data';
import { useFrameStore } from '@/store/frame';

const { t } = useI18n();

const store = useApiDataStore()
const configStore = useConfigStore()
const frameStore = useFrameStore()

const activeName = ref('auto-mode')

const checkoutMeasure = async () => {
  const param = store.VDPData.targetTmdState == 'measuring_TD' ? 'stopButtonId' : 'measureTdButtonId'
  try {
    await setVDPButtonStatus({
      ajaxRequest: 'jsonObjectRpc',
      rpcFunction: 'webRpcControlButtons',
      jsonObject: `{"buttonId":"${param}"}`
    })
  } catch (error) {
    showNotification("Error", t('notification.failed'), "error")
  }
}

const checkoutAutoMode = async () => {
  const isAutoMode = store.KPEData.apcState == 'apcStateActive'
  const param = isAutoMode ? 'Off' : 'On'
  window.ipcRenderer.send("win-check-autoMode", !isAutoMode)
  try {
    await setKPEButtonStatus({
      ajaxRequest: 'jsonObjectRpc',
      rpcFunction: 'webRpcControlButtons',
      jsonObject: `{"buttonName":"controlRadioButton","buttonState":"${param}"}`
    })
    if (!isAutoMode) {
      configStore.beforeAutoID = frameStore.updateFrameId
    }
  } catch (error) {
    showNotification("Error", t('notification.failed'), "error")
  }
}

const checkoutHoldMode = async () => {
  window.ipcRenderer.send("win-check-autoMode", false)
  const param = store.KPEData.apcState == 'apcStateHold' ? 'Off' : 'Hold'
  try {
    await setKPEButtonStatus({
      ajaxRequest: 'jsonObjectRpc',
      rpcFunction: 'webRpcControlButtons',
      jsonObject: `{"buttonName":"controlRadioButton","buttonState":"${param}"}`
    })
  } catch (error) {
    showNotification("Error", t('notification.failed'), "error")
  }
}

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
            <StatusButton :check-status="checkoutMeasure" :is-turn-on="store.VDPData.targetTmdState == 'measuring_TD'"
              :text="t('control.scan')" />
            <StatusButton :check-status="checkoutAutoMode" :is-turn-on="store.KPEData.apcState == 'apcStateActive'"
              :text="t('control.apcControl')" />
            <StatusButton :check-status="checkoutHoldMode" :is-turn-on="store.KPEData.apcState == 'apcStateHold'"
              :text="t('control.apcHold')" />
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