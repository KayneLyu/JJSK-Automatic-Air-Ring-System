<script setup lang='ts'>
import { reactive, ref, watch, onMounted } from 'vue';
import { db } from '@/utils/dexie';
import { useConfigStore } from '@/store/config';
import { useFrameStore } from '@/store/frame';
import { useApiDataStore } from '@/store/polling-data';

import HorizonCharts from './frame-charts/AreaCharts.vue';
import ThickInfo from '@/components/frame-info.vue';
import HeatState from './heats/HeatsFrame.vue';
import HeatsCardInfo from './heats/HeatsCard.vue';

const store = useFrameStore()
const configStore = useConfigStore()
const apiStore = useApiDataStore()

const frameListData = reactive<IFrameThickData[]>([
   {
      dataList: [],
      meanValue: 0,
      max: 0,
      min: 0,
      maxPercent: 0,
      minPercent: 0,
      width: '',
      date: '',
      rotation: '',
      sigma: 0,
      sigmaPercent: 0,
      id: 0
   },
   {
      dataList: [],
      meanValue: 0,
      max: 0,
      min: 0,
      maxPercent: 0,
      minPercent: 0,
      width: '',
      date: '',
      rotation: '',
      sigma: 0,
      sigmaPercent: 0,
      id: 0
   },
   {
      dataList: [],
      meanValue: 0,
      max: 0,
      min: 0,
      maxPercent: 0,
      minPercent: 0,
      width: '',
      date: '',
      rotation: '',
      sigma: 0,
      sigmaPercent: 0,
      id: 0
   },
   {
      dataList: [],
      meanValue: 0,
      max: 0,
      min: 0,
      maxPercent: 0,
      minPercent: 0,
      width: '',
      date: '',
      rotation: '',
      sigma: 0,
      sigmaPercent: 0,
      id: 0
   },

])

const beforeAutoMode = ref<IFrameThickData>({
   dataList: [],
   meanValue: 0,
   max: 0,
   min: 0,
   maxPercent: 0,
   minPercent: 0,
   width: '',
   date: '',
   rotation: '',
   sigma: 0,
   sigmaPercent: 0,
   id: 0
})

let heatsChannel = ref<[string, number][]>([])

const getFrameList = async () => {
   try {
      const recentItems = await db.Frame.orderBy('id').reverse().limit(4).toArray();
      if (recentItems.length) {
         for (let index = 0; index < recentItems.length; index++) {
            frameListData[recentItems.length - 1 - index] = {
               ...recentItems[index]
            }
         }
      }
      const heatsData = apiStore.KPEData.data
      if (heatsData) {
         const formatHeatsData: Array<[string, number]> = heatsData.map((item, index) => {
            return [`${index + 1}`, item[1]]
         })
         heatsChannel.value = formatHeatsData
      }
   } catch (error) { }
}

watch(() => store.updateFrameId, () => {
   getFrameList()
},
   {
      immediate: true
   }
)

const getBeforeAutoData = async () => {
   try {
      let result: IFrameThickData | undefined
      if (configStore.beforeAutoID) {
         result = await db.Frame.get(configStore.beforeAutoID)
      } else {
         const [queryItem] = await db.Frame.orderBy('frameId').reverse().offset(19).limit(1).toArray()
         result = queryItem
      }
      if (result) {
         beforeAutoMode.value = { ...result }
      }
   } catch (error) { }
}

onMounted(() => {
   void getBeforeAutoData()
})

</script>

<template>
   <div class="horizon">
      <div class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts is-before-auto :startDate="beforeAutoMode.date" :id="beforeAutoMode.id!"
                  :frameData="<Array<[number, number]>>beforeAutoMode.dataList" />
            </el-card>
         </div>
         <div class="info_card">
            <ThickInfo :thickInfo="beforeAutoMode" is-column />
         </div>
      </div>
      <div v-for="(frame, index) in frameListData" :key="index" class="charts_content">
         <div class="chart_views">
            <el-card class="chartBox">
               <HorizonCharts :startDate="frame.date" :id="frame.id!"
                  :frameData="<Array<[number, number]>>frame.dataList" />
            </el-card>

         </div>
         <div class="info_card">
            <ThickInfo :thickInfo="frame" is-column />
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