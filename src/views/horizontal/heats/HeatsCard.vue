<script setup lang='ts'>
import { useApiDataStore } from '@/store/polling-data';
import dayjs from 'dayjs';

const configStore = useApiDataStore()
</script>

<template>
    <div class="heats_info">
        <p>1# {{ $t("horizon.deg") }}: <b>{{ configStore.KPEData.rotation }}°</b></p>
        <p style="margin: 6px 0;">{{ $t("horizon.channelNum") }}: <span>{{ configStore.KPEData.data.length }}</span> </p>
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