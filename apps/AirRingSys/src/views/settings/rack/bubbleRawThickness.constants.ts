import type { EChartsCoreOption } from 'echarts/core'
import type { BubbleSweepResult } from '@/types/ipc'

export const REFRESH_INTERVAL_MS = 2000
export const DEFAULT_MEMBRANE_WIDTH_MM = 1000
export const DEFAULT_NUM_BINS = 120
export const DEFAULT_PROCESS_DEFORMATION = 1.02
// 首次加载趟数：尽量多拉一些覆盖历史窗口（多趟 × 2000 点下采样 ≈ 30ms/趟）
// 翻页时同样按这个数取更老的数据
export const SWEEP_PAGE_SIZE = 20
export const IN_PROGRESS_GRACE_MS = 5_000

export const MERGED_COLOR = '#67c23a'
export const OVERLAY_OPACITY = 0.25

export const EMPTY_POLAR_OPTION: EChartsCoreOption = {
  title: {
    text: '等待扫描数据…',
    left: 'center',
    top: 'middle',
    textStyle: { color: '#c0c4cc', fontSize: 14, fontWeight: 'normal' },
  },
}

export type DataMode = 'live' | 'historical'
export type ViewMode = 'single' | 'merged'
export type SweepDirection = 'forward' | 'reverse' | 'merged'

export interface MergedSweepResult {
  id: string
  time: number
  direction: 'merged'
  cycleDurationMs: number
  profile: number[]
  numBins: number
  binWidthDeg: number
  rmsError: number
  maxError: number
  numMeasurements: number
  binCoverage: number[]
  binTimestamps?: number[]
  forward: BubbleSweepResult
  reverse: BubbleSweepResult
}

export type ChartSweepData = BubbleSweepResult | MergedSweepResult

export function formatTime(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

export function directionColor(direction: SweepDirection): string {
  if (direction === 'merged') return MERGED_COLOR
  return direction === 'forward' ? '#409eff' : '#e6a23c'
}

export function directionLabel(direction: SweepDirection): string {
  if (direction === 'merged') return '合并'
  return direction === 'forward' ? '正' : '反'
}

export function isInProgress(
  sweep: { time: number; cycleDurationMs: number },
  now: number
): boolean {
  return now - (sweep.time + sweep.cycleDurationMs) < IN_PROGRESS_GRACE_MS
}
