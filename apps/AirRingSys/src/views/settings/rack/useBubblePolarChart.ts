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
import type {
  BinDecomposition,
  SampleDecomposition,
} from './utils/bubbleReconstruction'
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
  sampleDecompositions?: SampleDecomposition[]
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

type PolarPoint = [number | null, number]
const MIN_RELIABLE_BIN_COVERAGE = 1
const MAX_BRIDGE_GAP_BINS = 3

function angularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

export function useBubblePolarChart(
  selectedSweep:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null),
  compareSweep?:
    | Ref<ExtendedBubbleSweepResult | null>
    | (() => ExtendedBubbleSweepResult | null)
) {
  const sweepRef: Ref<ExtendedBubbleSweepResult | null> = isRef(selectedSweep)
    ? selectedSweep
    : (ref(selectedSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)

  const compareRef: Ref<ExtendedBubbleSweepResult | null> = compareSweep
    ? isRef(compareSweep)
      ? compareSweep
      : (ref(compareSweep) as unknown as Ref<ExtendedBubbleSweepResult | null>)
    : ref(null)

  function buildDisplayProfile(
    profile: number[],
    coverage: number[]
  ): Array<number | null> {
    const masked =
      coverage.length !== profile.length
        ? [...profile]
        : profile.map((v, i) =>
      coverage[i] >= MIN_RELIABLE_BIN_COVERAGE ? v : null
    )
    return bridgeShortGaps(masked, MAX_BRIDGE_GAP_BINS)
  }

  function bridgeShortGaps(
    profile: Array<number | null>,
    maxGapBins: number
  ): Array<number | null> {
    const n = profile.length
    if (n === 0 || maxGapBins <= 0) return profile

    const out = [...profile]
    const anchor = out.findIndex((v) => v != null)
    if (anchor < 0) return out

    let idx = (anchor + 1) % n
    while (idx !== anchor) {
      if (out[idx] != null) {
        idx = (idx + 1) % n
        continue
      }

      const start = idx
      let len = 0
      while (out[idx] == null) {
        len += 1
        idx = (idx + 1) % n
        if (idx === anchor) break
      }

      const prevIdx = (start - 1 + n) % n
      const nextIdx = idx
      const prevVal = out[prevIdx]
      const nextVal = out[nextIdx]

      if (
        len <= maxGapBins &&
        prevVal != null &&
        nextVal != null
      ) {
        for (let k = 1; k <= len; k++) {
          const t = k / (len + 1)
          out[(prevIdx + k) % n] = prevVal * (1 - t) + nextVal * t
        }
      }

      if (idx === anchor) break
    }

    return out
  }

  /** 构建一组 profile 的极坐标线数据(纯折线,无散点) */
  function buildPolarLineData(profile: Array<number | null>): PolarPoint[] {
    const numBins = profile.length
    const binWidth = 360 / numBins
    const dataAt = (i: number) => i * binWidth + binWidth / 2
    const data: PolarPoint[] = profile.map(function (v, i) {
      return [v, dataAt(i)]
    })
    data.push([profile[0], dataAt(0)])
    return data
  }

  /** 构建对比扫描趟的纯线数据(无散点) */
  function buildCompareLineData(profile: Array<number | null>): PolarPoint[] {
    const numBins = profile.length
    const binWidth = 360 / numBins
    const dataAt = (i: number) => i * binWidth + binWidth / 2
    const data: PolarPoint[] = profile.map(function (v, i) {
      return [v, dataAt(i)]
    })
    data.push([profile[0], dataAt(0)])
    return data
  }

  const chartOption = computed<EChartsCoreOption>(() => {
    const sweep = sweepRef.value
    if (!sweep) return EMPTY_POLAR_OPTION

    const {
      profile,
      direction,
      time,
      cycleDurationMs,
      numMeasurements,
      rmsError,
      maxError,
    } = sweep
    const color = directionColor(direction)
    const inProgress = isInProgress(sweep, Date.now())
    const durMin = (cycleDurationMs / 60_000).toFixed(1)
    const titleText = `${directionLabel(direction)}向扫描 · ${formatTime(time)} · ${durMin} min${inProgress ? ' · 进行中' : ''}`

    const numBins = profile.length
    const binWidth = 360 / numBins

    // coverage subtext
    const meanCov =
      sweep.binCoverage.length > 0
        ? (
            sweep.binCoverage.reduce((a, b) => a + b, 0) /
            sweep.binCoverage.length
          ).toFixed(1)
        : '?'
    const minCov =
      sweep.binCoverage.length > 0
        ? Math.min(...sweep.binCoverage).toFixed(1)
        : '?'

    const displayProfile = buildDisplayProfile(profile, sweep.binCoverage)
    const lineData = buildPolarLineData(displayProfile)
    const compareData = compareRef.value
    const hasCompare = !!(compareData && compareData.profile.length > 0)
    const sampleDecomps = sweep.sampleDecompositions ?? []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        type: 'line',
        name: `${directionLabel(direction)}向扫描`,
        coordinateSystem: 'polar',
        z: 10,
        data: lineData,
        lineStyle: { width: 2, color },
        showSymbol: false,
        connectNulls: false,
      },
    ]

    if (hasCompare) {
      const cSweep = compareData!
      const cColor = directionColor(cSweep.direction)
      series.push({
        type: 'line',
        name: `${directionLabel(cSweep.direction)}向扫描(对比)`,
        coordinateSystem: 'polar',
        z: 5,
        data: buildCompareLineData(
          buildDisplayProfile(cSweep.profile, cSweep.binCoverage)
        ),
        lineStyle: { width: 2, color: cColor, type: 'dashed', opacity: 0.6 },
        showSymbol: false,
        connectNulls: false,
        emphasis: { focus: 'series' },
      })
    }

    return {
      title: {
        text: titleText,
        subtext: `测量 ${numMeasurements} 点 · RMS ${(rmsError ?? 0).toFixed(2)}μm (max ${(maxError ?? 0).toFixed(2)}μm) · 
覆盖率 ${meanCov}/bin (最少 ${minCov}) · 
单层原始膜厚 (f(αC+δ) + f(αC-δ) , αC=上旋角+90°)`,
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
                ? `${p.value.toFixed(0)}°`
                : `${p.value.toFixed(1)} μm`
            },
          },
        },
        formatter: function (params: TooltipParam | TooltipParam[]) {
          const arr = Array.isArray(params) ? params : [params]
          if (arr.length === 0) return ''
          const rawAngle = Number(arr[0].value[1].toFixed())
          const currentBin = Math.floor(rawAngle / binWidth) % numBins
          const coverage = sweep.binCoverage

          const coverageAt = (i: number): number => {
            if (coverage.length !== numBins) return 1
            return coverage[i] ?? 0
          }

          const interpDisplay = (angleDeg: number): number | null => {
            const a = ((angleDeg % 360) + 360) % 360
            const idx = a / binWidth
            const lo = Math.floor(idx) % numBins
            const hi = (lo + 1) % numBins
            const w = idx - Math.floor(idx)
            const loVal = displayProfile[lo]
            const hiVal = displayProfile[hi]
            if (loVal == null || hiVal == null) return null
            return loVal * (1 - w) + hiVal * w
          }

          // profile 插值: 保证 cursorB 与 matchedB 同源
          const interpB = (angleDeg: number): number | null => {
            return interpDisplay(angleDeg)
          }
          const cursorB = interpB(rawAngle)
          const cursorCovered =
            coverageAt(currentBin) >= MIN_RELIABLE_BIN_COVERAGE

          // 按角度动态匹配样本级反解，取游标所在侧对侧的 φ (压合 = B₁ + B₂)
          // matchedPhi = 2·αC − cursorAngle; B 从 profile 插值, 保证正反方向对称
          let matchedPhi = 0
          let matchedB: number | null = null
          let matchTs = 0
          if (sampleDecomps.length > 0) {
            let bestIdx = 0
            let bestDist = Infinity
            for (let i = 0; i < sampleDecomps.length; i++) {
              const d1 = angularDistance(rawAngle, sampleDecomps[i].phi1)
              const d2 = angularDistance(rawAngle, sampleDecomps[i].phi2)
              const d = d1 < d2 ? d1 : d2
              if (d < bestDist) { bestDist = d; bestIdx = i }
            }
            const s = sampleDecomps[bestIdx]
            matchTs = s.ts
            const alphaCenter = ((s.phi1 + s.phi2) / 2 + 360) % 360
            matchedPhi = ((2 * alphaCenter - rawAngle) % 360 + 360) % 360
            matchedB = interpB(matchedPhi)
          } else {
            // 回退: 旧的 per-bin 代表样本反解
            const decomp = sweep.binDecompositions?.[currentBin]
            if (decomp && decomp.ts > 0) {
              matchTs = decomp.ts
              const alphaCenter = ((decomp.phi1 + decomp.phi2) / 2 + 360) % 360
              matchedPhi = ((2 * alphaCenter - rawAngle) % 360 + 360) % 360
              matchedB = interpB(matchedPhi)
            }
          }

          const cursorText = cursorB == null ? '--' : Number(cursorB.toFixed(2))
          let html = `<div style="font-weight:600;margin-bottom:4px">角度：${rawAngle}° ｜ 厚度：${cursorText} μm</div>`
          if (cursorB == null) {
            html += '<div style="color:#e6a23c;font-size:11px">当前角度覆盖不足，显示值不可靠</div>'
            html += `<div style="color:#c0c4cc;font-size:11px">覆盖阈值: 每 bin ≥ ${MIN_RELIABLE_BIN_COVERAGE.toFixed(0)}</div>`
          } else if (!cursorCovered) {
            html += '<div style="color:#e6a23c;font-size:11px">当前角度来自短缺口桥接估计，请谨慎参考</div>'
          }

          if (matchTs > 0 && cursorB != null && matchedB != null) {
            const pressing_thickness = Number((cursorB + matchedB).toFixed(2))
            html += `<div style="color:#c0c4cc;font-size:11px">测厚时间 ${formatTime(matchTs)}</div>`
            html += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #ebeef5;font-size:11px">压合厚度: ${Number(cursorB.toFixed(2))} + ${Number(matchedB.toFixed(2))}(${matchedPhi.toFixed()}°) = <b>${pressing_thickness} μm</b></div>`
          } else if (matchTs > 0) {
            html += '<div style="margin-top:6px;padding-top:4px;border-top:1px solid #ebeef5;font-size:11px;color:#e6a23c">压合厚度计算因覆盖不足被跳过</div>'
          }

          // 对比扫描趟插值
          if (hasCompare) {
            const cSweep = compareData!
            const cProfile = cSweep.profile
            const cNumBins = cProfile.length
            if (cNumBins > 0) {
              const cBinWidth = 360 / cNumBins
              const cIdx = rawAngle / cBinWidth
              const cLo = Math.floor(cIdx) % cNumBins
              const cHi = (cLo + 1) % cNumBins
              const cW = cIdx - Math.floor(cIdx)
              const cVal = cProfile[cLo] * (1 - cW) + cProfile[cHi] * cW
              html += `<div style="margin-top:8px;padding-top:4px;border-top:1px dashed #dcdfe6;font-size:11px;color:#909399">对比(${directionLabel(cSweep.direction)}): <b>${cVal.toFixed(2)} μm</b></div>`
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
          formatter: function (v: number) {
            return v % 30 === 0 ? `${v.toFixed(0)}°` : ''
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
        axisLabel: {
          fontSize: 10,
          color: '#909399',
          formatter: function (v: number) {
            return `${v}`
          },
        },
        splitLine: { lineStyle: { color: '#ebeef5' } },
        splitArea: { show: false },
      },
      series,
    }
  })

  return { chartOption }
}
