<script setup lang='ts'>
import { watch } from 'vue';
import { useApiDataStore } from '@/store/polling-data';
import { useFrameStore } from '@/store/frame';
import { useProduct } from '@/store/product';
import { db } from "@/utils/dexie";
import { getVDPBaseData, getVDPProcess, getKPEThickData } from '@/api';
import { formateKunFrame } from "@/utils/format-data";

import HeaderComponent from './header/index.vue';
import MenuComponent from './menu/index.vue';
import ContentComponent from './content/index.vue';

const store = useApiDataStore();
const frameStore = useFrameStore();
const productStore = useProduct();

watch(() => store.VDPData.time, async () => {
    if (store.VDPData.targetTmdState !== "measuring_TD") return
    try {
        // VDP 测厚仪基础数据
        const baseData = await getVDPBaseData();
        // VDP process  测厚仪配置数据
        const process = await getVDPProcess()
        // // KPE 测厚仪数据
        const thickData = await getKPEThickData()
        if (baseData && process && thickData) {
            const { data, mean, date, time } = baseData.p[0][1]
            const { actDiameter } = process
            const { takeOffRotation } = thickData
            const endTime = date + ' ' + time
            const { max, min, maxPercent, minPercent, sigma, sigmaPercent } = formateKunFrame(data, mean)
            const meanVal = Number(mean.toFixed(1))
            let frameData = {
                dataList: data,
                meanValue: meanVal,
                max,
                min,
                maxPercent,
                minPercent,
                width: (Number(actDiameter) * 3.14 / 2).toFixed(1),
                date: endTime,
                rotation: takeOffRotation,
                sigma,
                sigmaPercent,
            }
            // 超出公差
            if (sigmaPercent > productStore.param.tolerance) {
                store.isOverFlow = true
            }
            if (endTime == frameStore.updateTime) return
            const id = await db.Frame.add(frameData)
            await db.Heats.put({
                time: endTime,
                heats: store.KPEData.data
            })
            frameStore.updateFrameId = id
            frameStore.meanValue = meanVal
            frameStore.updateTime = endTime
        }
    } catch (error) {
        console.log('Home get Frame-Data error =====>' + error);
    }
},
    {
        immediate: true
    }
);

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
    overflow: hidden;

    .layout_menu {
        height: 100%;
    }

    .layout_main {
        flex: 1;
        background-color: var(--clr);
        display: flex;
        flex-direction: column;

        .layout_views {
            flex: 1;
        }
    }
}
</style>
