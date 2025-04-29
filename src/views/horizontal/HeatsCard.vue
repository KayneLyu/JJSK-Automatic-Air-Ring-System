<script setup lang='ts'>
import { useConfigStore } from '@/store/config';

const store = useConfigStore()

</script>

<template>
    <div class="heats_info">
        <p>风环通道</p>
        <p>以百分比显示: <el-switch v-model="store.showPercent"></el-switch> </p>
        <p>超出公差标记: <el-switch v-model="store.showPercent"></el-switch> </p>
    </div>
</template>

<style scoped lang="less">
.heats_info {

}
</style>