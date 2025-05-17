<script setup lang='ts'>
import { watch, ref } from "vue";
import * as echarts from "echarts/core";
import {
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
} from "echarts/components";
import { LineChart, LineSeriesOption } from "echarts/charts";
import { UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import { useProduct } from '@/store/product';
import useChartsInit from '@/hooks/useInitCharts';
import dayjs from 'dayjs';

echarts.use([
    TooltipComponent,
    GridComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
]);

type EChartsOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | LineSeriesOption
>;

const props = defineProps<{
    frameData: Array<[string , number]>,
    startDate: string | undefined,
    endDate: string | undefined,
    currentId: number,
    currentIndex: number
}>()


const store = useProduct();

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
    xAxis: {
        type: "category",
        boundaryGap: false,
        // data: timeData,
        axisLabel: {
            show: true,
            formatter(value, index) {
                return dayjs(value).format("HH:mm");
            },
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
        max: store.param.tolerance * 4,
        min: -store.param.tolerance * 4,
        minInterval: 1,
        maxInterval: store.param.tolerance,
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
        axisLine: {
            show: true
        },
        axisTick: {
            show: true
        },
        splitLine: {

        },
    },


    series: [
        {
            name: "SigmaData",
            type: "line",
            smooth: true,
            symbol: "none",
            areaStyle: {
                color: "rgba(15,199,15,.5)",
            },
            lineStyle: {
                width: 2,
                color: "#0FC70F",
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
                color: "rgba(15,199,15,.5)",
            },
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: [],
        },
    ],
};


const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts, selectSeriesIndex }  = useChartsInit('chartContainer', option, props)

watch(() => props.frameData, (newValue) => {
    if(!newValue ||  newValue.length ==0) {
        
    }
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
    selectSeriesIndex(newValue.length - 1)
}
)

watch(() => props.currentIndex, (newIndex) => {
    selectSeriesIndex(newIndex)
})

</script>

<template>
    <div class="charts_content">
        <div ref="chartContainer" style="width: 99%;  height: 100%;"></div>
        <div class="charts_content_title title_left">
            <p>2σ图</p>
            <p style="margin-left: 10px;">当前ID: {{ currentId }}</p>
        </div>

        <div class="charts_content_title title_right">
            <p v-if="startDate">{{`${dayjs(startDate).format('MM-DD HH:mm:ss')} ~ ${dayjs(endDate).format('MM-DD HH:mm:ss')}`  }}</p>
        </div>
    </div>
</template>

<style scoped lang="less">
.charts_content {
    position: relative;
    height: 100%;
    width: 100%;
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
    opacity: 0.8;
    font-size: 14px;
}
.title_left {
    left: 50px;
}
.title_right {
    right: 0;
}
</style>