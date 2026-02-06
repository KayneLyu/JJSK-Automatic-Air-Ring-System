
<script lang="ts" setup>
import { useApiDataStore  } from '@/store/polling-data';
import { startMeasuring, stopMeasuring, forwardsThick, toTheEdge } from '@/api';

const store = useApiDataStore()
type Option = {
    label: string;
    value: string;
}
const options: Option[] = [
    {
        label: "control.scan",
        value: 'SCAN',
    },
    {
        label: "control.stop",
        value: "FIX"
    },
    {
        label: "control.reverse",
        value: "ORG"
    },
    {
        label: "control.forward",
        value: "RUNNING"
    },
    // {
    //     label:  "归边",
    //     value: "ORG"
    // }
]
const changeState = async (options: string) => {
    try {
        switch (options) {
            // 扫描
            case 'SCAN':
                await startMeasuring()
                break;
            // 停止
            case 'FIX':
                await stopMeasuring()
                break;
            // 正行
            case 'RUNNING':
                await forwardsThick()
                break;
            // 反行
            case 'ORG':
                await toTheEdge()
                break;


            // case 'ORG':
            //     await toTheEdge()
            //     break;
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
                    <div>{{ $t(`${(item as Option).label}`) }}</div>
                </div>
            </template>
        </el-segmented>
    </div>
</template>

<style scoped lang="less">
.controls_container {
    width: 350px;
    border: 1px solid #c1c1c1;
    border-radius: 5px;
}
</style>
