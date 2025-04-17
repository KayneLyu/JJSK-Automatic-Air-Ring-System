<script setup lang='ts'>
import StateComponent from './State.vue';
import SigmaCharts from './SigmaCharts.vue';
import RelationCharts from './RelationCharts.vue';
import CharsOperate from '@/components/CharsOperate.vue';
import SigmaInfo from './SigmaInfo.vue';
import FrameInfo from './frame-info.vue';

</script>

<template>
  <div class="control_main">
    <div class="state-charts">
      <StateComponent />
    </div>
    <div class="operate-charts">
      <CharsOperate />
    </div>
    <div class="sigma-charts">
      <el-card class="sigma_charts_content">
        <SigmaCharts />
      </el-card>

      <el-card>
        <SigmaInfo />
      </el-card>
    </div>
    <div class="frame-info">
      <FrameInfo />
    </div>
    <div class="relation-charts">
      <el-card class="relation_content">
          <RelationCharts />
      </el-card>

      <el-card>
        <SigmaInfo />
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
  .sigma_charts_content {
    flex: 1;
    margin-right: 6px;
  }
  :deep(.el-card__body) {
    padding: unset;
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