
<script lang="ts" setup>
import { ref } from 'vue'
import { useApiDataStore  } from '@/store/polling-data';
import { startMeasuring, stopMeasuring, toTheEdge } from '@/api';

const store = useApiDataStore()
type Option = {
    label: string;
    value: string;
}
const value = ref('FIX')

const options: Option[] = [
    {
        label: '测量',
        value: 'SCAN',
    },
    {
        label: "停止",
        value: "FIX"
    },
    {
        label:  "归边",
        value: "ORG"
    }
]
const changeState = async (options: string) => {
    try {
        switch (options) {
            // 归零
            case 'SCAN':
                await startMeasuring()
                break;
            // 扫描
            case 'FIX':
                await stopMeasuring()
                break;
            // 正行
            case 'ORG':
                await toTheEdge()
                break;
            default:
                break;
        }
    } catch (error) {
    }
}
</script>

<template>
    <div class="controls_container">
        <el-segmented @change="changeState" style="height: 45px;" v-model="store.apiThickData.ControllerState" :options="options" block size="large">
            <template #default="{ item }">
                <div>
                    <div>{{ (item as Option).label }}</div>
                </div>
            </template>
        </el-segmented>
    </div>
</template>

<style scoped lang="less">
.controls_container {
    width: 300px;
    border: 1px solid #c1c1c1;
    border-radius: 5px;
}
</style>
