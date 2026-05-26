<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
    TitleComponent,
    TooltipComponent,
    GridComponent
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import { updateChartData } from './utiles';


echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition
]);


// 2. 定义组装后单条数据类型
export interface AdDataItem {
  timestamp: number;
  adValue: number;
}

let dataList: any[] = []


let option = {
    title: {
        text: 'Dynamic Data & Time Axis'
    },
    tooltip: {
        trigger: 'axis',

        axisPointer: {
            animation: false
        }
    },
    xAxis: {
        type: 'time',
        splitLine: {
            show: false
        },
     formatter: function (siemensTime: any) {
         const date = new Date(siemensTime);
         const h = date.getUTCHours().toString().padStart(2, '0');
         const m = date.getUTCMinutes().toString().padStart(2, '0');
         const s = date.getUTCSeconds().toString().padStart(2, '0');
         return `${h}:${m}:${s}`
     },
    },
    yAxis: {
        type: 'value',
        
        splitLine: {
            show: false
        }
    },
    series: [
        {
            name: 'Fake Data',
            type: 'line',
            showSymbol: false,
            data: dataList
        }
    ]
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)

/**
 * 定义数据点的类型，适配 ECharts series.data
 */
 export interface PollingResponse {
  adValues: number[]; // 每次25条
  timestamps: number[]; // 每次25条，与adValues索引一一对应
}

window.ipcApi.on("ModBus-read", (_, data) => {
    dataList = updateChartData(data, dataList)
    updateCharts({
        series: [
            {
                data: dataList
            }
        ]
    })
})

</script>

<template>
    <div ref="chartContainer" style="width: 99%; height: 100%;"></div>
</template>

<style scoped></style>