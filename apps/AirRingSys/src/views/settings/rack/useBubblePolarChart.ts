import { computed, isRef, ref, type Ref } from 'vue'
import { use } from 'echarts/core'
import { TitleComponent, TooltipComponent, PolarComponent } from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { BubbleSweepResult } from '@/types/ipc'
import {
  EMPTY_POLAR_OPTION,
  directionColor,
  directionLabel,
  formatTime,
  isInProgress,
} from './bubbleRawThickness.constants'

use([TitleComponent, TooltipComponent, PolarComponent, LineChart, CanvasRenderer])

interface TooltipParam {
  value: [number, number]
  seriesName: string
  marker: string
}
interface AxisPointerLabelParam {
  axisDimension: string
  value: number
}

export function useBubblePolarChart(
  selectedSweep: Ref<BubbleSweepResult | null> | (() => BubbleSweepResult | null)
) {
  const sweepRef: Ref<BubbleSweepResult | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<BubbleSweepResult | null>)

  const selectedMaxRadius = computed(() => {
    const s = sweepRef.value
    if (!s) return 200
    const max = Math.max(...s.profile)
    return Math.max(50, Math.ceil((max * 1.2) / 50) * 50)
  })

  const chartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    if (!sweep) return EMPTY_POLAR_OPTION

    const { profile, direction, time, cycleDurationMs, numMeasurements, binCoverage } = sweep
    const color = directionColor(direction)
    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText = directionLabel(direction) + '向扫描 · ' + formatTime(time) + ' · ' + durMin + ' min' + (inProgress ? ' · 进行中' : '')

    const numBins = profile.length
    const binWidth = 360 / numBins
    const dataAt = function(i: number) { return i * binWidth + binWidth / 2 }
    const lineData: [number, number][] = profile.map(function(v, i) { return [v, dataAt(i)] })
    lineData.push([profile[0], dataAt(0)])

    return {
      title: {
        text: titleText,
        subtext: '测量 ' + numMeasurements + ' 点 · 各角度测厚仪平均读数',
        left: 'center',
        top: 10,
        textStyle: { fontSize: 14, fontWeight: 600 },
        subtextStyle: { fontSize: 11, color: '#909399' },
      },
      animation: false,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          snap: true,
          label: {
            formatter: function(p: AxisPointerLabelParam) {
              return p.axisDimension === 'angle' ? p.value.toFixed(0) + '°' : p.value.toFixed(1) + ' μm'
            },
          },
        },
        formatter: function(params: TooltipParam | TooltipParam[]) {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          const angle = arr[0].value[1]
          var html = '<div style="font-weight:600;margin-bottom:2px">角度 ' + angle.toFixed(1) + '°</div>'
          for (var i = 0; i < arr.length; i++) {
            var p = arr[i]
            html += '<div>' + p.marker + ' ' + p.seriesName + '：<b>' + p.value[0].toFixed(2) + '</b> μm</div>'
          }
          const currentBin = Math.floor(angle / binWidth) % numBins
          if (binCoverage && binCoverage.length >= numBins) {
            const count = binCoverage[currentBin]
            html += '<div style="color:#909399;font-size:11px">该角度测量点数：' + count + '</div>'
          }
          const binTimestamps = sweep.binTimestamps
          if (binTimestamps && binTimestamps.length >= numBins) {
            const ts = binTimestamps[currentBin]
            if (ts && ts > 0) {
              html += '<div style="color:#909399;font-size:11px">测厚时间：' + formatTime(ts) + '</div>'
            }
          }
          return html
        },
      },
      polar: { center: ['50%', '55%'], radius: '70%' },
      angleAxis: {
        type: 'value',
        min: 0,
        max: 360,
        startAngle: 90,
        clockwise: true,
        axisLabel: {
          formatter: function(v: number) { return v % 30 === 0 ? v.toFixed(0) + '°' : '' },
          fontSize: 11,
          color: '#303133',
        },
        splitLine: { lineStyle: { color: '#ebeef5' } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: '#ebeef5' } },
      },
      radiusAxis: {
        type: 'value',
        min: 0,
        max: selectedMaxRadius.value,
        axisLabel: { fontSize: 10, color: '#909399', formatter: function(v: number) { return '' + v } },
        splitLine: { lineStyle: { color: '#ebeef5' } },
        splitArea: { show: false },
      },
      series: [{
        type: 'line',
        name: directionLabel(direction) + '向扫描',
        coordinateSystem: 'polar',
        z: 10,
        data: lineData,
        lineStyle: { width: 2, color },
        showSymbol: false,
      }],
    }
  })

  return { chartOption }
}
