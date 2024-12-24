<script setup lang='ts'>

</script>

<template>
    <el-card>
        <div class="content">
            <el-row>
                <el-col :span="6">
                    <el-statistic title="测量位置 (mm)" :value="268500" />
                </el-col>
                <el-col :span="6">
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
                        <!-- <template #suffix>/100</template> -->
                    </el-statistic>
                </el-col>
                <el-col :span="6">
                    <el-statistic title="移动速度(m/min)" :value="100" />
                </el-col>
                <el-col :span="6">
                    <el-statistic title="采集值" :value="562">
                        <template #suffix>
                            <el-icon style="vertical-align: -0.125em">
                                <!-- <ChatLineRound /> -->
                            </el-icon>
                        </template>
                    </el-statistic>
                </el-col>
            </el-row>
            <el-progress :duration="10" striped-flow :percentage="50" :stroke-width="15" striped />
        </div>
    </el-card>
</template>

<style scoped></style>