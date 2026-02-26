<script setup lang='ts'>
import { useApiDataStore } from '@/store/polling-data';
import RotationIcon from '@/components/icons/Rotate.vue';
import Segmented from "./Segmented.vue";
import ChartsCircle from './charts.vue';
import GaugeState from "./gauge.vue";

const store = useApiDataStore()

</script>

<template>
    <el-card class="state_card">
        <div class="state_content">
            <div class="charts_state">
                <ChartsCircle />
            </div>
            <div>
                <GaugeState />
            </div>
            <div class="state_info">
                <div class="content">
                    <el-row>
                        <el-col :span="2">
                            <div class="icon_box icon_rotation">
                                <el-icon :size="40" style="margin-top: 5px;">
                                    <RotationIcon />
                                </el-icon>
                                <!-- <p class="isCW">{{ store.apiThickData.AngleOfRotation }}°</p> -->
                                <div class="deg">
                                    <p>{{ store.apiThickData.IsCW ? $t('horizon.forward') :
                                        $t('horizon.reverse') }}
                                    </p>
                                </div>
                            </div>
                        </el-col>
                        <el-col :span="5" class="move_right">
                            <el-statistic v-if="store.apiThickData.IsRotaryOn" :precision="1" :title="$t('control.rotate')"
                                :value="store.apiThickData.MinuteOfR ">
                                <template #suffix>
                                    <span class="unit">min/R</span>
                                </template>
                            </el-statistic>
                            <el-statistic v-else title="旋转停止" >
                                <template #suffix>
                                    <span class="unit">min/R</span>
                                </template>
                            </el-statistic>
                        </el-col>

                        <el-col :span="5">
                            <el-statistic :precision="0" :title="$t('horizon.filmWidth')" :value="store.apiThickData.FilmWidth">
                                <template #suffix>
                                    <span class="unit">mm</span>
                                </template>
                            </el-statistic>
                        </el-col>
                        <el-col :span="5">
                            <el-statistic :title="$t('horizon.biasDeg')" :value="store.apiThickData.BubbleBiasDeg ">
                                <template #suffix>
                                    <span class="unit">°</span>
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