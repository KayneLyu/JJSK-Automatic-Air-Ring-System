<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
    GridComponent,
    TooltipComponentOption,
    GridComponentOption,
    DatasetComponentOption,
    VisualMapComponent,
    VisualMapComponentOption
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import { useProduct } from '@/store/product';
type ECOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | DatasetComponentOption
    | VisualMapComponentOption
>;

echarts.use([
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    VisualMapComponent,
]);

const store = useProduct();

const props = defineProps<{
    frameData: [number, number][]
}>()

let option: ECOption = {
    animation: false,
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
        min: store.param.tolerance * -4,
        max: store.param.tolerance * 4,
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
    series: [
        {
            name: "实际轮廓(%)",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: {
                width: 2,
                color: "#0770FF",
            },
            showSymbol: false,
            areaStyle: {
                color: "rgba(168,176,246, 0.7)",
            },
            data: []
        },
        {
            name: "实际轮廓(%)",
            type: "line",
            smooth: true,
            symbol: "none",
            showSymbol: false,
            areaStyle: {
                color: "#FA476F",
            },
            data: []
        },
        // {
        //     xAxisIndex: 0,
        //     yAxisIndex: 0,
        //     type: "line",
        //     smooth: true,
        //     symbol: "none",
        //     lineStyle: {
        //         width: 3,
        //         color: "#000cae",
        //     },
        //     data: [],
        // },
    ],
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)

watch(props, () => {
    // 正常区域：
    const overData = props.frameData.map(v => (v[1] < 5 && v[1] > -5 ? null : v)); 
    updateCharts({ series: [
        { data: props.frameData },
        { data: overData },
    ] })
},
    {
        immediate: true
    }
)
</script>

<template>
    <div class="charts">
        <div ref="chartContainer" style="width: 100%;; height: 100%;"></div>
        <div class="tittle">
            <p style="margin-right: 10px;">横向图</p>
            <p>ID: </p>
        </div>
    </div>
</template>

<style scoped lang="less">
.charts {
    position: relative;
    width: 100%;
    height: 100%;
}
.tittle {
    display: flex;
    position: absolute;
    left: 45px;
    top: 0;
    font-size: 12px;
    padding: 2px;
    border-radius: 5px;
    background-color: #29C1E5;
}
</style>