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
  OVERLAY_OPACITY,
  directionColor,
  directionLabel,
  formatTime,
  isInProgress,
  type ChartSweepData,
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
    | Ref<ChartSweepData | null>
    | (() => ChartSweepData | null),
  overlaySweeps?:
    | Ref<BubbleSweepResult[]>
    | (() => BubbleSweepResult[])
) {
  const sweepRef: Ref<ChartSweepData | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<ChartSweepData | null>)

  const overlayRef: Ref<BubbleSweepResult[]> = isRef(overlaySweeps)
    ? overlaySweeps
    : ref<BubbleSweepResult[]>(overlaySweeps ? overlaySweeps() : [])

  const selectedMaxRadius = computed(() => {
    const s = sweepRef.value
    if (!s) return 200
    const overlays = overlayRef.value ?? []
    let max = Math.max(...s.profile)
    for (const o of overlays) {
      const oMax = Math.max(...o.profile)
      if (oMax > max) max = oMax
    }
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
    const titleText = `${directionLabel(direction)}${direction === 'merged' ? '厚度' : '向扫描'} · ${formatTime(time)} · ${durMin} min${inProgress ? ' · 进行中' : ''}`

    const numBins = profile.length
    const binWidth = 360 / numBins
    // 数据点放在 bin 中心（i * 360/N + 360/N/2）
    const dataAt = (i: number) => i * binWidth + binWidth / 2

    // 极坐标数据格式 [radius, angle] = [厚度, 角度]，闭合环需首尾相连
    const lineData: [number, number][] = profile.map((v, i) => [v, dataAt(i)])
    lineData.push([profile[0], dataAt(0)])

    // 叠加层（合并模式下的正/反向单趟，淡色显示）
    const overlays = overlayRef.value ?? []
    const overlaySeries: Array<{
      type: 'line'
      name: string
      coordinateSystem: 'polar'
      z: number
      data: [number, number][]
      lineStyle: { width: number; color: string; opacity: number }
      showSymbol: boolean
    }> = []
    for (const ov of overlays) {
      const ovBinWidth = 360 / ov.profile.length
      const ovData: [number, number][] = ov.profile.map((v, i) => [
        v,
        i * ovBinWidth + ovBinWidth / 2,
      ])
      ovData.push([ov.profile[0], ovBinWidth / 2])
      overlaySeries.push({
        type: 'line',
        name: `${directionLabel(ov.direction)}向`,
        coordinateSystem: 'polar',
        z: 1,
        data: ovData,
        lineStyle: {
          width: 1.5,
          color: directionColor(ov.direction),
          opacity: OVERLAY_OPACITY,
        },
        showSymbol: false,
      })
    }

    // 主 series 名称（tooltip 中显示）
    const mainName =
      direction === 'merged'
        ? '合并厚度'
        : `${directionLabel(direction)}向扫描`

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
      // overlay 在前（z=1），主 series 在后（z=10）渲染在上层
      series: [
        ...overlaySeries,
        {
          type: 'line',
          name: mainName,
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
