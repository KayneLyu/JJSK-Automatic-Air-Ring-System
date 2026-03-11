<script setup lang='ts'>
import { onMounted, ref, watch } from 'vue';
import * as echarts from "echarts/core";
import {
    TooltipComponent,
    TooltipComponentOption,
    GridComponent,
    GridComponentOption,
    LegendComponent,
    LegendComponentOption,
    BrushComponent,
    BrushComponentOption,
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
import useChartsInit from '@/hooks/useInitCharts';
import { useProduct } from '@/store/product';
import { rearrangeArray } from "@/utils";
import { useApiDataStore } from '@/store/polling-data';
import { formateList } from '@/utils/ChartsData';
import dayjs from 'dayjs';
import { db } from '@/utils/dexie';
import { setAutoRingHeats, getHeats, getBadHeats } from "@/api";
import { useFrameStore } from '@/store/frame';
import { showNotification } from '@/utils/';

echarts.use([
    TooltipComponent,
    GridComponent,
    LegendComponent,
    LineChart,
    CanvasRenderer,
    UniversalTransition,
    BarChart,
    BrushComponent,
    VisualMapComponent,
    ToolboxComponent
]);

type EChartsOption = echarts.ComposeOption<
    | TooltipComponentOption
    | GridComponentOption
    | LegendComponentOption
    | LineSeriesOption
    | BarSeriesOption
    | BrushComponentOption
    | VisualMapComponentOption
>;

const props = defineProps({
    frameData: {
        default: () => [],
        type: Array<number>,
    },
    mean: {
        default: 0,
        type: Number
    },
    currentId: {
        default: 0,
        type: Number
    },
    startDate: {
        default: '',
        type: String
    },
    endDate: {
        default: '',
        type: String
    },
    isFreshData: {
        default: true,
        type: Boolean
    }
})

const { t } = useI18n();

const store = useProduct();
const configStore = useApiDataStore()
const frameStore = useFrameStore()

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
            selectSingleChannel(arr)
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
                    return Number(value) * 3 + "°";
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
            axisPointer: {
                label: {
                    formatter: (value: any) => {
                        const meanDeg = 120 / configStore.apiAirRingConfig.ChannelCnt
                        const arrIndex = (meanDeg * (value.value - 1)).toFixed(0)
                        const currentValue = aAxisFormatArr[Number(arrIndex)] * 3
                        return currentValue + '°'
                    }
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
            name: "heats",
            animation: false,
            type: "bar",
            yAxisIndex: 0,
            xAxisIndex: 0,
            barWidth: "85%",
            color: '#A5A2E390',
            data: [],
        },
        {
            name: "nowHeats",
            type: "line",
            yAxisIndex: 0,
            xAxisIndex: 0,
            color: '#00437b',
            data: [],
            smooth: true,
            showSymbol: false,
        },
        {
            name: "tempFrame",
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
        {
            name: "frame",
            type: "bar",
            yAxisIndex: 1,
            xAxisIndex: 1,
            // showSymbol: false,
            // lineStyle: {
            //     width: 2,
            //     color: "#0770FF",
            // },
            // areaStyle: {
            //     color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            //         {
            //             offset: 0,
            //             color: "rgba(58,77,233,0.5)",
            //         },
            //         {
            //             offset: 1,
            //             color: "rgba(122, 127, 170, 0.8)",
            //         },
            //     ]),
            // },
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
            name: "badHeats",
            barGap: '-100%',
            type: "bar",
            yAxisIndex: 0,
            xAxisIndex: 0,
            barWidth: "85%",
            animation: false,
            color: '#E84043',
            data: [],
        },
    ],
};

const chartContainer = ref<HTMLElement | null>(null)
const { updateCharts, selectBrush, selectSingleChannel, brushList } = useChartsInit('chartContainer', option)

const heatsList = ref<[number, number][]>([])
const lastChannelList = ref<[number, number][]>([])

//  改变所有通道
const changeAllChannel = async (isAirControl: boolean, isAdd?: boolean) => {
    if (!heatsList.value?.length) return;
    const { IsAirDoorMode } = configStore.apiAirRingData;
    const step = configStore.apiAirRingConfig.Step
    const baseHeat = configStore.apiAirRingConfig.BaseHeat
    if (isAirControl) {
        try {
            heatsList.value = heatsList.value.map(item => [item[0], IsAirDoorMode ? 50 : baseHeat])
        } catch (error) {
            showNotification('error', t("notification.failed"), 'error')
        }
    } else {
        heatsList.value = heatsList.value.map(item => {
            const [index, value] = item
            return [index, isAdd ? value + step : value - step]
        })
    }
    await setChannelHeats()
    await getChannelHandle()
}

// 选中通道 增加/减少
const changeSomeChannel = (counterpoint: boolean, isAdd?: boolean) => {
    const step = configStore.apiAirRingConfig.Step;
    const putValue = isAdd ? step : -step;

    let needChangeChannel: number[] = brushList.value;

    if (counterpoint) {
        const counter = Math.round(configStore.apiAirRingConfig.ChannelCnt / 2)
        const counterB = Math.round(counter / 2 ) + 3
        const counterC = counter  + counterB
        needChangeChannel = [
            0,1,2,
            counterB - 1, counterB, counterB + 1,
            counterC - 1, counterC, counterC + 1,
        ];
    }
 
    console.log('sss', needChangeChannel);
    
    // 使用 Set 提升查找性能
    const changeSet = new Set(needChangeChannel);

    heatsList.value = heatsList.value.map((item, index) => {
        const [channelId, prevValue] = item;
        const isInclude = changeSet.has(index);
        let newValue: number;

        if (counterpoint) {
            newValue = isInclude ? 100 : 0;
        } else if (isInclude) {
            newValue = prevValue + putValue;
            if (newValue >= 100 && isAdd) newValue = 100;
            if (prevValue <= 0 && !isAdd) newValue = 0;
        } else {
            newValue = prevValue;
        }
        return [channelId, newValue];
    });

    updateCharts({
        series: [{
            data: heatsList.value,
        }]
    });
};

// 设置通道值
const setChannelHeats = async () => {
    try {
        const setHeats = heatsList.value.map(item => item[1])
        await setAutoRingHeats(setHeats)
    } catch (error) {
        showNotification('error', t("notification.failed"), 'error')
    }
}

// 获取通道值
const getChannelHandle = async () => {
    try {
        const result = await getHeats()
        if (result && result.length) {
            let newHeats: Array<[number, number]> = result.map((item, index) => {
                return [index + 1, item]
            })
            heatsList.value = newHeats
            lastChannelList.value = newHeats
            updateCharts({
                series: [
                    {
                        data: heatsList.value,
                    },
                    {
                        data: lastChannelList.value,
                    },
                ]
            })
        }
    } catch (error) {
        showNotification('error', t("notification.failed"), 'error')
    }
}

defineExpose({
    changeAllChannel,
    changeSomeChannel,
    getChannelHandle,
    setChannelHeats,
    brushList
})

watch(() => props.currentId, async (newData) => {
    let formatThickData: [number, number][] = []
    if (props.frameData && props.frameData.length) {
        const formatListData = <number[]>rearrangeArray(props.frameData, Number((configStore.apiAirRingConfig.ChannelNo1Angle / 3).toFixed(0)))
        formatThickData = formateList(formatListData, props.mean)
    }

    try {
        let channelDta: number[] = []
        if (props.currentId === 0 || props.isFreshData) {
            channelDta = await getHeats()
        } else {
            const result = await db.Heats.get(newData)
            channelDta = result?.heats ?? []
        }
        if (channelDta?.length > 0) {
            const newChannelData: [number, number][] = channelDta.map((item, index) => [index + 1, item])
            heatsList.value = newChannelData
            if (props.isFreshData || props.currentId === 0) {
                lastChannelList.value = newChannelData
            }
        }
    } catch (error) {
        console.log('error', error);
    }

    updateCharts({
        series: [
            {
                data: heatsList.value,
            },
            {
                data: lastChannelList.value,
            },
            {},
            {
                data: formatThickData
            },
        ]
    })
},
{
    immediate: true
}
)

// 当前损坏的通道
watch(() => frameStore.hasBadChannels, async (newData) => {
    let badList: Array<[number, number]> = []
    if (newData) {
        const badChannels = await getBadHeats()
        if (badChannels && badChannels.length) {
            badList = badChannels.map((item, index) => [index+1, item ? 100 : 0] )
        }
    }
    updateCharts({
        series: [
            {},
            {},
            {},
            {},
            {
                data: badList,
            }
        ]
    })
},
    {
        immediate: true
    }
)

onMounted(() => {
    selectBrush()
})

</script>

<template>
    <div class="charts_content">
        <div ref="chartContainer" style="width: 99%;  height:99%;"></div>
        <div class="charts_content_title title_left">
            <p>{{$t("horizon.frame")}}</p>
            <p style="margin-left: 10px;">ID: {{ currentId }}</p>
        </div>

        <div class="charts_content_title title_right">
            <p v-if="startDate" style="font-size: 13px;">
                {{ `${dayjs(startDate).format('MM-DD HH:mm:ss')} ~ ${dayjs(endDate).format('HH:mm:ss')}` }}
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