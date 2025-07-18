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
    const result = await db.Frame.orderBy('date').reverse().first()
    if (result) {
      let formatData = result.dataList.map((item, index) => {
        if (index === 359) {
          return [result.dataList[0][1], 0]
        }
        return [item[1], index]
      })
      frameData.value = { ...result, dataList: formatData as Array<[number, number]>}
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
      <div><p v-if="frameData">{{ dayjs(frameData.date).format("HH:mm:ss") }}</p></div>
    </div>
    <div class="charts_loop">
      <LoopCharts :frame-data="frameData?.dataList" />
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