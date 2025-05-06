<script setup lang='ts'>
import { useConfigStore } from '@/store/config';
import { useApiDataStore } from '@/store/polling-data';

const store = useConfigStore()
const configStore = useApiDataStore()

</script>

<template>
    <div class="heats_info">
        <p class="tittle">风环通道值:</p>
        <p>1# 通道角度: <b>{{ configStore.apiAirRingConfig.ChannelNo1Angle }}°</b></p>
        <p style="margin: 6px 0;">通道数量: <span>{{ configStore.apiAirRingConfig.ChannelCnt }}</span> </p>
        <p >基础调节量: <span>{{ configStore.apiAirRingConfig.BaseHeat }}%</span></p>
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
p {
    display: flexbox;
    font-size: 14px;
    b {
        padding: 2px;
        border-radius: 3px;
        background: #409EFF;
        color: #fff;
    }
    span {
        font-weight: 700;
    }
}
</style>