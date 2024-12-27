<script setup lang='ts'>
import { ref } from 'vue';
import * as echarts from "echarts/core";
import {
    TitleComponent,
    TitleComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
    LegendComponent,
    LegendComponentOption,
    BrushComponent,
    BrushComponentOption,
    ToolboxComponent
} from "echarts/components";
import {
    LineChart,
    LineSeriesOption,
    BarChart,
    BarSeriesOption,
} from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import { useI18n } from 'vue-i18n';
import useChartsInit from '@/hooks/useInitCharts';
echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    BarChart,
    BrushComponent,
    ToolboxComponent
]);

type EChartsOption = echarts.ComposeOption<
    | TitleComponentOption
    | TooltipComponentOption
    | GridComponentOption
    | LegendComponentOption
    | LineSeriesOption
    | BarSeriesOption
    | BrushComponentOption
>;

interface IProps {
    chartsData: ILastedFrameDataCard | undefined;
    heatsData: number[] | undefined;
    relationTitle: string;
    changeHeats: Function,
    pastHeats: number[],
    badList: number[][]
}

const { t } = useI18n();

let option: EChartsOption = {
    animation: false,
    title: [
        {
            text: "厚度关系图",
            right: 0,
            backgroundColor: "#FCB001",
            borderRadius: 5,
            textStyle: {
                backgroundColor: "red",
                fontSize: 14,
            },
        },
        {
            text: t("menu.horizon"),
            left: 0,
            top: 0,
            backgroundColor: "#c7c7c740",
            borderRadius: 5,
            textStyle: {
                fontSize: 14,
            },
        },
    ],
    grid: [
        {
            top: 25,
            left: 60,
            right: 30,
            height: "30%",
        },
        {
            left: 60,
            right: 30,
            bottom: 1,
            top: "40%",
            height: "50%",
        },
    ],
    brush: {
        toolbox: undefined,
        xAxisIndex: [0],
        inBrush: {
            color: "rgb(10, 150, 26)",
        },
        brushStyle: {
            color: 'rgb(10, 150, 26,.5)'
        },
        throttleType: "debounce",
        throttleDelay: 300,
    },
    tooltip: {
        trigger: "axis",
        alwaysShowContent: true,
        axisPointer: {
            type: "shadow",
            animation: false,
            shadowStyle: {
                color: "#70e1a750",
            },
            label: {
                show: true,
                backgroundColor: "#C60005",
                color: "#fff",
            },
            snap: false,
        },
        triggerOn: "click",
        formatter: (value: any) => {
            const index = value[0].axisValue - 1
            let arr = [index]
            // changeHeats(arr)
            return "";
        },
    },
    legend: {
        data: [],
        left: "25%",
        top: "4%",
    },
    axisPointer: {
        snap: true,
        triggerOn: "click",
        link: [
            {
                xAxisIndex: [0, 2],
            },
        ],
        value: 0,
        status: 'show'
    },
    xAxis: [
        {
            id: 'aa',
            type: "value",
            gridIndex: 1,
            max: 64,
            min: 1,
            interval: 4,
            axisLabel: {
                color: (value) => {
                    return value == 1 ? "red" : "black";
                },
            },
            axisPointer: {
                label: {
                    formatter: (value: any) => {
                        return value.value.toFixed(0)
                    }
                },
                handle: {
                    show: true,
                    size: 0,
                }
            },
        },
        {
            type: "category",
            id: 'cc',
            data: [],
            splitLine: {
                show: false
            },
            axisLine: {
                show: false,
            },
            axisTick: {
                show: false,
                alignWithLabel: true,
            },
            axisLabel: {
                interval: 6,
                formatter: (value) => {
                    return Number(value) * 3 + "°";
                },
                //   color: (value) => {
                //     return value == counterpointDeg ? "red" : "black";
                //   },
            },
            axisPointer: {
                show: false,
            }
        },
        {
            type: "value",
            gridIndex: 0,
            position: 'bottom',
            max: 64,
            min: 1,
            minInterval: 1,
            interval: 4,
            splitLine: {
                show: true,
            },
            axisLabel: {
                show: false
            },
            axisTick: {
                show: false,
            },
            axisLine: {
                show: false
            },
            axisPointer: {
                label: {
                    // formatter:(value: any) => {
                    //   const meanDeg = 120 / monitors
                    //   const arrIndex = (meanDeg * (value.value-1)).toFixed(0)
                    //   const currentValue = xAxisArr[Number(arrIndex)] * 3
                    //   return currentValue + '°'
                    // }
                },
                handle: {
                    show: true,
                    size: 0,
                }
            }
        },
    ],
    yAxis: [
        {
            gridIndex: 1,
            type: "value",
            min: 0,
            max: 100,
            maxInterval: 10,
            axisLabel: {
                formatter: "{value} %",
            },
            axisLine: {
                onZero: false,
                show: false,
            },
            axisTick: {
                show: false,
            }
        },
        {
            // max: warningLine * 4,
            // min: warningLine * -4,
            minInterval: 1,
            // maxInterval: warningLine,
            axisTick: {
                show: false,
            },
            axisLine: {
                show: false
            },
            axisLabel: {
                formatter: "{value} %",
                //   color: function (value: any): string {
                //     return value == warningLine || value == warningLine * -1
                //       ? "red"
                //       : "black";
                //   },
            },
            splitLine: {
                lineStyle: {
                    // 使用深浅的间隔色
                    color: [
                        "#d9dbdd",
                        "#d9dbdd",
                        "#d9dbdd",
                        "red",
                        "#d9dbdd",
                        "red",
                    ],
                    type: "solid",
                    opacity: 0.4,
                },
            },
            type: "value",
            inverse: false,
        },
    ],
    series: [
        {
            name: "sss",
            animation: false,
            type: "bar",
            yAxisIndex: 0,
            xAxisIndex: 0,
            barWidth: "85%",
            color: 'rgba(168,176,246, 0.7)',
            data: [],
        },
        {
            name: "sss",
            type: "line",
            yAxisIndex: 0,
            xAxisIndex: 0,
            color: '#00437b',
            data: [],
            smooth: true,
            showSymbol: false,
        },
        {
            barGap: '-100%',
            name: "sss",
            type: "bar",
            yAxisIndex: 0,
            xAxisIndex: 0,
            barWidth: "85%",
            animation: false,
            color: 'red',
            data: [],
        },
        {
            name: "sss",
            type: "line",
            yAxisIndex: 1,
            xAxisIndex: 1,
            showSymbol: false,
            lineStyle: {
                width: 2,
                color: "#0770FF",
            },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    {
                        offset: 0,
                        color: "rgba(58,77,233,0.4)",
                    },
                    {
                        offset: 1,
                        color: "rgba(122, 127, 170, 0.4)",
                    },
                ]),
            },
            data: [],
        },
        {
            name: "sss",
            type: "line",
            yAxisIndex: 1,
            xAxisIndex: 1,
            smooth: true,
            showSymbol: false,
            lineStyle: {
                width: 3,
                color: "#00067c",
            },
            data: [],
        },
    ],
};

const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)
</script>

<template>
    <div ref="chartContainer" style="width: 99%;  height:400px;"></div>
</template>

<style scoped></style>