<script setup lang='ts'>
import { ref } from 'vue';
import CharsOperate from "@/components/CharsOperate.vue";
import useOperateCharts from '@/hooks/useOperateCharts';
import VerticalCharts from './vertical-charts.vue';
import FrameInfo from '@/components/frame-info.vue';
import FrameCharts from './frame-charts.vue';

const {
  sigmaDataList,
  currentId,
  queryDataList,
  currentIndex,
  lastFrameId,
  currentFrame,
  meanDataList,
  isFreshData,
  getTrendDataList,
  nextPageQuery,
  changeStep,
  changeCurrentIndex
} = useOperateCharts();

const trendInfo = ref({
  maxValue: 0,
  minValue: 0,
  meanValue: 0,
  min: 0,
  max: 0,
  startTime: '',
  endTime: ''
})

</script>

<template>
  <div class="vertical">
    <CharsOperate :currentId="currentId" :isFreshData="isFreshData" :last-frame-id="lastFrameId"
      :lastFrameIndex="queryDataList.length" :current-index="currentIndex" :changeStep="changeStep"
      :next-page-query="nextPageQuery" :get-trend-data-list="getTrendDataList" />
    <div class="vertical_charts">
      <el-card class="charts_container">
        <VerticalCharts :frameIndex="currentIndex" :frameID="currentId" :trend-info="trendInfo"
          :sigma-data="sigmaDataList" 
          :frameData="meanDataList" 
          :handleCurrent="changeCurrentIndex" 
          :start-date="queryDataList[0]?.date"
          :end-date="queryDataList[queryDataList.length - 1]?.date"
          />
      </el-card>
    </div>

    <div class="detail_charts">
      <div style="height: 50px; line-height: 50px;">
        <FrameInfo :thick-info="currentFrame" />
      </div>
      <el-card class="charts_container">
        <FrameCharts 
          :currentId="currentFrame?.id"
          :endDate="currentFrame?.date"
          :frameData="currentFrame?.dataList"
          :mean="currentFrame?.meanValue"
        />
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
    padding: 10px;
  }
}

.detail_charts {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  height: 28%;

}
</style>