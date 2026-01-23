<script setup lang='ts'>
import React, { useEffect, useRef } from 'react';

import * as echarts from 'echarts/core';
import {
    DatasetComponent,
    DataZoomComponentOption,
    PolarComponent,
    PolarComponentOption,
    // TooltipComponent
} from 'echarts/components';
import { CustomChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import useResizeObserver from "@/hooks/ChartsResizeHook";
import { useGaugeStatus } from '@/store';

import guidao from '@/assets/images/guidao.png';

echarts.use([
    DatasetComponent,
    PolarComponent,
    CustomChart,
    CanvasRenderer
    // TooltipComponent,
]);

type EChartsOption = echarts.ComposeOption<
    | DataZoomComponentOption
    | DataZoomComponentOption
    | PolarComponentOption
>;

// var _animationDuration = 1000;
// var _animationDurationUpdate = 1000;
// var _animationEasingUpdate = 'quarticInOut';
var _valOnRadianMax = 360;
var _outerRadius = 98;
// var _innerRadius = 380;
var _pointerInnerRadius = 20;
var _insidePanelRadius = 72;
var _currentDataIndex = 0;

function convertToPolarPoint(renderItemParams: any, radius: any, radian: any) {
    return [
        Math.cos(radian) * radius + renderItemParams.coordSys.cx,
        -Math.sin(radian) * radius + renderItemParams.coordSys.cy
    ];
}
function makePionterPoints(renderItemParams: any, polarEndRadian: any) {
    return [
        convertToPolarPoint(renderItemParams, _outerRadius, polarEndRadian),
        convertToPolarPoint(
            renderItemParams,
            _outerRadius,
            polarEndRadian + Math.PI * 0.03
        ),
        convertToPolarPoint(renderItemParams, _pointerInnerRadius, polarEndRadian)
    ];
}
// 
const CircleCharts: React.FC<{ showLabel?: boolean }> = ({ showLabel }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const { chartInstanceRef } = useResizeObserver(chartRef);

    // 测厚仪实时数据
    const { getGaugeState } = useGaugeStatus()
    let { actualVal, position } = getGaugeState()


    function makeText(valOnRadian: number, name: string, unit: string) {
        // Validate additive animation calc.
        // if (valOnRadian < -10) {
        //   alert('illegal during val: ' + valOnRadian);
        // }
        return name + ' ' + valOnRadian.toFixed(1) + unit;
    }

    function renderItem(params: any, api: any) {
        let valPosition = api.value(1);
        var valActualNum = api.value(2);
        var coords = api.coord([api.value(0), valPosition, valActualNum]);
        var polarEndRadian = coords[3];
        var imageStyle = {
            image: guidao,
            // fill: 'red',
            x: params.coordSys.cx - _outerRadius,
            y: params.coordSys.cy - _outerRadius,
            width: _outerRadius * 2,
            height: _outerRadius * 2
        };
        return {
            type: 'group',
            children: [
                {
                    type: 'image',
                    style: imageStyle,
                    clipPath: {
                        type: 'polygon',
                        shape: {
                            points: makePionterPoints(params, polarEndRadian)
                        },
                        extra: {
                            polarEndRadian: polarEndRadian,
                            transition: 'polarEndRadian',
                            enterFrom: { opacity: 0 }
                        },
                        during: function (apiDuring: any) {
                            apiDuring.setShape(
                                'points',
                                makePionterPoints(params, apiDuring.getExtra('polarEndRadian'))
                            );
                        }
                    }
                },
                {
                    type: 'circle',
                    shape: {
                        cx: params.coordSys.cx,
                        cy: params.coordSys.cy,
                        r: _insidePanelRadius
                    },
                    style: {
                        fill: '#fff',
                        shadowBlur: 15,
                        shadowOffsetX: 0,
                        shadowOffsetY: 0,
                        shadowColor: 'rgba(76,107,167,0.5)'
                    }
                },
                {
                    type: 'text',
                    // extra: {
                    //   valActualNum,
                    //   transition: 'valActualNum',
                    //   enterFrom: { valActualNum: 0 }
                    // },
                    style: {
                        text: makeText(valActualNum, '厚度:', ' μm'),
                        fontSize: 15,
                        fontWeight: 700,
                        x: params.coordSys.cx,
                        y: params.coordSys.cy - 10,
                        fill: '#FF5200',
                        align: 'center',
                        verticalAlign: 'middle',
                        // enterFrom: { opacity: 0 }
                    },
                    during: function (apiDuring: any) {
                        apiDuring.setStyle(
                            'text',
                            makeText(valActualNum, '厚度:', ' μm')
                        );
                    }
                },
                {
                    type: 'text',
                    extra: {
                        valPosition,
                        transition: 'valPosition',
                        enterFrom: { valPosition: 0 }
                    },
                    style: {
                        text: makeText(valPosition, '位置:', '°'),
                        fontSize: 14,
                        fontWeight: 700,
                        x: params.coordSys.cx,
                        y: params.coordSys.cy + 25,
                        fill: '#0035FF',
                        align: 'center',
                        verticalAlign: 'baseline',
                        // enterFrom: { opacity: 0 }
                    },
                    during: function (apiDuring: any) {
                        apiDuring.setStyle(
                            'text',
                            makeText(apiDuring.getExtra('valPosition'), '位置:', '°')
                        );
                    }
                }
            ]
        };
    }

    let option: EChartsOption = {
        // animationEasing: _animationEasingUpdate,
        // animationDuration: _animationDuration,
        // animationDurationUpdate: _animationDurationUpdate,
        // animationEasingUpdate: _animationEasingUpdate,
        dataset: {
            source: [[1, position, actualVal]]
        },
        angleAxis: {
            type: 'value',
            startAngle: 0,
            min: 0,
            max: _valOnRadianMax,
            axisLabel: {
                show: showLabel,
                formatter: (value: number) => {
                    return value + '°'
                },
                fontSize: 10,
                margin: 2
            },
            axisPointer: {
                // color
            },
            axisTick: {
                show: false,
            },
            axisLine: {
                show: showLabel,
            },
            splitLine: {
                lineStyle: {
                    type: 'dashed'
                }
            }
        },
        radiusAxis: {
            type: 'value',
            show: false
        },
        polar: {},
        series: [
            {
                type: 'custom',
                coordinateSystem: 'polar',
                renderItem: renderItem
            }
        ]
    };

    useEffect(() => {
        // 在这里根据需要更新图表数据或配置
        if (chartInstanceRef.current) {
            chartInstanceRef.current.setOption(option);
        }

    }, []);

    useEffect(() => {
        chartInstanceRef.current && chartInstanceRef.current.setOption({
            dataset: {
                source: [[1, position, actualVal]]
            }
        });
    }, [position])


}

</script>

<template>
    <div>
        <div ref={chartRef}>

        </div>
    </div>
</template>

<style scoped></style>