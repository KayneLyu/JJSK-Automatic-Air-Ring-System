<script setup lang='ts'>
import { ref, onMounted, computed, watch } from 'vue';
import useOperateCharts from '@/hooks/useOperateCharts';
import StateComponent from './states/State.vue';
import SigmaCharts from './sigma/SigmaCharts.vue';
import SigmaInfo from './sigma/SigmaInfo.vue';

import RelationCharts from './relations/RelationCharts.vue';
import CharsOperate from '@/components/CharsOperate.vue';
import FrameInfo from './relations/frame-info.vue';
import Controller from './controller.vue';

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

const currentChannel = ref<number[]>([])

const getCurrentChannel = async() => {
  // try {
  //   const result = await db.Heats.get(currentId.value)
  //   console.log('result', result, currentId.value);
    
  //   if(result && result.heats) {
  //     currentChannel.value = result?.heats
  //   }
  // } catch (error) {
    
  // }

}

const changeHeats = () => {
  if(currentChannel.value && currentChannel.value.length) {
    currentChannel.value = currentChannel.value.map( item => {
      return item += 10
    })
  }
}

onMounted(()=> {
  getTrendDataList()
})

</script>

<template>
  <div class="control_main">
    <div class="state-charts">
      <StateComponent />
    </div>
    <div class="operate-charts">
      <CharsOperate 
        :currentId="currentId"
        :last-frame-id="lastFrameId"
        :lastFrameIndex="queryDataList.length" 
        :current-index="currentIndex" 
        :changeStep="changeStep" 
        :next-page-query="nextPageQuery" 
        :get-trend-data-list="getTrendDataList" />
    </div>
    <div class="sigma-charts">
      <el-card class="sigma_charts_content">
        <SigmaCharts 
          :changeCurrentIndex="changeCurrentIndex"
          :currentIndex ="currentIndex"
          :frameData="sigmaDataList" 
          :currentId="currentId" 
          :start-date="queryDataList[0]?.endTime" 
          :end-date="queryDataList[queryDataList.length-1]?.endTime" 
        />
      </el-card>

      <SigmaInfo :sigma-list="sigmaDataList" />
    </div>
    <div class="frame-info">
      <FrameInfo :frame-data="currentFrame"/>
    </div>
    <div class="relation-charts">
      <el-card class="relation_content">
          <RelationCharts
            :isFreshData ="isFreshData" 
            :frame-data="<number[]>currentFrame?.datalist"
            :mean="currentFrame?.mean"
            :startDate="currentFrame?.startTime"
            :endDate="currentFrame?.endTime"
            :currentId="currentFrame?.frameId"
          />
      </el-card>
      <Controller 
        :addChannelValue="changeHeats"
      />
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
  height: 25%;
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
  // margin: 6px 0;
}
</style>