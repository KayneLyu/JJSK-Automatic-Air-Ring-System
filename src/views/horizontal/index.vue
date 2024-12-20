<script setup lang='ts'>
import HorizonCharts from './AreaCharts.vue';
</script>

<template>
   <div class="horizon">
      <el-card class="chartBox">
         <HorizonCharts />
      </el-card>
      <el-card class="chartBox">
         <HorizonCharts />
      </el-card>
      <el-card class="chartBox">
         <HorizonCharts />
      </el-card>
      <el-card class="chartBox">
         <HorizonCharts />
      </el-card>
      <el-card class="chartBox">
         <HorizonCharts />
      </el-card>
   </div>
</template>

<style scoped lang="less">
.horizon {
   height: 100%;
   display: flex;
   flex-direction: column;
}
.chartBox {
   flex: 1;
   width: 99%;
   margin-top: 9px;
   // background: #f5f4f1;
   border: none;
   background: transparent;
}

:deep(.el-card__body) {
   height: 99%;
   padding: unset !important;
}
</style>