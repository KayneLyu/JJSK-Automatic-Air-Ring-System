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
        <div class="content_status">
            <div  class="status">
                <span>测厚仪: </span>
                <p v-if="store.apiThickData.ControllerState !== 'FIX'"><el-tag size="small"  type="success">运行中</el-tag></p>
                <p v-else><el-tag size="small" type="danger">已停止</el-tag> </p>
            </div>

            <div class="status" style="margin-left: 30px;">
                <span>自动风环: </span>
                <p v-if="store.apiAirRingData.IsAuto"><el-tag size="small"  type="success">自动中</el-tag></p>
                <p v-else><el-tag size="small" type="danger">手动</el-tag> </p>
            </div>
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
.content_status {
    display: flex;
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
        border-right: 2px solid #cdcdcd90;
    }
}
</style>