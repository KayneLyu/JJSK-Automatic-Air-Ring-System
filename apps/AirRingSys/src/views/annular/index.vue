<script setup lang='ts'>
import { ref, watch } from 'vue';
import LoopCharts from './loop-charts.vue';
import { useFrameStore } from '@/store/frame.ts';
import dayjs from 'dayjs';
import type { FrameRow } from '@/types/ipc';
import FrameInfo from '@/components/frame-info.vue';

const frameStore = useFrameStore()

const frameData = ref<IFrameThickData | null>(null)

function frameRowToThickData(row: FrameRow): IFrameThickData {
  return {
    frameId: row.frameId,
    startTime: row.startTime,
    endTime: row.endTime,
    startTimestamp: row.startTimestamp,
    endTimestamp: row.endTimestamp,
    speed: row.speed,
    width: row.width,
    rotateSpeed: row.rotateSpeed,
    sigmaVal: row.sigmaVal,
    sigmaPercent: row.sigmaPercent,
    mean: row.mean,
    minVal: row.minVal,
    minPercent: row.minPercent,
    maxVal: row.maxVal,
    maxPercent: row.maxPercent,
    IsBackw: row.IsBackw === 1,
    datalist: row.datalist ? JSON.parse(row.datalist) : [],
    rawDatalist: row.rawDatalist ? JSON.parse(row.rawDatalist) : [],
    source: row.source as IFrameThickData['source'],
    airAD: row.airAD,
    gain: row.gain,
  }
}

const getLastFrameData = async () => {
  try {
    const result = await window.ipcApi.invoke('db-get-latest-frame')
    if (result) {
      const thick = frameRowToThickData(result)
      const formatData = thick.datalist.map((item, index) => {
        const value = (((<number>item - thick.mean) / thick.mean) * 100).toFixed(1)
        if (index === 119) {
          const zeroValue = (((<number>thick.datalist[0] - thick.mean) / thick.mean) * 100).toFixed(1)
          return [Number(zeroValue), 0]
        }
        return [Number(value), index]
      })
      frameData.value = { ...thick, datalist: formatData as Array<[number, number]>}
    }
  } catch {
    console.error('loop error get data from IPC');
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
      <div><p>{{ $t("annular.circle") }}<span style="margin-left: 20px;">ID: {{ frameData && frameData.frameId }}</span></p></div>
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