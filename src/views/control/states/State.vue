<script setup lang='ts'>
import { ref, watch } from 'vue'
import { useApiDataStore } from '@/store/polling-data';
import RotationIcon from '@/components/icons/Rotate.vue';
import Segmented from "./Segmented.vue";
import ChartsCircle from './charts.vue';

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
        <div class="state_content">
            <div class="charts_state">
                <ChartsCircle />
            </div>
            <div class="state_info">
                <div class="content">
                    <el-row>
                        <el-col :span="2">
                            <div class="icon_box icon_rotation">
                                <el-icon :size="40" style="margin-top: 5px;">
                                    <RotationIcon />
                                </el-icon>
                                <p class="isCW">{{ store.apiThickData.AngleOfRotation }}°</p>
                                <div class="deg">
                                    <p>{{ store.apiThickData.IsRotationCW ? $t('horizon.forward') :
                                        $t('horizon.reverse') }}
                                    </p>
                                </div>
                            </div>
                        </el-col>
                        <el-col :span="5" class="move_right">
                            <el-statistic :precision="1" :title="$t('control.rotate')"
                                :value="store.apiThickData.ARoundTimeOfRotation">
                                <template #suffix>
                                    <span class="unit">min/R</span>
                                </template>
                            </el-statistic>
                        </el-col>
                        <el-col :span="4 ">
                            <el-statistic :precision="1" :title="$t('horizon.speed')"
                                :value="store.apiThickData.FilmVelocity">
                                <template #suffix>
                                    <span class="unit">m/min</span>
                                </template>
                            </el-statistic>
                        </el-col>
                        <el-col :span="4">
                            <el-statistic :title="$t('horizon.filmWidth')" :value="store.apiThickData.Width">
                                <template #suffix>
                                    <span class="unit">mm</span>
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
                    <Segmented />
                </div>
            </div>
        </div>
    </el-card>
</template>

<style scoped lang="less">
:deep(.el-card__body) {
    padding: 10px;
}

:deep(.el-row) {
    margin-top: 10px;
    justify-content: end;
}
.state_content {
    display: flex;
    height: 150px;
    .charts_state {
        width: 300px;
        height: 100%;
    }
    .state_info {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }
    .content {
        width: 100%;
    }
    .control {
        display: flex;
        justify-content: end;
        margin-right: 20px;
    }
}

.icon_box {
    height: 100%;
    display: flex;
    align-items: center;
}

.move_right {
    padding-left: 15px;
}

.unit {
    font-size: 13px;
}

.icon_rotation {
    position: relative;

    .deg,
    .isCW {
        position: absolute;
        border-radius: 3px;
        text-align: center;
    }

    .deg {
        top: -13px;
        color: #fff;
        font-size: 12px;
        text-align: center;
        width: 100%;
        left: -12px;

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