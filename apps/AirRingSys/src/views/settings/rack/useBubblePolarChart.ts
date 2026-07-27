/**
 * useBubblePolarChart — 膜泡单层厚度剖面 B(φ) 柱状图
 *
 * X 轴：膜泡圆周角度 φ (0-360°)
 * Y 轴：单层膜厚 B(φ) (μm)，以柱状图展示每个角度 bin 的厚度
 *
 * 数据流：
 *   T_k（测厚仪双层读数）→ reconstructBubbleThickness → B(φ)（单层剖面）
 *   → B(φ) 直接按角度分箱展示，覆盖率低的 bin 桥接补齐
 */
import { computed, isRef, ref, type Ref } from 'vue'
import { use } from 'echarts/core'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
} from 'echarts/components'
import { BarChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { BubbleSweepResult } from '@/types/ipc'
import {
  bridgeShortGaps,
  type BinDecomposition,
  type SampleDecomposition,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import {
  EMPTY_CHART_OPTION,
  directionLabel,
  formatTime,
  isInProgress,
} from './bubbleRawThickness.constants'

export type ExtendedBubbleSweepResult = BubbleSweepResult & {
  binDecompositions?: BinDecomposition[]
  sampleDecompositions?: SampleDecomposition[]
}

use([
  TitleComponent,
  TooltipComponent,
  GridComponent,
  BarChart,
  CanvasRenderer,
])

interface TooltipParam {
  value: [number, number]
  seriesName: string
  marker: string
  color: string
}

const MIN_RELIABLE_BIN_COVERAGE = 1
const MAX_BRIDGE_GAP_BINS = 3
const CHART_COLOR_PRIMARY = '#409EFF'

/**
 * 构建 B(φ) 角度域柱状图数据
 * 低覆盖率 bin 标为 null，短间隙桥接补齐
 */
function buildAngleBarData(
  profile: number[],
  coverage: number[],
  numBins: number,
): Array<[number, number | null]> {
  const binWidth = 360 / numBins
  const raw: Array<number | null> = profile.map((v, i) =>
    coverage[i] >= MIN_RELIABLE_BIN_COVERAGE ? v : null,
  )
  const bridged = bridgeShortGaps(raw, MAX_BRIDGE_GAP_BINS)
  return bridged.map((v, i) => [
    i * binWidth + binWidth / 2, // bin 中心角度
    v,
  ])
}

/**
 * 计算 Y 轴范围
 */
function computeYRange(
  data: Array<[number, number | null]>,
): { min: number; max: number } {
  let yMin = Infinity
  let yMax = -Infinity
  for (const pt of data) {
    if (pt[1] != null) {
      if (pt[1] < yMin) yMin = pt[1]
      if (pt[1] > yMax) yMax = pt[1]
    }
  }
  if (!Number.isFinite(yMin)) yMin = 0
  if (!Number.isFinite(yMax)) yMax = 100
  const yPad = Math.max((yMax - yMin) * 0.1, 1)
  return { min: Math.max(0, Math.floor(yMin - yPad)), max: Math.ceil(yMax + yPad) }
}

// ═══════════════════════════════════════════════════════════════
// 主 composable
// ═══════════════════════════════════════════════════════════════

export function useBubblePolarChart(
  selectedSweep:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null),
  membraneWidthMm: Ref<number> | (() => number),
) {
  const sweepRef: Ref<ExtendedBubbleSweepResult | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)

  const widthRef: Ref<number> = isRef(membraneWidthMm)
    ? membraneWidthMm
    : (ref(membraneWidthMm) as unknown as Ref<number>)

  const chartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    const Wmm = widthRef.value
    if (!sweep || !Wmm || Wmm <= 0) {
      return EMPTY_CHART_OPTION
    }

    const {
      profile,
      direction,
      time,
      cycleDurationMs,
      numMeasurements,
      rmsError,
      binCoverage,
    } = sweep
    const numBins = profile.length
    const binWidthDeg = 360 / numBins

    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText = `膜泡单层厚度 · ${directionLabel(direction)}向扫描 · ${formatTime(time)} · ${durMin} min${inProgress ? ' · 进行中' : ''}`

    const meanCov =
      binCoverage.length > 0
        ? (binCoverage.reduce((a, b) => a + b, 0) / binCoverage.length).toFixed(1)
        : '?'
    const minCov =
      binCoverage.length > 0
        ? Math.min(...binCoverage).toFixed(1)
        : '?'

    const lineData = buildAngleBarData(profile, binCoverage, numBins)
    const yRange = computeYRange(lineData)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: '单层膜厚 B(φ)',
        type: 'bar',
        data: lineData,
        itemStyle: {
          color: CHART_COLOR_PRIMARY,
          borderRadius: [0, 0, 0, 0],
        },
        barMaxWidth: 4,
        z: 10,
      },
    ]

    return {
      title: {
        text: titleText,
        subtext:
          `单层剖面 B(φ) · ${numBins} bin (${binWidthDeg.toFixed(1)}°/bin) · ` +
          `测量 ${numMeasurements} 点 · RMS ${(rmsError ?? 0).toFixed(2)}μm · ` +
          `覆盖率 ${meanCov}/bin（最少 ${minCov}）· ` +
          `膜宽 ${Wmm.toFixed(0)} mm`,
        left: 'center',
        top: 6,
        textStyle: { fontSize: 14, fontWeight: 600 },
        subtextStyle: { fontSize: 11, color: '#909399' },
      },
      animation: false,
      grid: {
        left: 70,
        right: 30,
        top: 70,
        bottom: 50,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: '膜泡角度 (°)',
        nameLocation: 'center',
        nameGap: 30,
        min: 0,
        max: 360,
        interval: 60,
        axisLabel: { fontSize: 11, color: '#303133', formatter: (v: number) => `${v}°` },
        splitLine: { lineStyle: { color: '#ebeef5' } },
      },
      yAxis: {
        type: 'value',
        name: '单层膜厚 (μm)',
        min: yRange.min,
        max: yRange.max,
        axisLabel: { fontSize: 11, formatter: (v: number) => v.toFixed(1) },
        nameTextStyle: { fontSize: 12 },
        splitLine: { lineStyle: { color: '#ebeef5' } },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          snap: true,
          label: {
            formatter: (p: { axisDimension: string; value: number }) =>
              p.axisDimension === 'x'
                ? `${p.value.toFixed(1)}°`
                : `${p.value.toFixed(1)} μm`,
          },
        },
        formatter: (params: TooltipParam | TooltipParam[]) => {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          const angle = arr[0].value[0]
          const binIndex = Math.min(
            numBins - 1,
            Math.max(0, Math.round(angle / binWidthDeg - 0.5)),
          )
          const coverage = binCoverage[binIndex] ?? 0

          let html = `<div style="font-weight:600;margin-bottom:4px">角度：${angle.toFixed(1)}°</div>`

          for (const s of arr) {
            const val = s.value[1]
            html += `<div style="display:flex;align-items:center;gap:6px">
              ${s.marker}
              ${s.seriesName}：<b>${val.toFixed(2)} μm</b></div>`
          }

          if (coverage < MIN_RELIABLE_BIN_COVERAGE) {
            html += `<div style="color:#e6a23c;font-size:11px;margin-top:4px">当前角度覆盖不足，数据来自桥接估计</div>`
          }

          return html
        },
      },
      series,
    }
  })

  return { chartOption }
}
