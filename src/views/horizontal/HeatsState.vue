<script setup lang='ts'>
import { ref } from 'vue';
import * as echarts from 'echarts/core';
import {
    TitleComponent,
    TitleComponentOption,
    GridComponent,
    GridComponentOption,
} from 'echarts/components';
import { BarChart, BarSeriesOption } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';

type ECOption = echarts.ComposeOption<
    | TitleComponentOption
    | GridComponentOption
    | BarSeriesOption
>;

echarts.use([
    TitleComponent,
    GridComponent,
    BarChart,
    CanvasRenderer,
    UniversalTransition
]);


const xAxisData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,34, 35, 36, 37, 38, ]
let option: ECOption = {
    animation:false,
    title: {
        text: "当前风环通道状态",
        top: "13%",
        right: "0%",
        backgroundColor: '#bae8ff80',
        borderRadius: 5,
        textStyle: {
            color: "black",
            fontSize: "12px",
        },
    },
    grid: {
        left: "0.5%",
        right: "2%",
        bottom: "4%",
        top: "5%",
        containLabel: true,
    },
    xAxis: [
        {
            type: 'value',
            min: 0,
            max: 360,
            interval: 30,
            axisTick: {
                show: true,
            },
            minorTick: {
                show: true,
            },
            axisLabel: {
                formatter: (value) => {
                    return value + "°";
                },
                // color: (value) => {
                //     return value == startDeg ? "red" : "black";
                // },
            },
        },
        {
            type: 'category',
            data: xAxisData,
            boundaryGap: false,
            min: 0,
            axisLabel: {
                interval: 4,
                color: (value) => {
                    return value == 1 ? "red" : "black";
                },
                margin: 3,
                showMinLabel: true
            },
            axisTick: {
                inside: true
            }
        },
    ],
    yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 20,
        axisLabel: {
            formatter: (value) => {
                return value + '%'
            }
        }
    },
    series: [
        {
            xAxisIndex: 1,
            type: 'bar',
            // smooth: 0.6,
            // symbol: 'none',
            // areaStyle: {},
            barWidth: '90%',
            color: 'rgba(168,176,246, 0.7)',
            data: []
        },
    ]
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)
// setTimeout(() => {
//     updateCharts({
//         series: [
//         {
//             data: [1000, 1000, 901, 934, 1290, 1330, 1320],
//             type: 'line',
//             areaStyle: {}
//         }
//     ]
//     })
// },0)

</script>

<template>
    <div  ref="chartContainer" style="width: 100%;; height: 100%;"></div>
</template>

<style scoped></style>

