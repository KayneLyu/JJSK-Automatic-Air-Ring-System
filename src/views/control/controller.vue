<script setup lang='ts'>
import { computed } from 'vue';
import { useApiDataStore } from '@/store/polling-data';

</script>

<template>
  <el-card>
    <div class="control_container">

    </div>
  </el-card>
</template>

<style scoped lang="less">
.control_container {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 200px;
  height: 100%;
  box-sizing: border-box;
  padding: 10px;
}
.sigma_info {
  p {
    font-size: 14px;
    margin-bottom: 10px;
    b {
      font-size: 15px;
    }
  }
}
.effective_time {
  width: 100%;
  border-top: 1px solid #a9a9a990;
  padding-top: 10px;
  b {
    font-size: 16px;
  }
}
</style>