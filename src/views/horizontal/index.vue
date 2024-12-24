<script setup lang='ts'>
import HorizonCharts from './AreaCharts.vue';
import HeatState from './HeatsState.vue';
import ThickInfo from './ThickInfo.vue';

</script>

<template>
   <div class="horizon">
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>

      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HeatState />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <!-- <ThickInfo /> -->
            </el-card>
         </div>
      </div>
   </div>
</template>

<style scoped lang="less">
.horizon {
   height: 100%;
   display: flex;
   flex-direction: column;
}

.charts_content {
   margin-top: 9px;
   &:first-of-type {
      margin: 0;
   }

   flex: 1;
   display: flex;
   width: 100%;

   .chart_views {
      flex: 1;
   }

   .chartBox {
      width: 99%;
      height: 100%;
      background: #f5f4f1;
      border: none;
   }

   .info_card {
      width: 200px;
      height: 100%;
      .card_content {
         background: #f5f4f1;
         height: 100%;
      }
   }
}

:deep(.el-card__body) {
   height: 99%;
   // width: 100%;
   padding: unset !important;
}
</style>