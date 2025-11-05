<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import {
    PolarComponent,
    PolarComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    LegendComponent,
    LegendComponentOption,
    MarkLineComponent,
    MarkLineComponentOption
} from 'echarts/components';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import { useProduct } from '@/store/product.ts';
import { useApiDataStore } from "@/store/polling-data";

echarts.use([
    PolarComponent,
    TooltipComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    MarkLineComponent
]);

type ECOption = echarts.ComposeOption<
    | PolarComponentOption
    | TooltipComponentOption
    | LegendComponentOption
    | LineSeriesOption
    | MarkLineComponentOption
>;

const store = useProduct();
const { rotation: startDeg, data: monitors } = useApiDataStore().KPEData
const props = defineProps<{
    frameData: [number,number][] | undefined,
}>()

const loopCount = monitors.length > 0 ? monitors.length : 48;

let monitorsList = [];
for (let index = 1; index <= loopCount; index++) {
    monitorsList.push(index);
}

let option: ECOption = {
    animation: false,
    polar: [
        {
            center: ["50%", "50%"],
            radius: ["25%", "82%"],
            z: 1,
        },
        {
            center: ["50%", "50%"],
            radius: ["0", "88%"],
            z: 0,
        },
    ],
    angleAxis: [
        // 外圈
        {
            polarIndex: 0,
            type: "value",
            // boundaryGap: true,
            min: 0,
            max: 360,
            // data: resetOrderDeg(30),
            startAngle: -90,
            axisLabel: {
                align: "center",
                interval: 9,
                inside: true,
                margin: 42,
                fontWeight: 700,
                fontSize: 15,
                formatter: (value: string) => {
                    return Number(value) + '°'
                },
            },
            axisTick: {
                show: false,
            },
            splitLine: {
                show: true,
                lineStyle: {
                    type: "dashed",
                    color: "#C4C4C4"
                },
            },
        },
        // 内圈
        {
            show: true,
            boundaryGap: true,
            polarIndex: 1,
            type: "category",
            startAngle: (-startDeg) + (360 / 63 / 2),
            data: monitorsList,
            axisTick: {
                length: 24,
                inside: true,
                lineStyle: {
                    width: 1,
                },
            },
            axisLabel: {
                interval: 0,
                inside: true,
                margin: -20,
                fontSize: 12,
                formatter: (value: string) => {
                    if (value == "1") {
                        // 对特定的刻度标签设置特殊样式
                        return "{a|" + value + "}";
                    } else {
                        return value;
                    }
                },
                rich: {
                    a: {
                        fontSize: 16,
                        color: "red",
                        fontWeight: "bold",
                    },
                },
                fontWeight: 700,
            },
            splitLine: {
                show: false,
            },
        },
    ],

    radiusAxis: [
        {
            name: "(%)",
            polarIndex: 0,
            type: "value",
            nameLocation: 'start',
            nameGap: 5,
            min: store.param.tolerance * -5,
            max: store.param.tolerance * 5,
            maxInterval: store.param.tolerance,
            axisLabel: {
                formatter: function (value) {
                    if (value === -store.param.tolerance || value === store.param.tolerance) {
                        return `{special|${value}%}`
                    }
                    return `${value.toFixed(0)}`
                },
                rich: {
                    special: {
                        color: '#fff',
                        backgroundColor: '#ff6f6f',
                        padding: 2,
                        fontSize: 12,
                    }
                },
                fontSize: 12,
                show: true,
            },
            splitLine: {
                lineStyle: {
                    // 使用深浅的间隔色
                    color: ["#C4C4C4", "#C4C4C4", "#C4C4C4", "#C4C4C4", "red", "#C4C4C4", "red"],
                    type: "dashed",
                    opacity: 0.4,
                },
            },
        },
        {
            show: false,
            polarIndex: 1,
        },
    ],
    series: [
        {
            polarIndex: 0,
            coordinateSystem: "polar",
            name: "line",
            type: "line",
            lineStyle: {
                width: 3,
                color: "#0770FF",
            },
            showSymbol: false,
            areaStyle: {
                color: "rgba(168,176,246, 0.7)",
            },

            data: [],
        },
        {
            polarIndex: 0,
            coordinateSystem: "polar",
            name: "line",
            type: "line",
            lineStyle: {
                width: 3,
                color: "#000cae",
            },
            showSymbol: false,
            data: [],
        },
        {
            polarIndex: 1,
            coordinateSystem: "polar",
            name: "line",
            type: "line",
            showSymbol: false,
            data: [],
        },
    ],
};
const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)

watch(() => props.frameData, (newValue) => {
    if (newValue && newValue.length) {
        updateCharts({
            series: [
                {
                    data: newValue
                }
            ]
        })
    }
},
    {
        immediate: true
    }
)

</script>

<template>
    <div ref="chartContainer" style="width: 99%; height: 99%;"></div>
</template>
