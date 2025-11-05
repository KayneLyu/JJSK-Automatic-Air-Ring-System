<script setup lang='ts'>
import { ref } from 'vue';
import useOperateCharts from '@/hooks/useOperateCharts';
// import StateComponent from './states/State.vue';
import SigmaCharts from './sigma/SigmaCharts.vue';
import SigmaInfo from './sigma/SigmaInfo.vue';

import RelationCharts from './relations/RelationCharts.vue';
import CharsOperate from '@/components/CharsOperate.vue';
import FrameInfo from '@/components/frame-info.vue';
import Controller from './control/index.vue';

const {
  sigmaDataList,
  currentId,
  queryDataList,
  currentIndex,
  lastFrameId,
  currentFrame,
  isFreshData,
  getTrendDataList,
  nextPageQuery,
  changeStep,
  changeCurrentIndex
} = useOperateCharts();

const relationRef = ref<InstanceType<typeof RelationCharts> | null>(null)

// // 全升、全降
// const changeHeats = (isReset: boolean, isUp?: boolean) => {
//   if (!relationRef.value) return;
//   relationRef.value.changeAllChannel(isReset, isUp);
// }

// // 调整通道值、对位
// const changeCurrentIndexHeats = (counterpoint: boolean, isUp?: boolean) => {
//     if (!relationRef.value) return;
//     if (!counterpoint && relationRef.value.brushList.length === 0) {
//         console.warn('没有选取通道');
//         return;
//     }
//     // 统一调用方法
//     relationRef.value.changeSomeChannel(counterpoint, isUp);
// };

// // 取消
// const cancelChange = () => {
//   if (!relationRef.value) return;
//     relationRef.value.getChannelHandle()
// }

// // 应用
// const applyHeats = async () => {
//   if (!relationRef.value) return;
//   await relationRef.value.setChannelHeats()
//   await relationRef.value.getChannelHandle()
// }
// // 获取最新通道值
// const getChannelHandle = async () => {
//   if (!relationRef.value) return;
//   relationRef.value.getChannelHandle()
// }

</script>

<template>
  <div class="control_main">
    <div class="state-charts">
      <!-- <StateComponent /> -->
    </div>
    <div class="operate-charts">
      <CharsOperate :currentId="currentId" :isFreshData="isFreshData" :last-frame-id="lastFrameId" :lastFrameIndex="queryDataList.length"
        :current-index="currentIndex" :changeStep="changeStep" :next-page-query="nextPageQuery"
        :get-trend-data-list="getTrendDataList" />
    </div>
    <div class="sigma-charts">
      <el-card class="sigma_charts_content">
        <SigmaCharts :changeCurrentIndex="changeCurrentIndex" :currentIndex="currentIndex" :frameData="sigmaDataList"
          :currentId="currentId" 
          :start-date="queryDataList[0]?.date"
          :end-date="queryDataList[queryDataList.length - 1]?.date" />
      </el-card>

      <SigmaInfo :sigma-list="sigmaDataList" />
    </div>
    <div class="frame-info">
      <FrameInfo :thick-info="currentFrame" />
    </div>
    <div class="relation-charts">
      <el-card class="relation_content">
        <RelationCharts ref="relationRef" :isFreshData="isFreshData" :frame-data="currentFrame?.dataList"
           :startDate="currentFrame?.date" :endDate="currentFrame?.date"
          :currentId="currentFrame?.id" />
      </el-card>
      <Controller />
    </div>
  </div>
</template>

<style scoped lang="less">
.control_main {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.operate-charts {
  display: flex;
  margin: 6px 0;
}

.controls {
  display: flex;
  align-items: center;
}

.sigma-charts {
  display: flex;
  height: 28%;

  .sigma_charts_content {
    flex: 1;
    margin-right: 6px;
  }

  :deep(.el-card__body) {
    padding: unset;
    height: 100%;
  }
}

.relation-charts {
  flex: 1;
  display: flex;

  .relation_content {
    flex: 1;
    margin-right: 6px;
  }

  :deep(.el-card__body) {
    width: 100%;
    padding: unset !important;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .charts {
    flex: 1;
    width: 100%;
  }
}

.frame-info {
  margin-top: 6px;
  height: 50px;
  line-height: 50px;
  // margin: 6px 0;
}
</style>