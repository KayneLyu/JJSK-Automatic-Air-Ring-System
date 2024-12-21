<script setup lang='ts'>
import { ref } from 'vue';
import * as echarts from 'echarts/core';
import {
    GridComponent,
    TitleComponent,
    TitleComponentOption,
    TooltipComponentOption,
    GridComponentOption,
    DatasetComponentOption,
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';

type ECOption = echarts.ComposeOption<
    | TitleComponentOption
    | TooltipComponentOption
    | GridComponentOption
    | DatasetComponentOption
>;

echarts.use([
    TitleComponent,
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition
]);

let option: ECOption = {
    animation: false,
    title: {
        // text: `风环控制前扫描图  ${startTime} ${endTime}`,
        text: "自动风环扫描图",
        top: "2%",
        right: "0%",
        backgroundColor: '#29C1E5',
        borderRadius: 5,
        textStyle: {
            color: "black",
            fontSize: "12px",
        },
    },
    // 边距设置
    grid: {
        left: "1%",
        right: "2%",
        bottom: "3%",
        top: "5%",
        containLabel: true,
    },
    xAxis: [
        {
            min: 0,
            max: 120,
            maxInterval: 10,
            minInterval: 1,
            type: "value",
            minorTick: {
                show: true,
            },
            axisLine: {
                show: true,
                onZero: false,
            },
            axisLabel: {
                show: true,
                formatter: function (value) {
                    return value * 3 + "°";
                },
            },
        },
    ],
    yAxis: {
        type: "value",
        min: 5 * -4,
        max: 5 * 4,
        maxInterval: 5,
        minInterval: 1,
        axisLabel: {
            show: true,
            formatter: function (value) {
                return value + "%";
            },
            // color: function (value: any): string {
            //     return value == 5 || value == -1 * 5
            //         ? "red"
            //         : "black";
            // },
        },
        axisTick: {},
        minorTick: {
            show: false,
        },
        axisLine: {
            show: true,
        },
        splitLine: {
            lineStyle: {
                // 使用深浅的间隔色
                color: ["#d9dbdd", "#d9dbdd", "#d9dbdd", "red", "#d9dbdd", "red"],
                type: "solid",
                opacity: 0.4,
            },
        },
    },
    // visualMap:{
    //   right: 0,
    //   top:-20,
    //   pieces:[
    //     { 
    //       gt: -warningLine,
    //       lte: warningLine,
    //       color: 'rgba(168,176,246, 0.9)'
    //     },
    //   ],
    //   outOfRange: {
    //     color: 'rgba(255, 8, 8, 0.6)',
    //   },
    // },
    series: [
        {
            name: "实际轮廓(%)",
            type: "line",
            smooth: true,
            symbol: "none",
            data: [],
            lineStyle: {
                width: 2,
                color: "#0770FF",
            },
            showSymbol: false,
            areaStyle: {
                color: "rgba(168,176,246, 0.9)",
            },
        },
        {
            xAxisIndex: 0,
            yAxisIndex: 0,
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: {
                width: 3,
                color: "#000cae",
            },
            data: [],
        },
    ],
};
const chartContainer = ref<HTMLElement | null>(null)
const updateCharts = useChartsInit('chartContainer', option)
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