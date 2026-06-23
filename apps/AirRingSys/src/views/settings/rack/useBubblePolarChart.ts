import { computed, watch, isRef, ref, type Ref } from 'vue'
import * as echarts from 'echarts/core'
import {
  TitleComponent,
  TooltipComponent,
  PolarComponent,
} from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import useChartsInit from '@/hooks/useInitCharts'
import type { BubbleSweepResult } from '@/types/ipc'
import {
  EMPTY_POLAR_OPTION,
  directionColor,
  directionLabel,
  formatTime,
  isInProgress,
} from './bubbleRawThickness.constants'

// polar + clockwise:true 是 ECharts 里**唯一**能拿到顺时针角度布局的方式
// （radar 永远是逆时针）
echarts.use([
  TitleComponent,
  TooltipComponent,
  PolarComponent,
  LineChart,
  CanvasRenderer,
])

/** tooltip formatter 参数类型（ECharts 内部结构） */
interface TooltipParam {
  value: [number, number]
  seriesName: string
  marker: string
}
interface AxisPointerLabelParam {
  axisDimension: string
  value: number
}

/**
 * 接受 Ref 或 getter（`() => value`）两种形式
 */
export function useBubblePolarChart(
  selectedSweep:
    | Ref<BubbleSweepResult | null>
    | (() => BubbleSweepResult | null)
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

  const mainChartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    if (!sweep) return EMPTY_POLAR_OPTION

    const {
      profile,
      direction,
      time,
      cycleDurationMs,
      rmsError,
      maxError,
      numMeasurements,
    } = sweep
    const color = directionColor(direction)
    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText = `${directionLabel(direction)}向扫描 · ${formatTime(time)} · ${durMin} min${inProgress ? ' · 进行中' : ''}`

    const numBins = profile.length
    const binWidth = 360 / numBins
    // 数据点放在 bin 中心（i * 360/N + 360/N/2）
    const dataAt = (i: number) => i * binWidth + binWidth / 2

    // 极坐标数据格式 [radius, angle] = [厚度, 角度]，闭合环需首尾相连
    const lineData: [number, number][] = profile.map((v, i) => [v, dataAt(i)])
    lineData.push([profile[0], dataAt(0)])

    return {
      title: {
        text: titleText,
        subtext: `RMS ${rmsError.toFixed(2)} μm · Max ${maxError.toFixed(2)} μm · 测量 ${numMeasurements}`,
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
            formatter: (p: AxisPointerLabelParam) =>
              p.axisDimension === 'angle'
                ? `${p.value.toFixed(0)}°`
                : `${p.value.toFixed(1)} μm`,
          },
        },
        formatter: (params: TooltipParam | TooltipParam[]) => {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          // data 格式 [radius, angle] → value[1] = 角度, value[0] = 厚度
          const angle = arr[0].value[1]
          let html = `<div style="font-weight:600;margin-bottom:2px">角度 ${angle.toFixed(1)}°</div>`
          for (const p of arr) {
            html += `<div>${p.marker} ${p.seriesName}：<b>${p.value[0].toFixed(2)}</b> μm</div>`
          }
          // 压合厚度：测厚仪扫过同一径向上对向两个 bin（差 180°）的厚度之和
          // 原始膜厚本质就是"压平"后的厚度
          const numBins = sweep.profile.length
          if (numBins > 0) {
            const binWidthDeg = 360 / numBins
            // bin 中心在 [i*bw, (i+1)*bw) 左闭右开区间，floor 取所在 bin
            // 与 ECharts 找最近数据点用的 bin 对齐（89° → bin 29，269° → bin 89）
            const currentBin = Math.floor(angle / binWidthDeg) % numBins
            const oppositeBin =
              (currentBin + Math.floor(numBins / 2)) % numBins
            const cur = sweep.profile[currentBin]
            const opp = sweep.profile[oppositeBin]
            if (cur !== undefined && opp !== undefined) {
              const compressed = cur + opp
              const oppositeAngle = (angle + 180) % 360
              html += `<div style="color:#67c23a">压合厚度：<b>${compressed.toFixed(2)}</b> μm <span style="color:#909399;font-size:11px">(${angle.toFixed(0)}° / ${oppositeAngle.toFixed(0)}°)</span></div>`
            }
            // 测厚时间：binTimestamps[bin] 即测厚仪测到该 bin 厚度的时间
            const binTimestamps = sweep.binTimestamps
            if (binTimestamps && binTimestamps.length >= numBins) {
              const ts = binTimestamps[currentBin]
              if (ts && ts > 0) {
                html += `<div style="color:#909399;font-size:11px">测厚时间：${formatTime(ts)}</div>`
              }
            }
          }
          return html
        },
      },
      polar: {
        center: ['50%', '55%'],
        radius: '70%',
      },
      angleAxis: {
        type: 'value',
        min: 0,
        max: 360,
        startAngle: 90, // 0° 在正上方
        clockwise: true, // 顺时针：0°→90°→180°→270° 走"上→右→下→左"
        axisLabel: {
          // 每 30° 显示标签，120 分箱（3°/bin）下清晰可读
          formatter: (v: number) => (v % 30 === 0 ? `${v.toFixed(0)}°` : ''),
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
          formatter: (v: number) => `${v}`,
        },
        splitLine: { lineStyle: { color: '#ebeef5' } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'line',
          name: `${directionLabel(direction)}向扫描`,
          coordinateSystem: 'polar',
          z: 10,
          data: lineData,
          lineStyle: { width: 2, color },
          showSymbol: false,
        },
      ],
    }
  })

  const { updateCharts } = useChartsInit(
    'chartRef',
    mainChartOption.value ?? EMPTY_POLAR_OPTION
  )

  watch(
    mainChartOption,
    (val) => {
      updateCharts(val ?? EMPTY_POLAR_OPTION, true)
    },
    { flush: 'post' }
  )

  return { mainChartOption, selectedMaxRadius }
}
