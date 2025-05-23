<script setup lang='ts'>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';
import {
  ArrowLeftBold,
  ArrowRightBold,
  Search,
  DArrowLeft,
  DArrowRight
} from '@element-plus/icons-vue'
import VerticalCharts from './charts.vue';
import { useDateFormat, useTimeoutFn } from '@vueuse/core';
import { showNotification } from '@/utils/index';
import { useFrameStore } from "@/store/frame";
import { useI18n } from 'vue-i18n';
import LatestIcon from "@/components/icons/Latest.vue";
// import FrameCharts from './frame.vue';

const { t } = useI18n()

const useFrame = useFrameStore()

const datePick = ref(new Date())
// 查询参数
const mixValue = ref(2)
const IntervalValue = ref(1)
// 选中的图幅ID
const currentFrameID = ref(0)
// tooltip
const frameIndex = ref(0)
const trendsCounts = ref(100)
//倒计时
const timeToLatest = ref(0)

// 趋势数据
const trendDataList = ref()
let trendData = ref<Array<[string, number][]>>([
])

const disabledDate = (time: Date) => {
  return time.getTime() > Date.now()
}

const trendInfo = ref({
  maxValue: 0,
  minValue: 0,
  meanValue: 0,
  min: 0,
  max: 0,
  startTime: '',
  endTime: ''
})

const oneFrameData = ref(
  {
    ID: 0,
    Avg: 0,
    Time: '',
    EndTime: '',
    DataBegin: 0,
    DataEnd: 0,
    min: 0,
    max: 0,
    minPercent: 0,
    maxPercent: 0,
    sigma: 0,
    sigmaPercent: 0,
    Thicks: [],
    mix: 0,
    FilmPosition: 0,
    FilmWidth: 0,
    speed: 0
  })

const getCurrentFrame = null


</script>

<template>
  <div class="vertical">
    <el-card class="behavior_container">

    </el-card>
    <div class="vertical_charts">
      <el-card class="charts_container">
        <VerticalCharts :frameIndex :frameID="currentFrameID" :trend-info="trendInfo" :frameData="trendData"
          :handleCurrent="getCurrentFrame" />
      </el-card>
    </div>

    <div class="detail_charts">
      <el-card class="charts_container">
        <FrameCharts :frame-data="oneFrameData" />
      </el-card>
    </div>
  </div>
</template>

<style scoped lang="less">
.vertical {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.behavior_container {
  width: 100%;

  :deep(.el-card__body) {
    display: flex;
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    justify-content: space-between;
  }

  .input_container,
  .next_page {
    margin-left: 10px;

    span {
      margin-right: 5px;
      font-size: 16px;
    }
  }
}

.date_picker {
  display: flex;
}

.vertical_charts {
  flex: 1;
  margin-top: 10px;
}

.charts_container {
  height: 100%;

  :deep(.el-card) {
    height: 100%;
  }

  :deep(.el-card__body) {
    height: 100%;
    box-sizing: border-box;
    padding: 15px;
  }
}

.detail_charts {
  margin-top: 10px;
  height: 25%;
}
</style>