<script setup lang='ts'>
import { ref } from 'vue';
import LoopCharts from './loop-charts.vue';
</script>

<template>
  <div class="charts_container">
    <LoopCharts />
  </div>
</template>

<style scoped>
.charts_container {
  width: 100%;
  height: 100%;
}
</style>