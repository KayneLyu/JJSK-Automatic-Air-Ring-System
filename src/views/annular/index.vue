<script setup lang='ts'>
import { ref } from 'vue';
import LoopCharts from './loop-charts.vue';
import FrameInfo from './frameInfo.vue';
</script>

<template>
    <el-card class="container">
      <div class="charts_loop">
        <LoopCharts />
      </div>
      <FrameInfo />
    </el-card>
</template>

<style scoped lang="less">

.container {
  width: 100%;
  height: 100%;
}
:deep(.el-card__body) {
  width: 100%;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.charts_loop {
  width: 100%;
  flex: 1;
}
</style>