<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
    GridComponent,
    TooltipComponentOption,
    GridComponentOption,
    DatasetComponentOption,
    VisualMapComponent,
    VisualMapComponentOption,
    MarkLineComponent,
    MarkLineComponentOption,
} from 'echarts/components';
import { LineChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import { useProduct } from '@/store/product';
import dayjs from "dayjs";

type ECOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | DatasetComponentOption
    | VisualMapComponentOption
    | MarkLineComponentOption
>;

echarts.use([
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    VisualMapComponent,
    MarkLineComponent
]);

const store = useProduct();

const props = defineProps<{
    id: number,
    frameData: [number,number][],
    startDate: string,
    endDate: string
}>()

let option: ECOption = {
    animation: false,
    // 边距设置
    grid: {
        left: 5,
        right: 12,
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
                if (value === -store.param.tolerance || value === store.param.tolerance ) {
                    return `{special|${value}%}`
                }
                return `${value.toFixed(0)}%`
            },
            rich: {
                special: {
                    color: '#fff',
                    backgroundColor: '#ff6f6f',
                    padding: 2,
                }
            },
        },
        minorTick: {
            show: false,
        },
        axisLine: {
            show: true,
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
            markLine: {
                silent: true,
                symbol: 'none', // 不显示标记点
                lineStyle:
                {
                    color: 'red', // 标记线的颜色
                    type: 'dashed' // 线型
                },
                label: {
                    show: false,
                },
                data: [
                    { yAxis: store.param.tolerance },
                    { yAxis: -store.param.tolerance },
                ]
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
const { updateCharts } = useChartsInit('chartContainer', option, props)

watch(props, () => {
    // 正常区域：
    const overData = props.frameData.map(v => (v[1] < 5 && v[1] > -5 ? null : v));
    updateCharts({
        series: [
            { data: props.frameData },
            { data: overData },
        ]
    })
},
    {
        immediate: true
    }
)
</script>

<template>
    <div class="charts">
        <div ref="chartContainer" style="width: 99%; height: 100%;"></div>
        <div class="tittle">
            <p style="margin-right: 10px;">横向图</p>
            <p>ID: {{ props.id }}</p>
        </div>

        <div class="date_info">
            <p> {{ props.startDate }}</p>
            <p style="margin: 0 3px;"> ~ </p>
            <p> {{ props.endDate && dayjs(props.endDate).format('HH:mm:ss') }}</p>
        </div>
    </div>
</template>

<style scoped lang="less">
.charts {
    position: relative;
    width: 100%;
    height: 100%;
}

.tittle, .date_info {
    position: absolute;
    display: flex;
    background-color: #409EFF;
    color: #fff;
    font-size: 12px;
    border-radius: 5px;
    padding: 2px 3px;
}

.tittle {
    left: 45px;
    top: 0;
    
}
.date_info {
    right: 5px;
    top: 0;
}
</style>