<script setup lang='ts'>
import { ref, watch } from 'vue'
import { useApiDataStore } from '@/store/polling-data.ts';
import SurveyingIcon from '@/components/icons/Surveying.vue';
import RotationIcon from '@/components/icons/Rotate.vue';
import Segmented from "./Segmented.vue";
import PositionIcon from '@/components/icons/Position.vue';

const store = useApiDataStore()
const posDetector = ref<number>(0)


watch(() => store.apiThickData.PosMm, (newVal) => {
    if (newVal) {
        posDetector.value = Number((newVal / store.apiThickData.PosLenMm * 100).toFixed(0))
    }
},
    {
        immediate: true
    }
)
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
                    <el-statistic :title="$t('control.position')" :value="store.apiThickData.PosMm">
                        <template #suffix>
                            <span class="unit">mm</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :title="$t('control.thickness')" :precision="1" :value="store.apiThickData.Thk">
                        <template #suffix>
                            <span class="unit">μm</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" :title="$t('control.move')" :value="store.apiThickData.Velocity">
                        <template #suffix>
                            <span class="unit">m/min</span>
                        </template>
                    </el-statistic>
                </el-col>

                <el-col :span="2">
                    <el-statistic group-separator="" title="AD" :value="store.apiThickData.AD" />
                </el-col>
                <el-col :span="2">
                    <el-statistic group-separator="" :title="$t('control.airAD')" :value="store.apiThickData.SampleAD" />
                </el-col>
                <el-col :span="1">
                    <div class="icon_box icon_rotation">
                        <el-icon :size="40" style="margin-top: 5px;">
                            <RotationIcon />
                        </el-icon>
                        <p class="isCW">{{ store.apiThickData.AngleOfRotation }}°</p>
                        <div class="deg">
                            <p>{{ store.apiThickData.IsRotationCW ? $t('horizon.forward') : $t('horizon.reverse')  }}</p>
                        </div>
                    </div>
                </el-col>
                <el-col :span="3" class="move_right">
                    <el-statistic :precision="1" :title="$t('control.rotate')" :value="store.apiThickData.ARoundTimeOfRotation">
                        <template #suffix>
                            <span class="unit">min/R</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :precision="1" :title="$t('horizon.speed')" :value="store.apiThickData.FilmVelocity">
                        <template #suffix>
                            <span class="unit">m/min</span>
                        </template>
                    </el-statistic>
                </el-col>
                <el-col :span="3">
                    <el-statistic :title="$t('horizon.filmWidth')" :value="store.apiThickData.Width">
                        <template #suffix>
                            <span class="unit">mm</span>
                        </template>
                    </el-statistic>
                </el-col>

            </el-row>
        </div>
        <div class="control">
            <div class="progress">
                <el-progress :text-inside="true" :show-text="false" :duration="20" striped-flow
                    :percentage="posDetector" :stroke-width="20"
                    :striped="store.apiThickData.ControllerState !== 'FIX'">
                    <span>
                        <el-icon>
                            <PositionIcon />
                        </el-icon> {{ store.apiThickData.PosMm }} mm
                    </span>
                </el-progress>
            </div>
            <Segmented />
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

.control {
    display: flex;
    margin-top: 15px;
    align-items: center;

    .progress {
        flex: 1;
        margin-right: 30px;
    }
}

.move_right {
    padding-left: 15px;
}

.unit {
    font-size: 13px;
}
.icon_rotation {
    position: relative;
    .deg, .isCW {
        position: absolute;
        border-radius: 3px;
        text-align: center;
    }
    .deg {
        top: -10px;
        color: #fff;
        font-size: 12px;
        text-align: center;
        width: 100%;
        left: -5px;
        p {
            display: inline-block;
            background-color: #409EFF;
            padding: 1px 4px;
        }
    }
    .isCW {
        bottom: -15px;
        padding: 1px 0;
        min-width: 42px;
        font-size: 13px;
    }
}
</style>