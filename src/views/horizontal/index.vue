<script setup lang='ts'>
import { reactive, ref, watch } from 'vue';
import HorizonCharts from './AreaCharts.vue';
import HeatState from './HeatsState.vue';
import ThickInfo from './ThickInfo.vue';
import { db } from '@/utils/dexie';
import { formateList } from '@/utils/ChartsData';
import HeatsCardInfo from './HeatsCard.vue';
import TempCharts from './TempCharts.vue';
import { useApiDataStore } from '@/store/polling-data';
import { getHeats } from '@/api';

const store = useApiDataStore()
const frameListData = reactive<IFrameThickData[]>([
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
      IsBackw: false,
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
      IsBackw: false,
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
      IsBackw: false,
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
      IsBackw: false,
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
      IsBackw: false,
      datalist: [],
   },
])

let tempData = ref<[number, number | null][]>([])
let heatsChannel = ref<[string, number][]>([])

const getFrameList = async () => {
   try {
      const recentItems = await db.Frame.orderBy('frameId').reverse().limit(5).toArray();
      if (recentItems.length) {
         for (let index = 0; index < recentItems.length; index++) {
            frameListData[recentItems.length - 1 - index] = {
               ...recentItems[index],
               datalist: formateList(recentItems[index].datalist as number[], recentItems[index].mean)
            }
         }
      }
      const heats = await getHeats()
      if (heats.length) {
         const formatHeatsData: Array<[string, number]>= heats.map((item, index) => {
            return [`${index}`, item]
         })
         heatsChannel.value = formatHeatsData
      }
   } catch (error) { }
}

watch(() => store.apiThickData.LastScanDataId, async () => {
   getFrameList()
},
   {
      immediate: true
   }
)

</script>

<template>
   <div class="horizon">
      <div v-for="(frame, index) in frameListData" :key="index" class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">

               <TempCharts v-if="index == 4" :temp-list="tempData" :mean-val="frame.mean" :startDate="frame.startTime"
                  :endDate="frame.endTime" :id="frame.frameId" :frameData="frame.datalist as [number, number][]" />

               <HorizonCharts v-else :startDate="frame.startTime" :endDate="frame.endTime" :id="frame.frameId"
                  :frameData="frame.datalist as [number, number][]" />
            </el-card>

         </div>
         <div class="info_card">
            <el-card class="card_content">
               <ThickInfo :thickInfo="frame" />
            </el-card>
         </div>
      </div>

      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HeatState :frame-data="heatsChannel" />
            </el-card>
         </div>
         <div class="info_card">
            <el-card class="card_content">
               <HeatsCardInfo />
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