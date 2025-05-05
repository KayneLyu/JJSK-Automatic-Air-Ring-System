<script setup lang='ts'>
import { useConfigStore } from '@/store/config';
import { useApiDataStore } from '@/store/polling-data';

const store = useConfigStore()
const configStore = useApiDataStore()

</script>

<template>
    <div class="heats_info">
        <p class="tittle">风环通道值</p>
        <p>通道数量: {{ configStore.apiAirRingConfig.ChannelCnt }}</p>
        <p>1# 通道角度: {{ configStore.apiAirRingConfig.ChannelNo1Angle }}°</p>
        <!-- <p>以百分比显示: <el-switch v-model="store.showPercent"></el-switch> </p> -->
        <!-- <p>超出公差标记: <el-switch v-model="store.markOverValue"></el-switch> </p> -->
    </div>
</template>

<style scoped lang="less">
.heats_info {
    padding: 5px;
    box-sizing: border-box;
}
.tittle {
    margin-bottom: 20px;
}
</style>