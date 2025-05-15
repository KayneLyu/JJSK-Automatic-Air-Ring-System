<script setup lang='ts'>
import { onMounted } from 'vue';
import useOperateCharts from '@/hooks/useOperateCharts';
import StateComponent from './State.vue';
import SigmaCharts from './SigmaCharts.vue';
import RelationCharts from './RelationCharts.vue';
import CharsOperate from '@/components/CharsOperate.vue';
import SigmaInfo from './SigmaInfo.vue';
import FrameInfo from './frame-info.vue';

const { 
  sigmaDataList,
  currentId,
  queryDataList,
  currentIndex,
  lastFrameId,
  getTrendDataList, 
  nextPageQuery,
  changeStep  
} = useOperateCharts();

const getQueryData = (msg: any) => {
  console.log('msg', msg);
};
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
      <FrameInfo />
    </div>
    <div class="relation-charts">
      <el-card class="relation_content">
          <RelationCharts />
      </el-card>

      <el-card>
        <!-- <SigmaInfo /> -->
      </el-card>
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

  .thick_info {
    height: 40px;
    border-bottom: 1px solid #333;
    margin-bottom: 10px;
  }

  .charts {
    flex: 1;
    width: 100%;
  }
}
.frame-info {
  margin: 6px 0;
}
</style>