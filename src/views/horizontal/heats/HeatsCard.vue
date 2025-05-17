<script setup lang='ts'>
import { useConfigStore } from '@/store/config';
import { useApiDataStore } from '@/store/polling-data';
import dayjs from 'dayjs';

const store = useConfigStore()
const configStore = useApiDataStore()

</script>

<template>
    <div class="heats_info">
        <p>1# 通道角度: <b>{{ configStore.apiAirRingConfig.ChannelNo1Angle }}°</b></p>
        <p style="margin: 6px 0;">通道数量: <span>{{ configStore.apiAirRingConfig.ChannelCnt }}</span> </p>
        <p >基础调节量: <span>{{ configStore.apiAirRingConfig.BaseHeat }}%</span></p>
        <p style="margin-top: 6px;">厚度起效时间: <span>{{ configStore.apiAirRingData.StableTime && dayjs(configStore.apiAirRingData.StableTime).format('HH:mm:ss') }}</span></p>
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
    margin-bottom: 10px;
}
p {
    display: flexbox;
    font-size: 14px;
    &:first-of-type {
        margin-top: 10px;
    }
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