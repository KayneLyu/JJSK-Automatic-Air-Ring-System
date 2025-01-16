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
                    <el-statistic title="测量位置" :value="store.apiThickData.PosMm">
                        <template #suffix>
                            <span class="unit">mm</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic title="测量厚度" :precision="1" :value="store.apiThickData.Thk">
                        <template #suffix>
                            <span class="unit">μm</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" title="移动速度" :value="store.apiThickData.Velocity">
                        <template #suffix>
                            <span class="unit">m/min</span>
                        </template>
                    </el-statistic>
                </el-col>

                <el-col :span="2">
                    <el-statistic group-separator="" title="AD" :value="store.apiThickData.AD" />
                </el-col>
                <el-col :span="2">
                    <el-statistic group-separator="" title="空气AD" :value="store.apiThickData.AD" />
                </el-col>
                <el-col :span="1">
                    <div class="icon_box icon_rotation">
                        <el-icon :size="42">
                            <RotationIcon />
                        </el-icon>
                    </div>
                </el-col>
                <el-col :span="3" class="move_right">
                    <el-statistic :precision="1" title="旋转速度" :value="10">
                        <template #suffix>
                            <span class="unit">min/R</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" title="生产速度" :value="store.apiThickData.FilmVelocity" >
                        <template #suffix>
                            <span class="unit">m/min</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic title="薄膜宽度" :value="store.apiThickData.Width" >
                        <template #suffix>
                            <span class="unit">mm</span>
                        </template>
                    </el-statistic>
                </el-col>
                
            </el-row>
        </div>
        <div class="progress">
            <el-progress :show-text="false" :duration="20" striped-flow :percentage="store.apiThickData.PosDetector"
                :stroke-width="10" :striped="store.apiThickData.ControllerState !== 'FIX'" />
        </div>
    </el-card>
</template>

<style scoped lang="less">
:deep(.el-card__body) {
    padding: 10px;
}

.icon_box {
    height: 100%;
    display: flex;
    align-items: center;
}

.progress {
    margin-top: 15px;
}

.move_right {
    padding-left: 15px;
}

.unit {
    font-size: 13px;
}
</style>