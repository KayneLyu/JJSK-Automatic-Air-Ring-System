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
import { createThicknessCollector } from './utiles';

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
        min: 0,
        max: 7000,
        type: 'value',
        splitLine: {
            show: false
        },

    },
    yAxis: {
        type: 'value',
        min: 4500,
        splitLine: {
            show: false
        }
    },
    series: [
        {
            name: 'Preview Data',
            type: 'line',
            showSymbol: false,
            data: []
        },
        {
            name: 'Full Data',
            type: 'line',
            showSymbol: false,
            lineStyle: {
                width: 3,
                color: "pink",
            },
            data: [],
        }
    ]
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)
let dataList: any[] = []
/**
 * 定义数据点的类型，适配 ECharts series.data
 */
export interface PollingResponse {
    adValues: number[]; // 每次25条
    timestamps: number[]; // 每次25条，与adValues索引一一对应
}

const collector = createThicknessCollector()


window.ipcApi.on("ModBus-read", (_, data) => {
    const { pulses, adValues } = data

    // 1️⃣ 喂数据
    const fullData = collector.process(pulses, adValues)

    // 2️⃣ 实时更新图（每次都更新）
    const preview = collector.getPreviewData()

    // 3️⃣ 一圈完成 → 保存 JSON
    if (fullData) {
        dataList = fullData.map(item => [item.pulse, item.ad])

        // saveToJson(fullData)
    }
    updateCharts({
        series: [
            {
                data: preview
            },{
                data: dataList,
            }
        ]
    })
})

</script>

<template>
    <div ref="chartContainer" style="width: 99%; height: 100%;"></div>
</template>

<style scoped></style>