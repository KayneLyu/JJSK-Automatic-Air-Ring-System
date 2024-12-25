<script setup lang='ts'>

</script>

<template>
    <el-card class="state_card">
        <div class="content">
            <el-row>
                <el-col :span="3">
                    <el-statistic title="测量位置 (mm)" :value="268500" />
                </el-col>
                <el-col :span="3">
                    <el-statistic :value="138">
                        <template #title>
                            <div style="display: inline-flex; align-items: center">
                                <!-- {{$t("layout.title")}} -->
                                 测量厚度 (μm)
                                <el-icon style="margin-left: 4px" :size="12">
                                    <!-- <Male /> -->
                                </el-icon>
                            </div>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic title="移动速度(m/min)" :value="100" />
                </el-col>
                
                <el-col :span="3">
                    <el-statistic title="采集值" :value="562">
                        <template #suffix>
                            <el-icon style="vertical-align: -0.125em">
                            </el-icon>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <div>
                        66
                    </div>
                </el-col>
                <el-col :span="3">
                    <el-statistic title="旋转速度(min/R)" :value="100" />
                </el-col>
                <el-col :span="3">
                    <el-statistic title="生产速度(m/min)" :value="100" />
                </el-col>
                <el-col :span="3">
                    <el-statistic title="薄膜宽度(mm)" :value="100" />
                </el-col>
            </el-row>
            <el-progress :duration="10" striped-flow :percentage="60" :stroke-width="15" striped />
        </div>
    </el-card>
</template>

<style scoped lang="less">
.state_card {
}
:deep(.el-card__body) {
   // width: 100%;
   padding: 15px;
}
</style>