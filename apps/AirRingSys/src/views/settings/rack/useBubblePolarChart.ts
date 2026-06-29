import { computed, isRef, ref, type Ref } from 'vue'
import { use } from 'echarts/core'
import {
  TitleComponent,
  TooltipComponent,
  PolarComponent,
} from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { BubbleSweepResult } from '@/types/ipc'
import type { BinDecomposition } from './utils/bubbleReconstruction'
import {
  EMPTY_POLAR_OPTION,
  directionColor,
  directionLabel,
  formatTime,
  isInProgress,
} from './bubbleRawThickness.constants'

/** 前端重建时携带的 binDecompositions 字段不在 IPC 类型里,本地扩展 */
export type ExtendedBubbleSweepResult = BubbleSweepResult & {
  binDecompositions?: BinDecomposition[]
}

use([
  TitleComponent,
  TooltipComponent,
  PolarComponent,
  LineChart,
  CanvasRenderer,
])

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
  selectedSweep:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null)
) {
  const sweepRef: Ref<ExtendedBubbleSweepResult | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)

  const selectedMaxRadius = computed(() => {
    const s = sweepRef.value
    if (!s) return 200
    const max = Math.max(...s.profile)
    return Math.max(50, Math.ceil((max * 1.2) / 50) * 50)
  })

  const chartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    if (!sweep) return EMPTY_POLAR_OPTION

    const {
      profile,
      direction,
      time,
      cycleDurationMs,
      numMeasurements,
    } = sweep
    const color = directionColor(direction)
    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText =
      directionLabel(direction) +
      '向扫描 · ' +
      formatTime(time) +
      ' · ' +
      durMin +
      ' min' +
      (inProgress ? ' · 进行中' : '')

    const numBins = profile.length
    const binWidth = 360 / numBins
    const dataAt = function (i: number) {
      return i * binWidth + binWidth / 2
    }
    const lineData: [number, number][] = profile.map(function (v, i) {
      return [v, dataAt(i)]
    })
    lineData.push([profile[0], dataAt(0)])

    return {
      title: {
        text: titleText,
        subtext:
          '测量 ' +
          numMeasurements +
          ' 点 · 单层原始膜厚 (f(αC+δ) + f(αC-δ) , αC=上旋角+90°)',
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
            formatter: function (p: AxisPointerLabelParam) {
              return p.axisDimension === 'angle'
                ? p.value.toFixed(0) + '°'
                : p.value.toFixed(1) + ' μm'
            },
          },
        },
        formatter: function (params: TooltipParam | TooltipParam[]) {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          const angle = arr[0].value[1]
          const currentBin = Math.floor(angle / binWidth) % numBins

          // 直接读算法预计算的 per-bin 代表样本反解
          const decomp = sweep.binDecompositions?.[currentBin]

          let html =
            '<div style="font-weight:600;margin-bottom:4px">角度 ' +
            angle.toFixed(1) +
            '°</div>'

          if (decomp && decomp.ts > 0) {
            html +=
              '<div style="color:#c0c4cc;font-size:11px">测厚时间 ' +
              formatTime(decomp.ts) +
              '</div>'
            const sum = decomp.b1 + decomp.b2
            const resid = decomp.tMeasured - decomp.tPredicted
            const residColor =
              Math.abs(resid) < 2
                ? '#67c23a'
                : Math.abs(resid) < 5
                  ? '#e6a23c'
                  : '#f56c6c'
            html +=
              '<div style="margin-top:6px;padding-top:4px;border-top:1px solid #ebeef5;font-size:11px">' +
              '<b>压合厚度</b> = η·(B₁+B₂)<br/>' +
              '  φ₁=<b>' + decomp.phi1.toFixed(1) + '°</b>  B₁=' +
              decomp.b1.toFixed(2) + ' μm<br/>' +
              '  φ₂=<b>' + decomp.phi2.toFixed(1) + '°</b>  B₂=' +
              decomp.b2.toFixed(2) + ' μm<br/>' +
              '  合计 <b>' + sum.toFixed(2) + ' μm</b>' +
              '</div>'
            html +=
              '<div style="font-size:11px;margin-top:2px">' +
              'η·(B₁+B₂) = <b>' + decomp.tPredicted.toFixed(2) +
              '</b> μm  vs  T<sub>meas</sub>=<b>' +
              decomp.tMeasured.toFixed(2) + '</b> μm' +
              '</div>'
            html +=
              '<div style="font-size:11px;color:' + residColor + '">残差 ' +
              (resid >= 0 ? '+' : '') + resid.toFixed(2) + ' μm</div>'
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
          formatter: function (v: number) {
            return v % 30 === 0 ? v.toFixed(0) + '°' : ''
          },
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
        axisLabel: {
          fontSize: 10,
          color: '#909399',
          formatter: function (v: number) {
            return '' + v
          },
        },
        splitLine: { lineStyle: { color: '#ebeef5' } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'line',
          name: directionLabel(direction) + '向扫描',
          coordinateSystem: 'polar',
          z: 10,
          data: lineData,
          lineStyle: { width: 2, color },
          showSymbol: false,
        },
      ],
    }
  })

  return { chartOption }
}
