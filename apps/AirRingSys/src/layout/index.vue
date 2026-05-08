<script setup lang='ts'>
import { watch, ref, onBeforeUnmount } from 'vue';
import { useApiDataStore } from '@/store/polling-data.ts';
import { useTempStore } from '@/store/temp.ts';
import { useFrameStore } from '@/store/frame.ts';
import { db } from "@/utils/dexie.ts";
import { getFrame, UploadThickness, getHeats } from "@/api";
import { formatFrameData } from '@/utils/format-data.ts';
import { useTimeoutFn } from '@vueuse/core'
import { formatTempList } from '@/utils/ChartsData.ts';
import HeaderComponent from './header/index.vue';
import MenuComponent from './menu/index.vue';
import ContentComponent from './content/index.vue';

const store = useApiDataStore();
const tempStore = useTempStore();
const frameStore = useFrameStore();

const meanValue = ref(0);

watch(() => store.apiThickData.LastScanDataId, async() => {
    const data = await getFrame(null)
    const heats = await getHeats()
    if (data) {
        const formatValue = formatFrameData(data)
        // 拿到平均值给即时数据
        meanValue.value = formatValue.mean
        const id = await db.Frame.put(formatValue)
        await db.Heats.put({
            frameId:id,
            heats: heats
        })
        frameStore.updateFrameId = id
        frameStore.meanValue = formatValue.mean
    }
},
    {
        immediate: true
    }
);

// 存储即时数据
const getTempFrameData = async () => {
    try {
        const result = await UploadThickness()
        if (result.D.length) {
            const tempData = formatTempList(result.D, meanValue.value)
            tempStore.updateTempData(tempData)
        }
    } catch (error) {
        console.log('getTempFrameData-err', error);
    }
}

const { start, stop } = useTimeoutFn(() => {
    getTempFrameData()
    start()
}, 2000)

watch(() => store.apiThickData.ControllerState, (newValue) => {
    if (newValue == 'FIX' || newValue == 'STOP') {
        stop()
        return
    } else {
        start()
    }
},
    {
        immediate: true
    }
)

onBeforeUnmount(() => {
    stop()
})

</script>

<template>
    <div class="layout">
        <HeaderComponent />
        <div class="layout_content">
            <div class="layout_menu">
                <MenuComponent />
            </div>
            <div class="layout_main">
                <div class="layout_views">
                    <ContentComponent />
                </div>

            </div>

        </div>
    </div>
</template>

<style scoped lang="less">
.layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.layout_content {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;

    .layout_menu {
        height: 100%;
    }

    .layout_main {
        flex: 1;
        min-height: 0;
        background-color: var(--clr);
        display: flex;
        flex-direction: column;

        .layout_views {
            flex: 1;
            min-height: 0;
        }

    }
}
</style>
