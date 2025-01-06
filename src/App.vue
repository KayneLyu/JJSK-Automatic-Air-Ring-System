<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useIntervalFn, useTimeoutFn } from '@vueuse/core'
import { getThickInfo, getAirRingInfo } from "@/api";
import Layouts from "@/layout/index.vue";
import { useApiDataStore } from '@/store/polling-data';
import { formateThickData } from '@/utils/format-data';

const store = useApiDataStore()
const getThickData = async () => {
  try {
    const data = await getThickInfo();
    if (data) {
      const formatThick = formateThickData(data)
      store.updateApiData(formatThick)
    }
    // console.log('thickdata',data);
  } catch (error) {
    console.log('error:', error);
  }
}
const getAirRingData = async () => {
  try {
    const data = await getAirRingInfo();
    // console.log('airring',data);
  } catch (error) {
    console.log('error:', error);
  }
}
const { start, stop, isPending } = useTimeoutFn(() => {
  getThickData();
  getAirRingData();
  start()
}, 1000)

onBeforeUnmount(() => {
  stop()
})
</script>

<template>
  <Layouts />
</template>

<style scoped></style>
