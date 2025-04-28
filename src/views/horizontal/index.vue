<script setup lang='ts'>
import { onMounted, reactive, ref } from 'vue';
import HorizonCharts from './AreaCharts.vue';
import HeatState from './HeatsState.vue';
import ThickInfo from './ThickInfo.vue';
import { getFrame } from '@/api/';
import { db } from '@/utils/dexie';
import { formateList } from '@/utils/ChartsData';

const frameListData = reactive([
   {
      frameId: 0,
      startTime: '',
      endTime: '',
      speed: 0,
      width: 0,
      rotateSpeed: 0,
      sigmaVal: 0,
      sigmaPercent: 0,
      mean: 0,
      minVal: 0,
      minPercent: 0,
      maxVal: 0,
      maxPercent: 0,
      datalist: [],
   },
   {
      frameId: 0,
      startTime: '',
      endTime: '',
      speed: 0,
      width: 0,
      rotateSpeed: 0,
      sigmaVal: 0,
      sigmaPercent: 0,
      mean: 0,
      minVal: 0,
      minPercent: 0,
      maxVal: 0,
      maxPercent: 0,
      datalist: [],
   },
   {
      frameId: 0,
      startTime: '',
      endTime: '',
      speed: 0,
      width: 0,
      rotateSpeed: 0,
      sigmaVal: 0,
      sigmaPercent: 0,
      mean: 0,
      minVal: 0,
      minPercent: 0,
      maxVal: 0,
      maxPercent: 0,
      datalist: [],
   },
   {
      frameId: 0,
      startTime: '',
      endTime: '',
      speed: 0,
      width: 0,
      rotateSpeed: 0,
      sigmaVal: 0,
      sigmaPercent: 0,
      mean: 0,
      minVal: 0,
      minPercent: 0,
      maxVal: 0,
      maxPercent: 0,
      datalist: [],
   },
   {
      frameId: 0,
      startTime: '',
      endTime: '',
      speed: 0,
      width: 0,
      rotateSpeed: 0,
      sigmaVal: 0,
      sigmaPercent: 0,
      mean: 0,
      minVal: 0,
      minPercent: 0,
      maxVal: 0,
      maxPercent: 0,
      datalist: [],
   },
])
const getFrameList = async () => {
   try {
      const recentItems = await db.Frame.orderBy('frameId').reverse().limit(4).toArray();
      if (recentItems.length) {
         for (let index = 0; index < recentItems.length; index++) {
            frameListData[recentItems.length- index] = {
               ...recentItems[index],
               datalist: formateList(recentItems[index]) as []
            }
         }
      }
   } catch (error) { }
}
onMounted(() => {
   getFrameList()
})
</script>

<template>
   <div class="horizon">
      <div v-for="(frame, index) in frameListData" :key="index" class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts :startDate="frame.startTime" :endDate="frame.endTime" :id="frame.frameId"
                  :frameData="frame.datalist" />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo />
            </el-card>
         </div>
      </div>

      <!-- <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HeatState />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <div>
               </div>
            </el-card>
         </div>
      </div> -->
   </div>
</template>

<style scoped lang="less">
.horizon {
   height: 100%;
   display: flex;
   flex-direction: column;
}

.charts_content {
   margin-top: 8px;

   &:first-of-type {
      margin: 0;
   }

   flex: 1;
   display: flex;

   .chart_views {
      flex: 1;
   }

   .chartBox {
      height: 100%;
      width: 100%;
      background: #f5f4f1;
      border: none;
   }

   .info_card {
      width: 220px;
      height: 100%;
      margin-left: 6px;

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