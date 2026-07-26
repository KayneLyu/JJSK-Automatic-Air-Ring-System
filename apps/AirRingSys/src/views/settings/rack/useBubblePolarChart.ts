import { computed, isRef, ref, type Ref } from 'vue'
import { use } from 'echarts/core'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components'
import { LineChart } from 'echarts/charts'
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
  directionColor,
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
  LegendComponent,
  LineChart,
  CanvasRenderer,
])

interface TooltipParam {
  value: [number, number]
  seriesName: string
  marker: string
  color: string
  seriesIndex: number
}

const MIN_RELIABLE_BIN_COVERAGE = 1
const MAX_BRIDGE_GAP_BINS = 3
const DEFAULT_POSITION_BINS = 200

// ═══════════════════════════════════════════════════════════════
// 探头脉冲位置计算 & 上下层剖面按脉冲分箱
// ═══════════════════════════════════════════════════════════════

interface LayerProfiles {
  upperProfile: Array<number | null>
  lowerProfile: Array<number | null>
  binEdgesPulse: number[]
}

/**
 * 由 φ₁、φ₂ 计算测厚仪探头原始脉冲位置（仅限膜宽范围内）
 *
 * membraneWidthPulse = membraneWidthMm / mmPerPulse
 * pulse = frameCenterPulse + membraneWidthPulse × δ/180°
 *   其中 δ = (φ₁ − φ₂)/2, frameCenterPulse = frameLengthPulse / 2
 */
function scannerPulseFromPhiPair(
  phi1: number,
  phi2: number,
  frameCenterPulse: number,
  membraneWidthPulse: number,
): number {
  const diff = ((phi1 - phi2 + 180) % 360) - 180
  const delta = diff / 2
  return frameCenterPulse + membraneWidthPulse * (delta / 180)
}

function computeLayerProfilesByPulse(
  sampleDecomps: SampleDecomposition[],
  lsProfile: number[],
  lsCoverage: number[],
  frameCenterPulse: number,
  membraneWidthPulse: number,
  numBins: number,
): LayerProfiles {
  if (!Number.isFinite(membraneWidthPulse) || membraneWidthPulse <= 0 || numBins <= 0) {
    const n = numBins > 0 ? numBins : DEFAULT_POSITION_BINS
    return {
      upperProfile: new Array(n).fill(null),
      lowerProfile: new Array(n).fill(null),
      binEdgesPulse: Array.from({ length: n + 1 }, (_, i) => i),
    }
  }

  const halfWidth = membraneWidthPulse / 2
  const binEdgesPulse = Array.from(
    { length: numBins + 1 },
    (_, i) => frameCenterPulse - halfWidth + (i / numBins) * membraneWidthPulse,
  )
  const binWidthPulse = membraneWidthPulse / numBins

  if (sampleDecomps.length === 0) {
    const fallback = lsProfile.map((v, i) =>
      lsCoverage[i] >= MIN_RELIABLE_BIN_COVERAGE ? v : null,
    )
    const bridged = bridgeShortGaps(fallback, MAX_BRIDGE_GAP_BINS)
    return { upperProfile: bridged, lowerProfile: bridged, binEdgesPulse }
  }

  const upperBins: number[][] = Array.from({ length: numBins }, () => [])
  const lowerBins: number[][] = Array.from({ length: numBins }, () => [])

  for (const s of sampleDecomps) {
    const pulse = scannerPulseFromPhiPair(s.phi1, s.phi2, frameCenterPulse, membraneWidthPulse)
    const idx = Math.min(
      numBins - 1,
      Math.max(0, Math.floor((pulse - frameCenterPulse + halfWidth) / binWidthPulse)),
    )
    upperBins[idx]!.push(s.b1)
    lowerBins[idx]!.push(s.b2)
  }

  const buildProfile = (bins: number[][]): Array<number | null> => {
    const raw: Array<number | null> = bins.map((vs) => {
      if (vs.length === 0) return null
      const sorted = [...vs].sort((a, b) => a - b)
      return sorted[Math.floor(sorted.length / 2)]!
    })
    return bridgeShortGaps(raw, MAX_BRIDGE_GAP_BINS)
  }

  return {
    upperProfile: buildProfile(upperBins),
    lowerProfile: buildProfile(lowerBins),
    binEdgesPulse,
  }
}

