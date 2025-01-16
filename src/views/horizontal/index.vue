<script setup lang='ts'>
import { onMounted, ref } from 'vue';
import HorizonCharts from './AreaCharts.vue';
import HeatState from './HeatsState.vue';
import ThickInfo from './ThickInfo.vue';
import { formatFrameData } from '@/utils/format-data';
import { getFrame } from '@/api/';
import { db } from '@/utils/dexie';
import { formateList } from '@/utils/ChartsData';

const frameData = ref<[number,string][]>([])
const getFrameFromApi = async () => {
   try {
      const res = await db.Frame.get(1);
      if (res) {
         frameData.value = formateList(res)
      }
   } catch (error) {

   }
}
onMounted(() => {
   getFrameFromApi()
})
</script>

<template>
   <div class="horizon">
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts :frameData="frameData" />
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
               <HorizonCharts :frameData="frameData"/>
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
               <HorizonCharts :frameData="frameData"/>
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
               <HorizonCharts :frameData="frameData"/>
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
               <HorizonCharts :frameData="frameData"/>
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
      width: 220px;
      height: 100%;

      .card_content {
         background: #f5f4f1;
         height: 100%;
      }
   }
}

:deep(.el-card__body) {
   height: 99%;
   padding: unset !important;
}
</style>