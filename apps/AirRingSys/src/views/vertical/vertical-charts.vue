<script setup lang='ts'>
import { watch, reactive } from 'vue';
import * as echarts from "echarts/core";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import {
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
    LegendComponent,
    LegendComponentOption,
} from "echarts/components";
import { LineChart, LineSeriesOption } from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

import useChartsInit from '@/hooks/useInitCharts.ts';
import { useProduct } from '@/store/product.ts';
import dayjs from 'dayjs';

echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
]);

type EChartsOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | LegendComponentOption
    | LineSeriesOption
>;


const store = useProduct();

const props = defineProps<{
    frameData: [string, number][],
    sigmaData: [string, number][],
    frameID: number
    frameIndex: number,
    startDate: string | undefined,
    endDate: string | undefined,
    handleCurrent: (index: number) => void
}>()


const changeIndex = (index: number) => {
    props.handleCurrent(index)
}

let option: EChartsOption = {
    animation: false,
    tooltip: {
        trigger: "axis",
        axisPointer: {
            type: "line",
            animation: false,
            lineStyle: {
                color: "red",
                type: "solid",
                opacity: 0.4,
                width: 2
            },
            label: {
                show: true,
                backgroundColor: "#C60005",
                color: "#fff",
                formatter: (params) => {
                    const { value } = params;
                    return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
                },
            },
        },
        triggerOn: "click",
        formatter: (event) => {
            const result = event as CallbackDataParams[];
            const { dataIndex } = result[0];
            changeIndex(dataIndex)
            return "";
        },
        // alwaysShowContent: true
    },

    axisPointer: {
        link: [
            {
                xAxisIndex: "all",
            },
        ],
    },
    grid: [
        {
            left: 45,
            right: 5,
            top: 30,
            height: "40%",
        },
        {
            left: 45,
            right: 5,
            top: "55%",
            height: "40%",
        },
    ],
    xAxis: [
        {
            gridIndex: 0,
            type: "category",
            boundaryGap: false,
            axisLine: { onZero: false },
            position: "bottom",
            axisTick: {
                show: true,
            },
            splitLine: {
                show: false,
            },
            axisPointer: {
                handle: {
                    show: true,
                    size: 0,
                }
            },
            axisLabel: {
                formatter(value: string) {
                    return dayjs(value).format("HH:mm");
                },
            }
        },
        {
            gridIndex: 1,
            type: "category",
            boundaryGap: false,
            axisLine: { onZero: true },
            splitLine: {
                show: false,
            },
            axisPointer: {
                handle: {
                    show: true,
                    size: 0,
                }
            },
            axisLabel: {
                formatter(value) {
                    return dayjs(value).format("HH:mm");
                },
            }
        },
    ],
    yAxis: [
        {
            gridIndex: 0,
            type: "value",
            inverse: true,
            max: store.param.tolerance * 4,
            min: store.param.tolerance * -4,
            interval: store.param.tolerance,
            axisLabel: {
                formatter: function (value) {
                    if (value === -store.param.tolerance || value === store.param.tolerance) {
                        return `{special|${value}%}`
                    }
                    return `${value.toFixed(1)}%`
                },
                rich: {
                    special: {
                        color: '#fff',
                        backgroundColor: '#ff6f6f',
                        padding: 2
                    }
                },
            },
        },
        {
            id: 1,
            gridIndex: 1,
            type: "value",
            splitNumber: 10, // 设置刻度数量, 
            nameTextStyle: {
                color: "black",
                fontSize: 13,
            },
            axisLabel: {
                formatter(value) {
                    return value.toFixed(1);
                },
            }
        },
    ],

    series: [
        {
            name: "sss",
            type: "line",
            areaStyle: {
                color: "rgba(168,176,246, 0.8)",
            },
            smooth: true,
            xAxisIndex: 0,
            yAxisIndex: 0,
            showSymbol: false,
            lineStyle: {
                width: 2,
                color: "#0770FF",
            },
            // clip: true,
            markLine: {
                symbol: 'none', // 不显示标记点
                lineStyle:
                {
                    color: 'red', // 标记线的颜色
                    type: 'dashed' // 线型
                },
                data: [
                    { yAxis: store.param.tolerance },
                    { yAxis: -store.param.tolerance },
                ]
            },
        },
        {
            name: "sss",
            type: "line",
            areaStyle: {
                color: "rgba(168,176,246, 0.8)"
            },
            smooth: true,
            xAxisIndex: 0,
            yAxisIndex: 0,
            showSymbol: false,
            lineStyle: {
                width: 2,
                color: "#0770FF",
            },
        },
        {
            name: "sss",
            type: "line",
            xAxisIndex: 1,
            yAxisIndex: 1,
            showSymbol: false,
            symbolSize: 4,
            areaStyle: {
                color: "#65cada80",
            },
            smooth: false,
        },

    ],
};

