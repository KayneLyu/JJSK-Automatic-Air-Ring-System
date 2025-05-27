<script setup lang='ts'>
 defineProps<{
    frameData: IFrameThickData
 }>()
</script>

<template>
 <div> 
    <el-card class="card_content">
        <div class="value_item">
            <p>平均值: <span>{{frameData?.mean}} </span> μm</p>
            <p>2σ: <span>{{frameData?.sigmaPercent}}</span> %</p>
            <p>最大值: <span>{{frameData?.maxPercent}}</span> %</p>
            <p>最小值: <span>{{frameData?.minPercent}}</span> %</p>
            <p>生产速度: <span>{{frameData?.speed}}</span> m/min</p>
            <p>薄膜宽度: <span>{{frameData?.width}} </span> mm</p>
        </div>
    </el-card>
 </div>
</template>

<style scoped lang="less">
 .card_content {
    width: 100%;
    height: 50px;
    .value_item {
        display: flex;
        justify-content: space-between;
        p {
            min-width: 120px;
            font-size: 14px;
            span {
                font-weight: 700;
                font-size: 14px;
            }
        }
    }
 }
</style>