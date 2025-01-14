<script setup lang='ts'>
import { ref } from 'vue';
import * as echarts from 'echarts/core';
import {
    TitleComponent,
    TitleComponentOption,
    PolarComponent,
    PolarComponentOption,
    TooltipComponent,
    TooltipComponentOption,
    LegendComponent,
    LegendComponentOption,
} from 'echarts/components';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import useChartsInit from '@/hooks/useInitCharts';
import { useProduct } from '@/store/product.ts';
import { resetOrderDeg } from '@/utils';

echarts.use([
    TitleComponent,
    PolarComponent,
    TooltipComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
]);

type ECOption = echarts.ComposeOption<
    | TitleComponentOption
    | PolarComponentOption
    | TooltipComponentOption
    | LegendComponentOption
    | LineSeriesOption
>;

const store = useProduct();
const startDeg = 90
const data: any = []
const tempData: any = []
const monitors = 48
let monitorsList = [];
for (let index = 0; index <= monitors; index++) {
    monitorsList.push(index);
}

let option: ECOption = {
    animation: false,
    title: {
        // text: `${t("horizontal.ringChart")}  ${newFrameData.timeStart} ~ ${newFrameData.timeEnd}`,
        right: "0%",
        backgroundColor: "#FCB001",
        borderRadius: 5,
        textStyle: {
            color: "black",
            fontSize: "16px",
        },
    },
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
            type: "category",
            boundaryGap: true,
            data: resetOrderDeg(30),
            startAngle: -90,
            axisLabel: {
                align: "center",
                interval: 9,
                inside: true,
                margin: 38,
                // color: "#000",
                fontWeight: 700,
                fontSize: 15,
            },
            axisTick: {
                show: false,
            },
            splitLine: {
                show: true,
                lineStyle: {
                    type: "dashed",
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
            min: 1,
            max: 48,
            data: monitorsList,
            axisTick: {
                length: 25,
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
            polarIndex: 0,
            type: "value",
            min: store.tolerance * -3,
            max: store.tolerance * 3,
            minInterval: 1,
            maxInterval: store.tolerance,
            axisLabel: {
                margin: 2,
                formatter: function (value: number) {
                    // 自定义格式化函数
                    return value + "%";
                },
                verticalAlign: "bottom",
                color: function (value: any): string {
                    return value == store.tolerance || value == store.tolerance * -1
                        ? "red"
                        : "black";
                },
                fontWeight: 700,
                fontSize: 13,
            },
            splitLine: {
                lineStyle: {
                    // 使用深浅的间隔色
                    color: ["#d9dbdd", "#d9dbdd", "red", "#d9dbdd", "red"],
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
                color: "rgba(168,176,246, 0.9)",
            },
            data: data,
        },
        {
            polarIndex: 1,
            coordinateSystem: "polar",
            name: "line",
            type: "line",
            showSymbol: false,
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
            data: tempData,
        },
    ],
    // animationDuration: 200,
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
    <div ref="chartContainer" style="width: 100%; height: 100%;"></div>
</template>

<style scoped></style>