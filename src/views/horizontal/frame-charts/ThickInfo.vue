<script setup lang='ts'>
import { useConfigStore } from '@/store/config';

const store = useConfigStore()

const props = defineProps<{
    thickInfo: IFrameThickData
}>()
</script>

<template>

    <div v-if="store.showPercent" class="thick-info">
        <p>平均值: <span>{{ thickInfo.mean }}</span> μm</p>
        <p>2σ(2*sigma): <span>{{ thickInfo.sigmaPercent.toFixed(1) }}<i>%</i></span></p>
        <p>最大值: <span>{{ thickInfo.maxPercent.toFixed(1)}}<i>%</i> </span> </p>
        <p>最小值: <span>{{ thickInfo.minPercent.toFixed(1) }}<i>%</i> </span> </p>
        <p>生产速度: <span>{{ thickInfo.speed  }} <i>m/min</i> <b>{{ `${thickInfo.IsBackw ? '反':'正'}` }}</b></span> </p>
        <p>薄膜宽度: <span>{{ thickInfo.width }} <i>mm</i></span> </p>
    </div>
    <div v-else class="thick-info">
        <p>平均值: <span>{{ thickInfo.mean }}</span> μm</p>
        <p>2σ(2*sigma): <span>{{ thickInfo.sigmaVal }} <i>um</i></span></p>
        <p>最大值: <span>{{ thickInfo.maxVal }} <i>μm</i></span> </p>
        <p>最小值: <span>{{ thickInfo.minVal  }} <i>μm</i></span> </p>
        <p>生产速度: <span>{{ thickInfo.speed  }} <i>m/min</i> <b>{{ `${thickInfo.IsBackw ? '反':'正'}` }}</b></span> </p>
        <p>薄膜宽度: <span>{{ thickInfo.width }} <i>mm</i></span> </p>
    </div>
</template>

<style scoped lang="less">
.thick-info {
    box-sizing: border-box;
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    height: 100%;
    width: 100%;

    p {
        flex: 1;
        font-size: 13px;
        display: flexbox;
        padding-left: 5px;
        span {
            font-size: 14px;
            font-weight: 700;

            i {
                font-weight: 500;
                font-size: 13px;
                font-style: normal;
            }
            b {
                font-size: 13px;
               padding: 2px;
               background-color: #409EFF;
               border-radius: 3px; 
               color: #fff;
            }
        }
    }
}
</style>