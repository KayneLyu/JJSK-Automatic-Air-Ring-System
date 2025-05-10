<script setup lang='ts'>
import { useNow, useDateFormat } from "@vueuse/core";
import { useApiDataStore } from '@/store/polling-data';
import packageJson from "@/../package.json";

const now = useNow();
const newDate = useDateFormat(now, "YYYY-MM-DD HH:mm");

const store = useApiDataStore();
</script>

<template>
    <div class="footer_content">
        <div class="status">
            <span>自动风环: </span>
            <p v-if="store.apiAirRingData.IsAuto"><el-tag size="small"  type="success">自动中</el-tag></p>
            <p v-else><el-tag size="small" type="danger">手动</el-tag> </p>
        </div>
        <div class="version">
            <p>
                {{ newDate }}
            </p>
            <i>
                {{`v${packageJson.version}`}}
            </i>
        </div>
    </div>
</template>

<style scoped lang="less">
.footer_content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 22px;
    width: 100%;
    background-color: var(--menu-bg);
    border-left: 1px solid #9d9d9d17;
    font-size: 12px;
    box-sizing: border-box;
    padding: 0 10px;
}
.status {
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    span {
        margin-right: 2px;
    }
}
.version {
    display: flex;
    font-size: 13px;
    p {
        margin-right: 12px;
        height: 100%;
        padding: 0 20px;
        border-right: 2px solid #cdcdcd;
    }
}
</style>