let sigmaInfo = reactive({
    sigmaMax: 0,
    sigmaMin: 0,
    sigmaMean: 0
})

const { updateCharts, selectSeriesIndex } = useChartsInit('chartContainer', option, props)

watch(() => props.sigmaData, (newValue) => {
    if (!newValue || newValue.length == 0) {
        return
    }
    let thickMax = -Infinity;
    let thickMin = Infinity;
    let sigmaSum = 0;
    let sigmaCount = 0;
    let sigmaMax = -Infinity;
    let sigmaMin = Infinity;
    let backSigmaList: Array<[string, number]> = [];
    const needBuildBackSigma = newValue.length > 0;
    // 单次循环处理所有数据
    props.frameData.forEach((item, index) => {
        const thickValue = item[1];

        // 更新 thickness 最大最小值
        if (thickValue > thickMax) thickMax = thickValue;
        if (thickValue < thickMin) thickMin = thickValue;

        // 同步处理 sigma 数据
        const sigmaItem = newValue[index];
        if (sigmaItem) {
            const sigmaValue = sigmaItem[1];
            sigmaSum += sigmaValue;
            sigmaCount += 1;
            if (sigmaValue > sigmaMax) sigmaMax = sigmaValue;
            if (sigmaValue < sigmaMin) sigmaMin = sigmaValue;
        }

        // 构建 backSigmaList（按需）
        if (needBuildBackSigma && newValue[index]) {
            backSigmaList.push([newValue[index][0], -newValue[index][1]]);
        }
    });

    // 计算平均值
    const sigmaMeanValue = sigmaCount === 0
        ? 0
        : Number((sigmaSum / sigmaCount).toFixed(1));


    sigmaInfo = {
        sigmaMax: sigmaMax,
        sigmaMin: sigmaMin,
        sigmaMean: sigmaMeanValue
    }

    updateCharts({
        yAxis: [{
            id: 1,
            min: Number((thickMin - 2).toFixed(0)),
            max: Number((thickMax + 2).toFixed(0)),
        }],
        xAxis: {
            data: newValue.map(item => item[0])
        },
        series: [
            {
                data: newValue
            },
            {
                data: backSigmaList
            },
            {
                data: props.frameData
            }
        ]
    })
    selectSeriesIndex(newValue.length - 1)
}
)

watch(() => props.frameIndex, (newVal) => {
    selectSeriesIndex(newVal)
})

</script>

<template>
    <div class="charts">
        <div ref="chartContainer" style="width: 99%; height: 99%;"></div>
        <div class="show_text title_left">
            <div>
                <p> <span style="font-size: 16px;">{{ $t('vertical.sigma2') }}</span> <span> {{
                    `ID: ${frameID}` }}</span> </p>
                <p v-if="startDate">{{ `${startDate} ~ ${endDate}` }}</p>
            </div>
        </div>
        <div class="show_text title_right">
            <p>{{ `${$t('vertical.sigmaMean')}: ${sigmaInfo.sigmaMean}%` }}</p>
            <p><span>{{ `${$t('vertical.max')}: ${sigmaInfo.sigmaMax}%` }}</span> <span>{{ `${$t('vertical.min')}:
                    ${sigmaInfo.sigmaMin}%` }}</span></p>
        </div>
    </div>
</template>

<style scoped lang="less">
.charts {
    position: relative;
    width: 100%;
    height: 100%;
}

.show_text {
    position: absolute;
    color: #fff;
    font-size: 14px;
    padding: 2px;
    border-radius: 5px;
    background-color: #409EFFBB;
    top: -12px;
    font-weight: 400;

    span:last-child {
        margin-left: 10px;
    }
}

.title_left {
    display: flex;
    align-items: center;
    left: 35px;
}

.title_right {
    right: 0%;
}
</style>