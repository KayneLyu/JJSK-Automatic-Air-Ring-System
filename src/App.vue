<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useTimeoutFn } from '@vueuse/core'
import { getVDPBaseData, getKPEHeatsData, getWarningPage, getAutoStatus } from "@/api";
import Layouts from "@/layout/index.vue";
import { useApiDataStore } from '@/store/polling-data';
import { formatKunErrors } from "@/utils/format-data";

const store = useApiDataStore()
const getThickData = async () => {
  try {
    // VDP 测厚仪基础数据
    const baseData = await getVDPBaseData();
    if (baseData) {
      const { actMeasPos, actMeasVal, targetTmdState, p, actualTmdState } = baseData
      const { time } = p[0][1]
      // 设置测厚仪当前数据
      store.updateVDPData({
        position: actMeasPos,
        actualVal: actMeasVal,
        time: time,
        buttonState: actualTmdState,
        targetTmdState
      })
    }
  } catch (error) {
    store.updateWarning(['0'])
  }
}

const getAirRingData = async () => {
  try {
    const heatsData = await getKPEHeatsData()
    // 报警内容
    const warningData = await getWarningPage()
    if (heatsData) {
      const airRingStatus = heatsData.p[1][1]
      const data = await getAutoStatus(airRingStatus.rotation.toFixed(2))
      if (data) {
        store.updateKPEData({ ...airRingStatus, apcState: data.apcState })
      }
    }
    if (warningData) {
      const errorList = formatKunErrors(warningData as string)
      if (errorList.length) {
        store.updateWarning(errorList)
      }
    }
  } catch (error) {
    store.updateWarning(['0'])
  }
}

// 开始轮询
const { start: startThickGauge, stop: stopThickGauge } = useTimeoutFn(() => {
  getThickData();
  startThickGauge()
}, 100)

const { start: start, stop: stopAirRing, } = useTimeoutFn(() => {
  getAirRingData();
  start()
}, 2000)

onBeforeUnmount(() => {
  stopThickGauge(),
    stopAirRing()
})
</script>

<template>
  <Layouts />
</template>
