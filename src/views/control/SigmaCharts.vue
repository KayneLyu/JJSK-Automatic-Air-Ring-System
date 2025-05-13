<script setup lang='ts'>
import { watch, onMounted, ref } from "vue";
import * as echarts from "echarts/core";
import {
    TitleComponent,
    TitleComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
} from "echarts/components";
import { LineChart, LineSeriesOption } from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import useChartsInit from '@/hooks/useInitCharts';


echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
]);

type EChartsOption = echarts.ComposeOption<
    | TitleComponentOption
    | TooltipComponentOption
    | GridComponentOption
    | LineSeriesOption
>;

const props = defineProps<{
    frameData: Array<[string , number]>
}>()

let option: EChartsOption = {
    animation: false,
    tooltip: {
        trigger: "axis",
        position: function (pt) {
            return [pt[0], "10%"];
        },
        axisPointer: {
            type: "line",
            lineStyle: {
                color: "red",
                type: "solid",
                opacity: 1,
            },
            label: {
                show: true,
                backgroundColor: "#C60005",
                color: "#fff",
            },
        },
        triggerOn: "click",
        formatter: (event) => {
            const result = event as CallbackDataParams[];
            const index = result[0].dataIndex;
            // frameData(index);
            return ``;
        },
    },
    grid: {
        left: 10,
        right: 10,
        bottom: 10,
        top: 10,
        containLabel: true,
    },
    title: {
        // text: sigmaTitle + " : " + duration,
        right: "0",
        backgroundColor: "#FCB00190",
        borderRadius: 5,
        textStyle: {
            backgroundColor: "red",
            fontSize: 14,
        },
    },

    xAxis: {
        type: "category",
        boundaryGap: false,
        // data: timeData,
        axisLabel: {
            show: true,
        },
        axisLine: { onZero: false },
        axisPointer: {
            handle: {
                show: true,
                size: 0,
            }
        },
        // splitLine: {
        //     show: true,
        // }
    },
    yAxis: {
        type: "value",
        max: 5 * 4,
        min: -5 * 4,
        minInterval: 1,
        maxInterval: 5,
        axisLabel: {
            formatter: (value) => {
                return value + "%";
            },
            // color: function (value: any): string {
            //     return value == warningLine || value == warningLine * -1
            //         ? "red"
            //         : "black";
            // },
        },
        axisLine: {
            show: true
        },
        axisTick: {
            show: true
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
            name: "SigmaData",
            type: "line",
            smooth: true,
            symbol: "none",
            areaStyle: {
                color: "rgba(15,199,15,.3)",
            },
            lineStyle: {
                width: 2,
                color: "#0FC70F",
            },
            data: [],
        },
        {
            name: "FakeData",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: {
                width: 2,
                color: "#0FC70F",
            },
            areaStyle: {
                color: "rgba(15,199,15,.3)",
            },
            // data: absoluteSigmaArray,
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: [],
        },
    ],
};


const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts }  = useChartsInit('chartContainer', option, props)

watch(() => props.frameData, (newValue) => {
    console.log('frameData', newValue);
    
    let backSigmaList: Array<[string, number]> = []
    if(newValue.length) {
        backSigmaList = newValue.map( item => {
            return [item[0], item[1] * -1]
        })
    }
    updateCharts({
        xAxis: {
            data: newValue.map(item => item[0])
        },
        series: [
            {
                data: newValue,
            },
            {
                data: backSigmaList,
            },
        ]
    })
}
)

</script>

<template>
    <div ref="chartContainer" style="width: 99%;  height: 200px;"></div>
</template>

<style scoped>
</style>