<script setup lang='ts'>
defineProps<{
    frameData: IFrameThickData
}>()
</script>

<template>
    <div>
        <div class="value_item">
            <p>平均值: <span>{{ frameData?.mean }} </span> μm</p>
            <p>2σ: <span>{{ frameData?.sigmaPercent }}</span> %</p>
            <p>最大值: <span>{{ frameData?.maxPercent }}</span> %</p>
            <p>最小值: <span>{{ frameData?.minPercent }}</span> %</p>
            <p>生产速度: <span>{{ frameData?.speed }}</span> m/min</p>
            <p>博膜宽度: <span>{{ frameData?.width }} </span> mm</p>
        </div>
    </div>
</template>

<style scoped lang="less">
.value_item {
    display: flex;
    justify-content: space-between;
    height: 50px;
    background-color: var(--color-tool-btn-bg);
    align-items: center;
    padding: 0 6px;
    box-sizing: border-box;
    p {
        min-width: 120px;
        font-size: 14px;
        span {
            font-weight: 700;
            font-size: 14px;
        }
    }
}
</style>