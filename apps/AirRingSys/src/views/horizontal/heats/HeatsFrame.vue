<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
    GridComponent,
    GridComponentOption,
} from 'echarts/components';
import { BarChart, BarSeriesOption } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useSortChannel from '@/hooks/useSetChannelSort.ts';

import useChartsInit from '@/hooks/useInitCharts.ts';

type ECOption = echarts.ComposeOption<
    | GridComponentOption
    | BarSeriesOption
>;

echarts.use([
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
                    return `${value}°`;
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
                    return monitorNum % 5 === 0;
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
                return `${value}%`
            }
        }
    },
    series: [
        {
            xAxisIndex: 1,
            type: 'bar',
            barWidth: '90%',
            color: '#A5A2E390',
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
