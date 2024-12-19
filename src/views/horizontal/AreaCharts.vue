<script setup lang='ts'>
import { ref } from 'vue';
import * as echarts from 'echarts/core';
import { 
    GridComponent,
    TitleComponentOption,
    TooltipComponentOption,
    GridComponentOption,
    DatasetComponentOption, 
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import type { EChartsCoreOption } from 'echarts/core';

type ECOption = echarts.ComposeOption<
    | TitleComponentOption
    | TooltipComponentOption
    | GridComponentOption
    | DatasetComponentOption
>;

echarts.use([
    GridComponent, 
    LineChart, 
    CanvasRenderer, 
    UniversalTransition
]);

let option: ECOption = {
    animation: false,
    xAxis: {
        type: 'category',
        boundaryGap: false,
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    },
    yAxis: {
        type: 'value'
    },
    series: [
        {
            data: [820, 932, 901, 934, 1290, 1330, 1320],
            type: 'line',
            areaStyle: {}
        }
    ]
};

const chartContainer = ref<HTMLElement | null>(null)
useChartsInit('chartContainer', option)

</script>

<template>
    <el-card class="chartBox">
        <div class="chartContainer" ref="chartContainer" style="width: 100%; height: 400px"></div>
    </el-card>
</template>

<style scoped>
.chartBox {
    width: 90%;
}

.chartContainer {
    border-radius: 5px;
    overflow: hidden;
    /* box-sizing: border-box; */
}
</style>