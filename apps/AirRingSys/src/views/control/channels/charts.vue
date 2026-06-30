<script setup lang='ts'>
import { ref, watch } from 'vue';
import * as echarts from "echarts/core";
import {
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
    LegendComponent,
    LegendComponentOption,
    VisualMapComponent,
    VisualMapComponentOption,
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
import useChartsInit from '@/hooks/useInitCharts.ts';
import { useProduct } from '@/store/product.ts';
import { rearrangeArray } from "@/utils";
import { useApiDataStore } from '@/store/polling-data.ts';
import { formateList } from '@/utils/ChartsData.ts';
import dayjs from 'dayjs';

echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    BarChart,
    VisualMapComponent,
    ToolboxComponent
]);

type EChartsOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | LegendComponentOption
    | LineSeriesOption
    | BarSeriesOption
    | VisualMapComponentOption
>;
type IFrameProps = {
    frameData: {
        frameData: number[],
        mean: number,
        sigma: number,
        width: number,
        currentId: number,
        startDate: string,
        endDate: string,
        heatsData: number[]
    }
}

const { frameData } = defineProps<IFrameProps>()

const { t } = useI18n();

const store = useProduct();
const configStore = useApiDataStore()

const xAxisArr: number[] = []
for (let i = 0; i < 120; i++) {
    xAxisArr.push(i)
}
const aAxisFormatArr = <number[]>rearrangeArray(xAxisArr, Number((configStore.apiAirRingConfig.ChannelNo1Angle / 3).toFixed(0)))

let option: EChartsOption = {
    animation: false,
    grid: [
        {
            top: 25,
            left: 50,
            right: "2%",
            height: "31%",
        },
        {
            left: 50,
            right: "2%",
            top: "45%",
            height: "50%",
        },

    ],
    legend: {
        data: [],
        left: "25%",
        top: "4%",
    },
    xAxis: [
        {
            type: "value",
            gridIndex: 1,
            max: configStore.apiAirRingConfig.ChannelCnt || 64,
            min: 1,
            interval: 4,
            axisLabel: {
                margin: 5,
                formatter: function (value) {
                    if (value === 1) {
                        return `{special|${value}}`
                    }
                    return `${value}`
                },
                rich: {
                    special: {
                        color: '#fff',
                        backgroundColor: '#FF0005',
                        padding: [2, 4, 2, 4],
                        borderRadius: 3
                    }
                },
            },

            axisTick: {
                show: false
            }
        },
        {
            type: "category",
            data: aAxisFormatArr,
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
            axisPointer: {
                show: false,
            },
            axisLabel: {
                interval: 5,
                formatter: (value: string, index: number) => {
                    if (index == 0) {
                        return `{special|${Number(value) * 3}°}`
                    }
                    return `${Number(value) * 3}°`;
                },
                rich: {
                    special: {
                        color: '#fff',
                        backgroundColor: '#FF0005',
                        padding: [2, 4, 2, 4],
                        borderRadius: 3,
                    }
                },
            },
        },
        {
            type: "value",
            gridIndex: 0,
            position: 'bottom',
            max: configStore.apiAirRingConfig.ChannelCnt || 64,
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
            max: store.param.tolerance * 4,
            min: store.param.tolerance * -4,
            minInterval: 1,
            maxInterval: store.param.tolerance,
            axisTick: {
                show: false,
            },
            axisLine: {
                show: false
            },
            axisLabel: {
                show: true,
                formatter: function (value) {
                    if (value === -store.param.tolerance || value === store.param.tolerance) {
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
            type: "value",
            inverse: false,
        },
    ],
    visualMap: [
        {
            seriesIndex: 3,
            right: 0,
            top: -20,
            pieces: [
                {
                    gt: -store.param.tolerance,
                    lte: store.param.tolerance,
                    color: '#8993FF'
                },
            ],
            outOfRange: {
                color: '#E36781',
            },
        },
    ],
    series: [

        {
            name: "frame",
            type: "bar",
            yAxisIndex: 1,
            xAxisIndex: 1,
            barWidth: '90%',
            color: '#8993FF',
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
            data: [],
        },

        {
            name: "heats",
            animation: false,
            type: "bar",
            yAxisIndex: 0,
            xAxisIndex: 0,
            barWidth: "85%",
            color: '#A5A2E390',
            data: [],
        },

    ],
};

const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts } = useChartsInit('chartContainer', option)


watch(() => frameData.frameData, (newData) => {
    let formatThickData: [number, number][] = []
    let newChannelData: [number, number][] = []
    if (newData && newData.length) {
        const formatListData = <number[]>rearrangeArray(newData, Number((configStore.apiAirRingConfig.ChannelNo1Angle / 3).toFixed(0)))
        formatThickData = formateList(formatListData, frameData.mean)
        newChannelData = frameData.heatsData.map((item, index) => [index + 1, item])
    }
    updateCharts({
        series: [
            {
                data: formatThickData,
            },
            {
                data: newChannelData,
            },
        ]
    })
},
)

</script>

<template>
    <div class="charts_content">
        <div class="charts_title">
            <p>{{ $t("horizon.mean")}}: {{ frameData.mean }} μm</p>
            <p style="margin: 0 25px;">2σ: {{ frameData.sigma }} %</p>
            <p>{{ $t("horizon.filmWidth") }}: {{ frameData.width }} mm</p>
        </div>
        <div ref="chartContainer" style="width: 99%;  height:99%;"></div>
        <div class="charts_content_title title_left">
            <p>{{ $t("horizon.frame") }}</p>
            <p style="margin-left: 10px;">ID: {{ frameData.currentId }}</p>
        </div>

        <div class="charts_content_title title_right">
            <p v-if="frameData.startDate" style="font-size: 13px;">
                {{ `${dayjs(frameData.startDate).format('MM-DD HH:mm:ss')} ~
                ${dayjs(frameData.endDate).format('HH:mm:ss')}` }}
            </p>
        </div>
    </div>
</template>

<style scoped>
.charts_content {
    position: relative;
    height: 100%;
    width: 100%;
}

.charts_title {
    position: absolute;
    display: flex;
    top: -20px;
    left: 30%;
}

.charts_content_title {
    position: absolute;
    top: 0;
    display: flex;
    background-color: #409EFF;
    color: #fff;
    font-size: 12px;
    border-radius: 5px;
    padding: 2px 3px;
}

.title_left {
    left: 50px;
}

.title_right {
    right: 0;
}
</style>
