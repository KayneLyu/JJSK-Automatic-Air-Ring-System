<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useIntervalFn, useTimeoutFn } from '@vueuse/core'
import { getThickInfo, getAirRingInfo, getFrame } from "@/api";
import Layouts from "@/layout/index.vue";
import { useApiDataStore } from '@/store/polling-data';

import { db } from '@/utils/dexie';

const store = useApiDataStore()
const getThickData = async () => {
  try {
    const data = await getThickInfo();
    if (data) {
      store.updateApiData(data)
    }
  } catch (error) {
    store.apiThickData.ErrCode = 0
  }
}
const getAirRingData = async () => {
  try {
    const data = await getAirRingInfo();
    if(data) {
      store.updateAirRingData(data)
    }
  } catch (error) {
    store.apiAirRingData.ErrCode = 32
  }
}

// 开始轮询
const { start: startThickGauge, stop: stopThickGauge } = useTimeoutFn(() => {
  getThickData();
  startThickGauge()
}, 1000)

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

<style scoped></style>
