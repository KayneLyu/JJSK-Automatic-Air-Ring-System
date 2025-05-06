<script setup lang='ts'>
import { ref, onMounted, watch } from 'vue';
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
import { rearrangeArray } from "@/utils";
import useSortChannel from '@/hooks/useSetChannelSort';

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

const { channelOrder } = useSortChannel()
const props = defineProps<{
    frameData: [string,number][]
}>()


let option: ECOption = {
    animation: false,
    title: {
        text: "当前风环通道值",
        top: "15%",
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
        right: 12,
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
            },
            splitLine: {
                show: false
            },
        },
        {
            type: 'category',
            boundaryGap: true,
            data: channelOrder.value,
            axisLabel: {
                show: true,
                interval: 0,
                formatter: function (value) {
                    const monitorNum = Number(value)
                    if (monitorNum == 1) {
                        return `{special|${value}}`
                    }
                    if (monitorNum % 5 == 0) {
                        return `${value}`
                    } else {
                        return ``
                    }
                },
                rich: {
                    special: {
                        color: '#fff',
                        backgroundColor: '#ff6f6f',
                        padding: 2,
                    }
                },
                margin: 3,
                showMinLabel: true
            },
            axisTick: {
                show: false,
                alignWithLabel: false,
            },
            axisLine: {
                show: false
            },
            splitLine: {
                show: true,
                interval: (index, value) => {
                    const monitorNum = Number(value);
                    return monitorNum === 1 || monitorNum % 5 === 0;
                }
            },
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
            barWidth: '90%',
            color: 'rgba(168,176,246, 0.7)',
            data: []
        },
    ]
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option, props)
watch(() => props.frameData, (newData) => {
    updateCharts({
        series: [
            {
                data: newData,
            }
        ]
    })
})

watch(() => channelOrder.value, (newAxisData) => {
    updateCharts({
        xAxis: [
            {},
            {
                data: newAxisData,
            }
        ]
    })
},
    {
        immediate: true
    }
)
</script>

<template>
    <div ref="chartContainer" style="width: 99%; height: 100%;"></div>
</template>

<style scoped></style>
