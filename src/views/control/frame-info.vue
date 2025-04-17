<script setup lang='ts'>
 
</script>

<template>
 <div> 
    <el-card class="card_content">
        <div class="value_item">
            <p>2σ: <span>44.4 μm</span></p>
            <p>平均值: <span>44.4 μm</span></p>
            <p>最大值: <span>3%</span></p>
            <p>最小值: <span>3%</span></p>
            <p>博膜宽度: <span>1260 mm</span></p>
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
    }
 }
</style>