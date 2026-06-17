<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import type { FrameRow } from '@/types/ipc'
import { formateList } from '@/utils/ChartsData.ts'
import TempCharts from './TempCharts.vue'
import { useConfigStore } from '@/store/config.ts'
import { useFrameStore } from '@/store/frame.ts'

import HorizonCharts from './frame-charts/AreaCharts.vue'
import ThickInfo from '@/components/frame-info.vue'
import HeatState from './heats/HeatsFrame.vue'
import HeatsCardInfo from './heats/HeatsCard.vue'
import { getHeats } from '@/api'

function toThickData(row: FrameRow): IFrameThickData {
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

const store = useFrameStore()
const configStore = useConfigStore()

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
])

const beforeAutoMode = ref<IFrameThickData>({
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
})

let tempData = ref<[number, number | null][]>([])
let heatsChannel = ref<[string, number][]>([])

const getFrameList = async () => {
  try {
    const rows = await window.ipcApi.invoke('db-get-latest-frames', 4)
    if (rows.length) {
      for (let index = 0; index < rows.length; index++) {
        const thick = toThickData(rows[index])
        frameListData[rows.length - 1 - index] = {
          ...thick,
          datalist: <Array<[number, number]>>(
            formateList(thick.datalist, thick.mean)
          ),
        }
      }
    }
    const heatsData = await getHeats()
    if (heatsData) {
      const formatHeatsData: Array<[string, number]> = heatsData.map(
        (item, index) => {
          return [`${index + 1}`, item]
        }
      )
      heatsChannel.value = formatHeatsData
    }
  } catch {}
}

watch(
  () => store.updateFrameId,
  () => {
    getFrameList()
  },
  {
    immediate: true,
  }
)

const getBeforeAutoData = async () => {
  try {
    let result: IFrameThickData | undefined
    if (configStore.beforeAutoID) {
      const rows = await window.ipcApi.invoke(
        'db-get-frames-by-id',
        configStore.beforeAutoID,
        configStore.beforeAutoID
      )
      result = rows.length ? toThickData(rows[0]) : undefined
    } else {
      const rows = await window.ipcApi.invoke('db-get-latest-frames', 20)
      if (rows.length >= 20) {
        result = toThickData(rows[rows.length - 1])
      }
    }
    if (result) {
      beforeAutoMode.value = {
        ...result,
        datalist: <Array<[number, number]>>(
          formateList(result.datalist, result.mean)
        ),
      }
    }
  } catch {}
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
          <HorizonCharts
            is-before-auto
            :startDate="beforeAutoMode.startTime"
            :endDate="beforeAutoMode.endTime"
            :id="beforeAutoMode.frameId"
            :frameData="<Array<[number, number]>>beforeAutoMode.datalist"
          />
        </el-card>
      </div>
      <div class="info_card">
        <ThickInfo :thickInfo="beforeAutoMode" is-column />
      </div>
    </div>
    <div
      v-for="(frame, index) in frameListData"
      :key="index"
      class="charts_content"
    >
      <div class="chart_views">
        <el-card class="chartBox">
          <TempCharts
            v-if="index == 3"
            :temp-list="tempData"
            :mean-val="frame.mean"
            :startDate="frame.startTime"
            :endDate="frame.endTime"
            :id="frame.frameId"
            :frameData="<Array<[number, number]>>frame.datalist"
          />

          <HorizonCharts
            v-else
            :startDate="frame.startTime"
            :endDate="frame.endTime"
            :id="frame.frameId"
            :frameData="<Array<[number, number]>>frame.datalist"
          />
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
