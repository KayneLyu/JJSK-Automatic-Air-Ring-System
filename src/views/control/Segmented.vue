
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
watch(() => store.apiData.ControllerState, () => {
    console.log('aaa');
})
</script>

<template>
    <div>
        <el-segmented v-model="store.apiData.ControllerState" :options="options" block>
            <template #default="{ item }">
                <div class="">
                    <div>{{ (item as Option).label }}</div>
                    <!-- <div>{{ $t(`${(item as Option).label}`) }}</div> -->
                </div>
            </template>
        </el-segmented>
    </div>
</template>

<style scoped lang="less">

</style>
