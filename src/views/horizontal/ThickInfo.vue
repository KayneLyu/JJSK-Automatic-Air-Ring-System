<script setup lang='ts'>

</script>

<template>
    <div class="thick-info">
        <p>平均值: <span>{{70}}</span> μm</p>
        <p>2σ(2*sigma): <span>{{"5"}}%</span></p>
        <p>最大值: <span>80</span> um</p>
        <p>最小值: <span>60</span> um</p>
        <p>薄膜宽度: <span>1800</span> mm</p>
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
        span {
            font-size: 16px;
            font-weight: 700;
        }
    }
}
</style>