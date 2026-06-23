<script setup lang="ts">
defineProps<{
  currentAD: number
  measurePosition: number
  productionSpeed: string
  thickness: string
  bubbleChange: string
}>()
</script>

<template>
  <el-card class="status-card" shadow="never">
    <div class="status-row">
      <div class="status-item">
        <span class="label">当前AD:</span>
        <span class="value" style="width: 100px">{{ currentAD }}</span>
      </div>
      <div class="status-item">
        <span class="label">测量位置:</span>
        <span class="value">{{ measurePosition }}</span>
      </div>
      <div class="status-item">
        <span class="label">生产速度:</span>
        <span class="value">{{ productionSpeed }}</span>
      </div>
      <div class="status-item">
        <span class="label">厚度:</span>
        <span class="value">{{ thickness }} um</span>
      </div>
      <div class="status-item">
        <span class="label">膜泡折变:</span>
        <span class="value">{{ bubbleChange }}</span>
      </div>
    </div>
  </el-card>
</template>

<style scoped lang="less">
.status-card {
  flex-shrink: 0;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-item .label {
  color: #606266;
  font-size: 14px;
}

.status-item .value {
  color: #303133;
  font-weight: 600;
  font-size: 15px;
}
</style>