function buildPulseLineData(
  profile: Array<number | null>,
  binEdgesPulse: number[],
): Array<[number, number | null]> {
  return profile.map((v, i) => [binEdgesPulse[i]!, v])
}

// ═══════════════════════════════════════════════════════════════
// 主 composable
// ═══════════════════════════════════════════════════════════════

export function useBubblePolarChart(
  selectedSweep:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null),
  frameLengthPulse: Ref<number> | (() => number),
  membraneWidthMm: Ref<number> | (() => number),
  mmPerPulse: Ref<number> | (() => number),
  compareSweep?:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null),
) {
  const sweepRef: Ref<ExtendedBubbleSweepResult | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)

  const frameRef: Ref<number> = isRef(frameLengthPulse) ? frameLengthPulse : (ref(frameLengthPulse) as unknown as Ref<number>)
  const widthRef: Ref<number> = isRef(membraneWidthMm) ? membraneWidthMm : (ref(membraneWidthMm) as unknown as Ref<number>)
  const ratioRef: Ref<number> = isRef(mmPerPulse) ? mmPerPulse : (ref(mmPerPulse) as unknown as Ref<number>)

  const compareRef: Ref<ExtendedBubbleSweepResult | null> = compareSweep
    ? isRef(compareSweep)
      ? compareSweep
      : (ref(compareSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)
    : ref(null)

  const chartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    const totalPulse = frameRef.value
    const Wmm = widthRef.value
    const ratio = ratioRef.value
    if (!sweep || !totalPulse || totalPulse <= 0 || !Wmm || Wmm <= 0 || !ratio || ratio <= 0) {
      return EMPTY_CHART_OPTION
    }

    const membraneWidthPulse = Wmm / ratio
    const frameCenter = totalPulse / 2
    const halfMembrane = membraneWidthPulse / 2
    const xMin = frameCenter - halfMembrane
    const xMax = frameCenter + halfMembrane
    if (membraneWidthPulse <= 0 || xMin >= xMax) return EMPTY_CHART_OPTION

    const {
      profile,
      direction,
      time,
      cycleDurationMs,
      numMeasurements,
      rmsError,
      maxError,
    } = sweep
    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText = `${directionLabel(direction)}向扫描 · ${formatTime(time)} · ${durMin} min${inProgress ? ' · 进行中' : ''}`

    const numBins = profile.length
    const numPosBins = DEFAULT_POSITION_BINS

    const meanCov =
      sweep.binCoverage.length > 0
        ? (sweep.binCoverage.reduce((a, b) => a + b, 0) / sweep.binCoverage.length).toFixed(1)
        : '?'
    const minCov =
      sweep.binCoverage.length > 0
        ? Math.min(...sweep.binCoverage).toFixed(1)
        : '?'

    const sampleDecomps = sweep.sampleDecompositions ?? []
    const { upperProfile, lowerProfile, binEdgesPulse } =
      computeLayerProfilesByPulse(
        sampleDecomps, profile, sweep.binCoverage,
        frameCenter, membraneWidthPulse, numPosBins,
      )

    const upperLine = buildPulseLineData(upperProfile, binEdgesPulse)
    const lowerLine = buildPulseLineData(lowerProfile, binEdgesPulse)

    const compareData = compareRef.value
    const hasCompare = !!(compareData && compareData.profile.length > 0)

    const computeYRange = (
      data: Array<[number, number | null]>,
      extraProfile?: number[],
    ): { min: number; max: number } => {
      let yMin = Infinity
      let yMax = -Infinity
      for (const pt of data) {
        if (pt[1] != null) {
          if (pt[1] < yMin) yMin = pt[1]
          if (pt[1] > yMax) yMax = pt[1]
        }
      }
      if (extraProfile) {
        for (const v of extraProfile) {
          if (v < yMin) yMin = v
          if (v > yMax) yMax = v
        }
      }
      if (!Number.isFinite(yMin)) yMin = 0
      if (!Number.isFinite(yMax)) yMax = 100
      const yPad = Math.max((yMax - yMin) * 0.1, 1)
      return { min: Math.max(0, Math.floor(yMin - yPad)), max: Math.ceil(yMax + yPad) }
    }

    const compareProfileArr = hasCompare ? compareData!.profile : undefined
    const upperRange = computeYRange(upperLine, compareProfileArr)
    const lowerRange = computeYRange(lowerLine, compareProfileArr)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: '上层', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: upperLine,
        lineStyle: { width: 2, color: '#409EFF' },
        itemStyle: { color: '#409EFF' },
        showSymbol: false, connectNulls: false, z: 10,
      },
      {
        name: '下层', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
        data: lowerLine,
        lineStyle: { width: 2, color: '#E6A23C' },
        itemStyle: { color: '#E6A23C' },
        showSymbol: false, connectNulls: false, z: 5,
      },
    ]

    if (hasCompare) {
      const cSweep = compareData!
      const cColor = directionColor(cSweep.direction)
      const cDisplayProfile =
        cSweep.binCoverage.length === cSweep.profile.length
          ? bridgeShortGaps(
              cSweep.profile.map((v, i) => (cSweep.binCoverage[i] >= MIN_RELIABLE_BIN_COVERAGE ? v : null)),
              MAX_BRIDGE_GAP_BINS,
            )
          : cSweep.profile
      const cBinEdges = Array.from(
        { length: cDisplayProfile.length + 1 },
        (_, i) => xMin + (i / cDisplayProfile.length) * membraneWidthPulse,
      )
      const cLineData = buildPulseLineData(
        cDisplayProfile.map((v) => (typeof v === 'number' ? v : null)),
        cBinEdges,
      )
      const cmp = {
        type: 'line' as const,
        data: cLineData,
        lineStyle: { width: 1.5, color: cColor, type: 'dashed' as const, opacity: 0.6 },
        showSymbol: false, connectNulls: false, z: 1,
      }
      series.push(
        { ...cmp, name: `对比(${directionLabel(cSweep.direction)})`, xAxisIndex: 0, yAxisIndex: 0 },
        { ...cmp, name: `对比(${directionLabel(cSweep.direction)})`, xAxisIndex: 1, yAxisIndex: 1 },
      )
    }

    return {
      title: {
        text: titleText,
        subtext:
          `测量 ${numMeasurements} 点 · RMS ${(rmsError ?? 0).toFixed(2)}μm · ` +
          `覆盖率 ${meanCov}/bin (最少 ${minCov}) · ` +
          `膜宽 ${Wmm.toFixed(0)} mm / ${membraneWidthPulse.toFixed(0)} 脉冲`,
        left: 'center', top: 6,
        textStyle: { fontSize: 14, fontWeight: 600 },
        subtextStyle: { fontSize: 11, color: '#909399' },
      },
      animation: false,
      legend: { bottom: 0, textStyle: { fontSize: 12 } },
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      grid: [
        { left: 70, right: 30, top: 60, height: '35%', containLabel: true },
        { left: 70, right: 30, top: '55%', height: '35%', containLabel: true },
      ],
      xAxis: [
        {
          gridIndex: 0, type: 'value',
          name: '探头位置',
          nameLocation: 'center', nameGap: 30,
          min: xMin, max: xMax,
          axisLabel: { formatter: (v: number) => v.toFixed(0), fontSize: 11, color: '#303133' },
          splitLine: { lineStyle: { color: '#ebeef5' } },
          minorTick: { show: true },
        },
        {
          gridIndex: 1, type: 'value',
          name: '探头位置',
          nameLocation: 'center', nameGap: 30,
          position: 'top',
          min: xMin, max: xMax,
          axisLabel: { formatter: (v: number) => v.toFixed(0), fontSize: 11, color: '#303133' },
          splitLine: { lineStyle: { color: '#ebeef5' } },
          minorTick: { show: true },
        },
      ],
      yAxis: [
        {
          gridIndex: 0, type: 'value', name: '上层膜厚 (μm)',
          min: upperRange.min, max: upperRange.max,
          axisLabel: { fontSize: 11, color: '#409EFF', formatter: (v: number) => v.toFixed(1) },
          nameTextStyle: { color: '#409EFF', fontSize: 12 },
          splitLine: { lineStyle: { color: '#ebeef5' } },
        },
        {
          gridIndex: 1, type: 'value', name: '下层膜厚 (μm)',
          min: lowerRange.min, max: lowerRange.max, inverse: true,
          axisLabel: { fontSize: 11, color: '#E6A23C', formatter: (v: number) => v.toFixed(1) },
          nameTextStyle: { color: '#E6A23C', fontSize: 12 },
          splitLine: { lineStyle: { color: '#ebeef5' } },
        },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross', snap: true,
          label: {
            formatter: (p: { axisDimension: string; value: number }) =>
              p.axisDimension === 'x' ? `脉冲 ${p.value.toFixed(0)}` : `${p.value.toFixed(1)} μm`,
          },
        },
        formatter: (params: TooltipParam | TooltipParam[]) => {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          const pulse = arr[0].value[0]
          const binIdx = Math.min(
            numPosBins - 1,
            Math.max(0, Math.floor((pulse - xMin) / membraneWidthPulse * numPosBins)),
          )

          const upperVal = arr.find((s) => s.seriesName === '上层')?.value[1]
          const lowerVal = arr.find((s) => s.seriesName === '下层')?.value[1]

          let html = `<div style="font-weight:600;margin-bottom:4px">探头位置：${pulse.toFixed(0)} 脉冲</div>`

          if (upperVal != null) {
            html += `<div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#409EFF"></span>
              上层：<b>${Number(upperVal).toFixed(2)} μm</b></div>`
          }
          if (lowerVal != null) {
            html += `<div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#E6A23C"></span>
              下层：<b>${Number(lowerVal).toFixed(2)} μm</b></div>`
          }
          if (upperVal != null && lowerVal != null) {
            const pressing = Number(upperVal) + Number(lowerVal)
            html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #ebeef5;font-size:11px;color:#606266">
              压合厚度 (上+下): <b>${pressing.toFixed(2)} μm</b></div>`
          }
          if (upperProfile[binIdx] == null || lowerProfile[binIdx] == null) {
            html += '<div style="color:#e6a23c;font-size:11px;margin-top:4px">当前位置覆盖不足，数据来自桥接估计</div>'
          }
          if (hasCompare) {
            const cSweep = compareData!
            const cP = cSweep.profile
            if (cP.length > 0) {
              const cIdx = ((pulse - xMin) / membraneWidthPulse) * cP.length
              const cLo = Math.min(cP.length - 1, Math.floor(cIdx))
              const cHi = Math.min(cP.length - 1, cLo + 1)
              const cVal = cP[cLo]! * (1 - (cIdx - cLo)) + cP[cHi]! * (cIdx - cLo)
              html += `<div style="margin-top:8px;padding-top:4px;border-top:1px dashed #dcdfe6;font-size:11px;color:#909399">对比(${directionLabel(cSweep.direction)}): <b>${cVal.toFixed(2)} μm</b></div>`
            }
          }
          return html
        },
      },
      series,
    }
  })

  return { chartOption }
}
