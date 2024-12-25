<script setup lang="ts">
import moduleName from 'vue';
import { getInfoInterval } from "@/api";
import Layouts from "@/layout/index.vue";



const aa = async() => {
  const data = await getInfoInterval();
}
</script>

<template>
  <Layouts />
</template>

<style scoped>

</style>
