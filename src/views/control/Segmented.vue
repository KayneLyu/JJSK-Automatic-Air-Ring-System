
<script lang="ts" setup>
import { ref, watch } from 'vue'
import { useApiDataStore  } from '@/store/polling-data';

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
watch(() => store.apiThickData.ControllerState, () => {
    console.log('aaa');
})
</script>

<template>
    <div class="controls_container">
        <el-segmented style="height: 45px;" v-model="store.apiThickData.ControllerState" :options="options" block size="large">
            <template #default="{ item }">
                <div class="">
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
