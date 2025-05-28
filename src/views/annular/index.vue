<script setup lang='ts'>
import { ref, watch } from 'vue';
import LoopCharts from './loop-charts.vue';
import { useFrameStore } from '@/store/frame';
import dayjs from 'dayjs';
import { db } from '@/utils/dexie';
import FrameInfo from '@/components/frame-info.vue';

const frameStore = useFrameStore()

const frameData = ref<IFrameThickData | null>(null)

const getLastFrameData = async () => {
  try {
    const result = await db.Frame.orderBy('endTime').reverse().first()
    if (result) {
      let formatData = result.datalist.map((item, index) => {
        const value = (((<number>item - result.mean) / result.mean) * 100).toFixed(1)
        if (index === 119) {
          const zeroValue = (((<number>result.datalist[0] - result.mean) / result.mean) * 100).toFixed(1)
          return [Number(zeroValue), 0]
        }
        return [Number(value), index]
      })
      frameData.value = { ...result, datalist: formatData as Array<[number, number]>}
    }
  } catch (error) {
    console.error('loop error get data from dexie');
  }
}

watch(() => frameStore.updateFrameId, (newVal) => {
  getLastFrameData()
},
  {
    immediate: true
  }
)
</script>

<template>
  <el-card class="container">
    <div class="charts_info">
      <div><p>环形图 <span style="margin-left: 20px;">当前ID: {{ frameData && frameData.frameId }}</span></p></div>
      <div><p v-if="frameData">{{ frameData.startTime }} ~ {{ dayjs(frameData.endTime).format("HH:mm:ss") }}</p></div>
      
    </div>
    <div class="charts_loop">
      <LoopCharts :frame-data="<number[]>frameData?.datalist" :mean-value="frameData?.mean" />
    </div>
    <div style="height: 50px; line-height: 50px;">
      <FrameInfo :thickInfo="frameData" />
    </div>
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
.charts_info {
  height: 40px;
  padding: 10px;
  box-sizing: border-box;
  p {
    display: inline-block;
    padding: 4px 5px;
    border-radius: 3px;
    margin-right: 20px;
    flex: auto;
    background-color: #409EFF;
    color: #fff;
    margin-bottom: 2px;
  }
}
</style>