<script setup lang="ts">
import { onMounted } from 'vue';
// import { useTimeoutFn } from '@vueuse/core'
// import { getThickInfo, getAirRingInfo, getAirRingConfig } from "@/api";
import Layouts from "@/layout/index.vue";

onMounted( async() => {
  const result = await window.ipcApi.invoke("adbox-connect")
  if(result) {
    console.log('ADBOX 连接成功!');
  }
})
</script>

<template>
  <Layouts />
</template>

<style scoped></style>
