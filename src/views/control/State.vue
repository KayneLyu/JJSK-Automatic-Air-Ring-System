<script setup lang='ts'>
import { ref } from 'vue'
import { useApiDataStore } from '@/store/polling-data';
import SurveyingIcon from '@/components/icons/Surveying.vue';
import RotationIcon from '@/components/icons/Rotate.vue';
const store = useApiDataStore()

</script>

<template>
    <el-card class="state_card">
        <div class="content">

            <el-row>
                <el-col :span="1">
                    <div class="icon_box">
                        <el-icon :size="40">
                            <SurveyingIcon />
                        </el-icon>
                    </div>
                </el-col>

                <el-col :span="3" class="move_right">
                    <el-statistic title="测量位置 (mm)" :value="store.apiThickData.PosMm" />
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" :value="store.apiThickData.Thk">
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
                    <el-statistic :precision="1" title="移动速度(m/min)" :value="store.apiThickData.Velocity" />
                </el-col>

                <el-col :span="3">
                    <el-statistic group-separator="" title="采集值" :value="store.apiThickData.AD">
                        <template #suffix>
                            <el-icon style="vertical-align: -0.125em">
                            </el-icon>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="1">
                    <div class="icon_box icon_rotation">
                        <el-icon :size="42">
                            <RotationIcon />
                        </el-icon>
                    </div>
                </el-col>
                <el-col :span="3" class="move_right">
                    <el-statistic :precision="1" title="旋转速度(min/R)" :value="100" />
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" title="生产速度(m/min)" :value="store.apiThickData.FilmVelocity" />
                </el-col>
                <el-col :span="3">
                    <el-statistic title="薄膜宽度(mm)" :value="store.apiThickData.Width" />
                </el-col>
            </el-row>
        </div>
        <div class="progress">
            <el-progress :show-text="false" :duration="20" striped-flow :percentage="store.apiThickData.PosDetector"
                :stroke-width="15" :striped="store.apiThickData.ControllerState !== 'FIX'" />
        </div>
    </el-card>
</template>

<style scoped lang="less">
.state_card {}

:deep(.el-card__body) {
    // width: 100%;
    padding: 15px;
}

.icon_box {
    height: 100%;
    display: flex;
    align-items: center;
}

.icon_rotation {
    // padding-left: 20px;
}

.progress {
    margin-top: 15px;
}
.move_right {
    padding-left: 15px;
}
</style>