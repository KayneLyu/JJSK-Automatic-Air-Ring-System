/**
 * 测厚仪扫描趟 → B(φ) 重构
 *
 * 流程:
 *   1. 加载所有测厚仪扫描趟 (db-get-sweep-summaries)
 *   2. 用户选中某趟作为 baseline
 *   3. 取 baseline + 前 N-1 趟 (滑动窗口) 的所有样本
 *   4. 对每个样本: 由 ts 反查上旋趟 → timeToAngle 算 θ
 *   5. reconstructBubbleThickness → B(φ)
 *   6. 缓存 B(φ) per baseline, 导航时优先命中缓存
 */

import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import type {
  BubbleWindowReconstructionResult,
  ICalibrationResults,
  MeasurementTripleInput,
  RotationTripSummaryRow,
  SweepPoint,
  SweepSummaryRow,
} from '@/types/ipc'
import {
  REFRESH_INTERVAL_MS,
  DEFAULT_MEMBRANE_WIDTH_MM,
  DEFAULT_NUM_BINS,
  DEFAULT_PROCESS_DEFORMATION,
  type DataMode,
} from './bubbleRawThickness.constants'
import { timeToAngle } from './utils/sampleDecompose'
import { calcThickness, type ThicknessConfig } from './utiles'

interface DeviceConstants {
  airAD?: string
  materialGain?: string
}

/** 测厚仪扫描趟(供 chart 反解展示用) — 与 useBubbleSweeps 内的同名类型字段一致 */
export interface ScannerSweepLite {
  tripStartTime: number
  tripDurationMs: number
  direction: 'forward' | 'reverse'
  points: SweepPoint[]
}

/** baseline 的重构结果 */
export interface ReconstructedSweep {
  baseline: SweepSummaryRow
  windowIds: string[]
  result: BubbleWindowReconstructionResult
  /** 重构用的样本数 */
  numSamples: number
}

/** 滑动窗口最大包含的扫描趟数 */
export const SCANNER_SLIDING_WINDOW = 640
/** 滑动窗口最大时间跨度 (ms)：超出此范围的趟不参与重构，防止跨工艺状态数据混杂 */
export const WINDOW_MAX_TIME_SPAN_MS = 10 * 60_000
/** 上旋趟匹配容忍间隙 (ms)：超过该值则丢弃该测点，避免错配到过时上旋趟 */
export const UPPER_SWEEP_GAP_TOLERANCE_MS = 1_000
/** 极小时间抖动忽略阈值 (ms)：避免 5~20ms 级别日志噪声 */
export const UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS = 50
/** 重建分箱自适应下限：欠覆盖场景下降分箱，优先保证覆盖连续性 */
export const MIN_ADAPTIVE_NUM_BINS = 90
/** 分箱目标覆盖率：低于该比例时下调分箱 */
export const TARGET_BIN_COVERAGE_RATIO = 0.8
/** 扫描趟摘要默认拉取数量（首屏） */
export const SCANNER_TRIPS_FETCH_COUNT = 400
/** 上旋趟摘要刷新最短间隔，避免高频重复查询 */
export const UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS = 10_000
/** 重建窗口上旋趟拉取数量（较大，优先保证时间覆盖） */
export const UPPER_SWEEPS_FETCH_COUNT = 1200
/** 本页实时刷新间隔（降低 utility 查询压力） */
export const RECON_REFRESH_INTERVAL_MS = 5_000
/** 间隙告警汇总最短间隔，避免按样本刷屏 */
export const GAP_WARNING_SUMMARY_INTERVAL_MS = 15_000

interface UpperSweepGapStats {
  droppedLateCount: number
  maxDroppedLateGapMs: number
  afterEndCount: number
  maxAfterEndGapMs: number
  beforeFirstCount: number
  maxBeforeFirstGapMs: number
}

export function useScannerTripReconstruction() {
  // 上旋趟(用于 θ_max / 起始时间)
  const upperSweeps = ref<RotationTripSummaryRow[]>([])
  // 测厚仪扫描趟 summary
  const scannerTrips = ref<SweepSummaryRow[]>([])
  // 详细 samples(按 sweepId 缓存)
  const samplesCache = shallowRef<Map<string, SweepPoint[]>>(new Map())
  // 重构结果(按 baseline sweepId 缓存)
  const reconstructionCache = shallowRef<Map<string, ReconstructedSweep>>(new Map())

  const selectedIndex = ref(0)
  const dataMode = ref<DataMode>('live')
  const isRefreshing = ref(false)
  const isReconstructing = ref(false)
  const autoRefresh = ref(true)
  const lastUpdatedAt = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const isConnected = ref(false)
  const hasOlderData = ref(true)
  const lastUpperSweepsRefreshAt = ref(0)

  const thicknessCfg = ref<ThicknessConfig>({ airAD: 50300, gain: 1.0 })
  const calResults = ref<ICalibrationResults>({})

  async function loadConfigs() {
    try {
      const dev = (await window.ipcApi.invoke(
        'config-get-device-constants'
      )) as DeviceConstants
      if (dev?.airAD) thicknessCfg.value.airAD = Number(dev.airAD) || 50300
      if (dev?.materialGain) thicknessCfg.value.gain = Number(dev.materialGain) || 1.0
    } catch {
      /* 默认值即可 */
    }
    try {
      const cal = (await window.ipcApi.invoke(
        'config-get-calibration-results'
      )) as ICalibrationResults
      calResults.value = cal
    } catch {
      /* 默认值即可 */
    }
  }

  /** 几何/标定参数 */
  const params = computed(() => {
    const {
      frameLengthMM,
      frameLengthPulse,
      mmPerPulse: storedMmPerPulse,
      membraneWidthMm: storedMembraneWidthMm,
      upperMaxAngle,
      upperDistance,
      rollerTractionSpeed,
    } = calResults.value
    const mmPerPulse =
      storedMmPerPulse !== undefined &&
      Number.isFinite(storedMmPerPulse) &&
      storedMmPerPulse > 0
        ? storedMmPerPulse
        : frameLengthMM && frameLengthPulse && frameLengthPulse > 0
          ? frameLengthMM / frameLengthPulse
          : 0.1
    const airADNum =
      Number(thicknessCfg.value.airAD) > 0
        ? Number(thicknessCfg.value.airAD)
        : 50300
    const gainNum =
      thicknessCfg.value.gain !== undefined && Number.isFinite(thicknessCfg.value.gain)
        ? thicknessCfg.value.gain
        : 1.0
    const transportDelayMs =
      upperDistance != null &&
      upperDistance > 0 &&
      rollerTractionSpeed != null &&
      rollerTractionSpeed > 0
        ? (upperDistance / rollerTractionSpeed) * 1000
        : undefined
    return {
      membraneWidthMm:
        storedMembraneWidthMm !== undefined && storedMembraneWidthMm > 0
          ? storedMembraneWidthMm
          : frameLengthMM && frameLengthMM > 0
            ? frameLengthMM
            : DEFAULT_MEMBRANE_WIDTH_MM,
      thetaMaxDeg: upperMaxAngle && upperMaxAngle > 0 ? upperMaxAngle : 300,
      mmPerPulse,
      airAD: airADNum,
      gain: gainNum,
      numBins: DEFAULT_NUM_BINS,
      processDeformationFactor: DEFAULT_PROCESS_DEFORMATION,
      transportDelayMs,
    }
  })

  // 按时间升序的扫描趟
  const sortedScannerTrips = computed(() =>
    [...scannerTrips.value].sort((a, b) => a.startTs - b.startTs)
  )

  const selectedBaseline = computed<SweepSummaryRow | null>(
    () => sortedScannerTrips.value[selectedIndex.value] ?? null
  )

  const canGoPrev = computed(
    () => !isRefreshing.value && selectedIndex.value > 0
  )
  const canGoNext = computed(
    () => selectedIndex.value < sortedScannerTrips.value.length - 1
  )

  let lastGapSummaryWarnAt = 0

  function getEffectiveTransportDelayMs(): number {
    const delay = params.value.transportDelayMs
    return delay != null && Number.isFinite(delay) && delay > 0 ? delay : 0
  }

  function getUpperSweepsCoverage(): { startTs: number; endTs: number } | null {
    const first = upperSweeps.value[0]
    const last = upperSweeps.value[upperSweeps.value.length - 1]
    if (!first || !last) return null
    return {
      startTs: first.time,
      endTs: last.time + Math.max(0, last.cycleDurationMs),
    }
  }

  function findLatestReconstructableIndex(rows: SweepSummaryRow[]): number {
    if (rows.length === 0) return -1
    const coverage = getUpperSweepsCoverage()
    if (!coverage) return rows.length - 1
    const transportDelayMs = getEffectiveTransportDelayMs()
    const upperEnd = coverage.endTs + UPPER_SWEEP_GAP_TOLERANCE_MS
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].endTs - transportDelayMs <= upperEnd) return i
    }
    return -1
  }

  function alignSelectedBaselineToUpperCoverage() {
    if (dataMode.value !== 'live') return
    const rows = sortedScannerTrips.value
    if (rows.length === 0) return
    const idx = findLatestReconstructableIndex(rows)
    if (idx >= 0 && idx !== selectedIndex.value) {
      selectedIndex.value = idx
    }
  }

  /** 给定 ts, 找出包含它的上旋趟(用于 timeToAngle 算 θ) */
  function findUpperSweepAt(
    ts: number,
    gapStats?: UpperSweepGapStats
  ): RotationTripSummaryRow | null {
    const sweeps = upperSweeps.value
    // 上旋趟按 time 升序, 用二分定位 time <= ts 的最后一个,避免 O(samples*trips) 的线性扫描。
    let lo = 0
    let hi = sweeps.length - 1
    let idx = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (sweeps[mid].time <= ts) {
        idx = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    const candidate: RotationTripSummaryRow | null = idx >= 0 ? sweeps[idx] : null
    if (candidate) {
      const end = candidate.time + candidate.cycleDurationMs
      if (ts <= end) {
        return candidate
      }
      // ts 落在候补趟结束之后 → 间隙
      const gapMs = ts - end
      if (gapMs <= UPPER_SWEEP_GAP_IGNORE_WARN_BELOW_MS) {
        // 5~20ms 级别边界抖动视为同趟尾部,不告警
        return candidate
      }
      if (gapMs > UPPER_SWEEP_GAP_TOLERANCE_MS) {
        // 超过容忍阈值时直接丢弃该测点,避免将历史上旋趟硬匹配到当前测厚
        if (gapStats) {
          gapStats.droppedLateCount += 1
          gapStats.maxDroppedLateGapMs = Math.max(
            gapStats.maxDroppedLateGapMs,
            gapMs
          )
        }
        return null
      }
      if (gapStats) {
        gapStats.afterEndCount += 1
        gapStats.maxAfterEndGapMs = Math.max(gapStats.maxAfterEndGapMs, gapMs)
      }
    } else if (upperSweeps.value.length > 0) {
      // ts 在所有上旋趟之前
      const gapMs = upperSweeps.value[0].time - ts
      if (gapStats) {
        gapStats.beforeFirstCount += 1
        gapStats.maxBeforeFirstGapMs = Math.max(
          gapStats.maxBeforeFirstGapMs,
          gapMs
        )
      }
    }
    // 不在任何一趟内, 退回用最近的
    return candidate
  }

  async function ensureUpperSweepsCoverage(
    windowStartTs: number,
    windowEndTs: number
  ): Promise<void> {
    if (params.value.transportDelayMs == null) return
    const transportDelayMs = getEffectiveTransportDelayMs()
    const targetStartTs = windowStartTs - transportDelayMs
    const targetEndTs = windowEndTs - transportDelayMs
    const coverage = getUpperSweepsCoverage()
    if (
      coverage &&
      coverage.startTs <= targetStartTs &&
      coverage.endTs >= targetEndTs
    ) {
      return
    }
    const result = (await window.ipcApi.invoke(
      'db-get-latest-rotation-trips',
      UPPER_SWEEPS_FETCH_COUNT,
      targetEndTs + 1
    )) as RotationTripSummaryRow[]
    upperSweeps.value = [...result].sort((a, b) => a.time - b.time)
    lastUpperSweepsRefreshAt.value = Date.now()
  }

  /** 加载指定扫描趟的 samples — 带 in-flight dedup,避免并发重复查询 */
  const inFlightSamples = new Map<string, Promise<SweepPoint[]>>()
  async function loadSamples(trip: SweepSummaryRow): Promise<SweepPoint[]> {
    const cached = samplesCache.value.get(trip.sweepId)
    if (cached) return cached
    const inflight = inFlightSamples.get(trip.sweepId)
    if (inflight) return inflight
    if (!trip.startTs || !trip.endTs) return []
    const promise = (async () => {
      try {
        const pts = (await window.ipcApi.invoke(
          'db-get-sweep-points-by-range',
          trip.startTs,
          trip.endTs
        )) as SweepPoint[]
        samplesCache.value.set(trip.sweepId, pts)
        return pts
      } catch {
        return []
      } finally {
        inFlightSamples.delete(trip.sweepId)
      }
    })()
    inFlightSamples.set(trip.sweepId, promise)
    return promise
  }

  /** 滑动窗口: baseline + 前 N-1 趟,受时间跨度约束 */
  function getWindowTrips(
    baseline: SweepSummaryRow
  ): SweepSummaryRow[] {
    const all = sortedScannerTrips.value
    const idx = all.findIndex((s) => s.sweepId === baseline.sweepId)
    if (idx < 0) return [baseline]
    // 趟数约束
    const countStart = Math.max(0, idx - (SCANNER_SLIDING_WINDOW - 1))
    // 时间约束: 不取早于 baseline.startTs - WINDOW_MAX_TIME_SPAN_MS 的趟
    const baselineStart = baseline.startTs
    let timeStart = countStart
    while (
      timeStart < idx &&
      baselineStart - all[timeStart].startTs > WINDOW_MAX_TIME_SPAN_MS
    ) {
      timeStart++
    }
    // 取两者中更严格的上限
    const start = Math.max(countStart, timeStart)
    const trips = all.slice(start, idx + 1)
    if (trips.length < 2 && idx > 0) {
      // 至少保底 2 趟（含 baseline），避免样本太少无法求解
      return all.slice(Math.max(0, idx - 1), idx + 1)
    }
    return trips
  }

  /** 用 (pos, ad, ts) + 上旋趟信息 构造测量三元组,δ 居中 + 边外过滤 */
  function buildMeasurements(
    samples: SweepPoint[],
    airAD: number,
    gain: number
  ): MeasurementTripleInput[] {
    const p = params.value
    const transportDelayMs = getEffectiveTransportDelayMs()
    const gapStats: UpperSweepGapStats = {
      droppedLateCount: 0,
      maxDroppedLateGapMs: 0,
      afterEndCount: 0,
      maxAfterEndGapMs: 0,
      beforeFirstCount: 0,
      maxBeforeFirstGapMs: 0,
    }

    // 第一遍: 构建所有三元组
    const all: MeasurementTripleInput[] = []
    for (const s of samples) {
      if (s.ad <= 0 || s.ad >= airAD) continue
      const alignedTs = s.ts - transportDelayMs
      const upper = findUpperSweepAt(alignedTs, gapStats)
      if (!upper) continue
      const tInTrip = alignedTs - upper.time
      const tHalf = upper.cycleDurationMs / 2
      if (tInTrip < 0 || tInTrip > upper.cycleDurationMs) continue
      const theta = timeToAngle(
        tInTrip,
        upper.direction === 'forward',
        tHalf,
        p.thetaMaxDeg
      )
      const x = s.pos * p.mmPerPulse
      const T = calcThickness(s.ad, { airAD, gain })
      if (T <= 0) continue
      all.push({ upperAngleDeg: theta, scannerPosMm: x, thickness: T, timestamp: s.ts })
    }

    if (all.length === 0) return []

    const hasGapIssue =
      gapStats.droppedLateCount > 0 ||
      gapStats.afterEndCount > 0 ||
      gapStats.beforeFirstCount > 0
    if (hasGapIssue) {
      const now = Date.now()
      if (now - lastGapSummaryWarnAt >= GAP_WARNING_SUMMARY_INTERVAL_MS) {
        lastGapSummaryWarnAt = now
        console.warn(
          `[findUpperSweepAt] 样本匹配汇总: droppedLate=${gapStats.droppedLateCount}(max=${gapStats.maxDroppedLateGapMs.toFixed(0)}ms) afterEnd=${gapStats.afterEndCount}(max=${gapStats.maxAfterEndGapMs.toFixed(0)}ms) beforeFirst=${gapStats.beforeFirstCount}(max=${gapStats.maxBeforeFirstGapMs.toFixed(0)}ms) totalSamples=${samples.length} transportDelay=${transportDelayMs.toFixed(0)}ms`
        )
      }
    }

    // 计算 δ 分布,找扫描中心偏移
    // δ = x/W × 180° — 对于对称扫描,δ 应分布在 [-90°,90°] 附近
    // 若零点偏移,δ 中位数即为偏移量
    const W = p.membraneWidthMm
    const deltas = all.map((m) => (m.scannerPosMm / W) * 180)
    deltas.sort((a, b) => a - b)
    const deltaCenter = deltas[Math.floor(deltas.length / 2)] // 中位数
    const halfSpan = Math.max(
      Math.abs(deltas[0] - deltaCenter),
      Math.abs(deltas[deltas.length - 1] - deltaCenter)
    )
    console.log(
      `[buildMeasurements] δ 中位数=${deltaCenter.toFixed(1)}° 半跨=${halfSpan.toFixed(1)}° 
(${deltas[0].toFixed(0)}~${deltas[deltas.length - 1].toFixed(0)})`
    )

    // 第二遍: δ 居中后过滤 |δ| > 90° (膜边外)
    const triples: MeasurementTripleInput[] = []
    let edgeRejected = 0
    for (const m of all) {
      const deltaCentered = (m.scannerPosMm / W) * 180 - deltaCenter
      if (Math.abs(deltaCentered) > 90) {
        edgeRejected++
        continue
      }
      // 更新 scannerPosMm 为居中后的值,使下游 computePhiPair 直接得到正确的 δ
      const centeredX = (deltaCentered / 180) * W
      triples.push({ ...m, scannerPosMm: centeredX })
    }
    if (edgeRejected > 0) {
      console.log(
        `[buildMeasurements] δ 居中后过滤 ${edgeRejected} 条边外测量(|δ|>90°)`
      )
    }
    return triples
  }

  function estimateCoverageRatio(
    measurements: MeasurementTripleInput[],
    membraneWidthMm: number,
    numBins: number
  ): { coveredBins: number; ratio: number } {
    if (measurements.length === 0 || numBins <= 0 || membraneWidthMm <= 0) {
      return { coveredBins: 0, ratio: 0 }
    }

    const binWidth = 360 / numBins
    const covered = new Array<boolean>(numBins).fill(false)
    for (const m of measurements) {
      const delta = (m.scannerPosMm / membraneWidthMm) * 180
      const alphaCenter = ((m.upperAngleDeg + 90) % 360 + 360) % 360
      const phi1 = ((alphaCenter + delta) % 360 + 360) % 360
      const phi2 = ((alphaCenter - delta) % 360 + 360) % 360
      covered[Math.floor(phi1 / binWidth) % numBins] = true
      covered[Math.floor(phi2 / binWidth) % numBins] = true
    }
    const coveredBins = covered.filter(Boolean).length
    return {
      coveredBins,
      ratio: coveredBins / numBins,
    }
  }

  /**
   * 为给定 baseline 计算 B(φ)
   * - 命中缓存直接返回
   * - 否则加载窗口内所有 samples, 重建, 写缓存
   */
  async function reconstructForBaseline(
    baseline: SweepSummaryRow
  ): Promise<ReconstructedSweep | null> {
    const cached = reconstructionCache.value.get(baseline.sweepId)
    if (cached) return cached
    if (params.value.membraneWidthMm <= 0) return null
    isReconstructing.value = true
    try {
      const windowTrips = getWindowTrips(baseline)
      const windowStartTs = windowTrips[0]?.startTs ?? baseline.startTs
      const windowEndTs = baseline.endTs
      await ensureUpperSweepsCoverage(windowStartTs, windowEndTs)
      // 并行加载窗口内所有 trips 的 samples(本地 SQLite,64 路并发 OK)
      const batches = await Promise.all(windowTrips.map((t) => loadSamples(t)))
      const allSamples: SweepPoint[] = []
      for (const pts of batches) allSamples.push(...pts)
      const transportDelayMs = getEffectiveTransportDelayMs()
      const coverage = getUpperSweepsCoverage()
      const minSampleTs = coverage
        ? coverage.startTs - UPPER_SWEEP_GAP_TOLERANCE_MS + transportDelayMs
        : Number.NEGATIVE_INFINITY
      const maxSampleTs = coverage
        ? coverage.endTs + UPPER_SWEEP_GAP_TOLERANCE_MS + transportDelayMs
        : Number.POSITIVE_INFINITY
      const samplesForReconstruction = allSamples.filter(
        (s) => s.ts >= minSampleTs && s.ts <= maxSampleTs
      )
      const p = params.value
      const measurements = buildMeasurements(samplesForReconstruction, p.airAD, p.gain)
      if (measurements.length < 50) {
        // 数据太少,放弃
        return null
      }
      const baseCoverage = estimateCoverageRatio(
        measurements,
        p.membraneWidthMm,
        p.numBins
      )
      // 欠覆盖场景自适应降低分箱数,减少稀疏分布下的角度空洞
      const coverageDrivenBins =
        baseCoverage.ratio >= TARGET_BIN_COVERAGE_RATIO
          ? p.numBins
          : Math.floor((p.numBins * baseCoverage.ratio) / TARGET_BIN_COVERAGE_RATIO)
      const adaptiveNumBins = Math.max(
        MIN_ADAPTIVE_NUM_BINS,
        Math.min(
          p.numBins,
          Math.floor(measurements.length / 6),
          coverageDrivenBins
        )
      )
      if (adaptiveNumBins !== p.numBins) {
        console.log(
          `[B(φ)] 分箱自适应: ${p.numBins} -> ${adaptiveNumBins} (meas=${measurements.length}, baseCoverage=${baseCoverage.coveredBins}/${p.numBins})`
        )
      }
      const result = (await window.ipcApi.invoke(
        'bubble-reconstruct-window',
        {
          measurements,
          membraneWidthMm: p.membraneWidthMm,
          numBins: adaptiveNumBins,
          processDeformationFactor: p.processDeformationFactor,
          preferAfterTs: baseline.startTs,
        }
      )) as BubbleWindowReconstructionResult | null
      if (!result) return null

      // ---- 诊断日志 ----
      const mThick = measurements.map((m) => m.thickness)
      const mMean = mThick.reduce((a, b) => a + b, 0) / mThick.length
      const mStd = Math.sqrt(
        mThick.reduce((s, v) => s + (v - mMean) ** 2, 0) / mThick.length
      )
      const pMin = Math.min(...result.profile)
      const pMax = Math.max(...result.profile)
      const pRange = pMax - pMin
      const pMean =
        result.profile.reduce((a, b) => a + b, 0) / result.profile.length
      const coveredBins = result.binCoverage.filter((c) => c > 0).length
      console.log(
        `[B(φ)] trip=${baseline.sweepId.slice(-8)} 
window=${windowTrips.length}趟(${((baseline.startTs - windowTrips[0].startTs) / 60_000).toFixed(1)}min) 
    samples=${allSamples.length}→used=${samplesForReconstruction.length}→meas=${measurements.length}`
      )
      console.log(
        `[B(φ)] 标定: W=${p.membraneWidthMm.toFixed(0)}mm θmax=${p.thetaMaxDeg.toFixed(0)}° 
mm/pls=${p.mmPerPulse.toFixed(4)} airAD=${p.airAD} gain=${p.gain.toFixed(3)}`
      )
      console.log(
        `[B(φ)] 测量: mean=${mMean.toFixed(2)}μm σ=${mStd.toFixed(2)}μm 
范围[${Math.min(...mThick).toFixed(1)},${Math.max(...mThick).toFixed(1)}]`
      )
      console.log(
        `[B(φ)] 剖面: mean=${pMean.toFixed(2)}μm 范围[${pMin.toFixed(1)},${pMax.toFixed(1)}] 
波动=${pRange.toFixed(1)}μm(${((pRange / pMean) * 100).toFixed(1)}%) 
RMS=${result.rmsError.toFixed(2)}μm maxErr=${result.maxError.toFixed(2)}μm 
覆盖=${coveredBins}/${result.numBins}bin`
      )

      // ---- φ₁/φ₂ 分布诊断: 采样 100 个测量看几何映射 ----
      const sampleN = Math.min(100, measurements.length)
      const step = Math.max(1, Math.floor(measurements.length / sampleN))
      const phiDist: { theta: number; x: number; delta: number; phi1: number; phi2: number; T: number }[] = []
      for (let i = 0; i < measurements.length; i += step) {
        const m = measurements[i]
        const delta = (m.scannerPosMm / p.membraneWidthMm) * 180
        phiDist.push({
          theta: m.upperAngleDeg,
          x: m.scannerPosMm,
          delta,
          phi1: ((m.upperAngleDeg + 90 + delta) % 360 + 360) % 360,
          phi2: ((m.upperAngleDeg + 90 - delta) % 360 + 360) % 360,
          T: m.thickness,
        })
      }
      const thetas = phiDist.map((d) => d.theta)
      const deltas = phiDist.map((d) => d.delta)
      const separations = phiDist.map((d) => {
        const diff = Math.abs(d.phi1 - d.phi2) % 360
        return Math.min(diff, 360 - diff)
      })
      console.log(
        `[B(φ)] 几何: θ∈[${Math.min(...thetas).toFixed(0)},${Math.max(...thetas).toFixed(0)}]° 
δ∈[${Math.min(...deltas).toFixed(0)},${Math.max(...deltas).toFixed(0)}]° 
|φ₁-φ₂|∈[${Math.min(...separations).toFixed(0)},${Math.max(...separations).toFixed(0)}]°`
      )
      const entry: ReconstructedSweep = {
        baseline,
        windowIds: windowTrips.map((t) => t.sweepId),
        result,
        numSamples: measurements.length,
      }
      reconstructionCache.value.set(baseline.sweepId, entry)
      return entry
    } catch (err) {
      console.error('[reconstructForBaseline] failed', err)
      return null
    } finally {
      isReconstructing.value = false
    }
  }

  /** 当前选中的 baseline 的重构结果(异步加载) */
  const currentReconstruction = shallowRef<ReconstructedSweep | null>(null)

  /**
   * 防快速翻页把队列打满:150ms 内多次切 baseline 只触发最后一次
   * - 切了立刻拿缓存出来, 不让 chart 闪空
   * - 150ms 静止后真重建, 重启预热相邻
   */
  const RECON_DEBOUNCE_MS = 150
  let pendingBaselineId: string | null = null
  let debounceTimer: number | null = null
  let queuedReconstructionId: string | null = null
  let isReconstructionQueueRunning = false

  function scheduleReconstruction(id: string) {
    if (pendingBaselineId === id) return
    pendingBaselineId = id
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      const targetId = pendingBaselineId
      pendingBaselineId = null
      debounceTimer = null
      if (targetId) enqueueReconstruction(targetId)
    }, RECON_DEBOUNCE_MS)
  }

  function enqueueReconstruction(id: string) {
    // 仅保留最新目标：慢重建期间新请求会覆盖旧请求，避免并发打满 CPU。
    queuedReconstructionId = id
    if (!isReconstructionQueueRunning) {
      void drainReconstructionQueue()
    }
  }

  async function drainReconstructionQueue() {
    if (isReconstructionQueueRunning) return
    isReconstructionQueueRunning = true
    try {
      while (queuedReconstructionId) {
        const id = queuedReconstructionId
        queuedReconstructionId = null
        await runReconstruction(id)
      }
    } finally {
      isReconstructionQueueRunning = false
    }
  }

  async function runReconstruction(id: string) {
    const baseline = sortedScannerTrips.value.find((s) => s.sweepId === id)
    if (!baseline) return
    if (selectedBaseline.value?.sweepId !== id) return
    const fresh = await reconstructForBaseline(baseline)
    if (fresh && selectedBaseline.value?.sweepId === id) {
      currentReconstruction.value = fresh
    }
    // 预热相邻 baseline 的 samples, 让翻页 0 DB hit
    prefetchNeighbors(baseline)
  }

  function prefetchNeighbors(baseline: SweepSummaryRow) {
    const all = sortedScannerTrips.value
    const idx = all.findIndex((s) => s.sweepId === baseline.sweepId)
    if (idx < 0) return
    for (const ni of [idx - 1, idx + 1]) {
      if (ni < 0 || ni >= all.length) continue
      void loadSamples(all[ni])
    }
  }

  watch(
    () => selectedBaseline.value?.sweepId,
    (id) => {
      if (!id) {
        currentReconstruction.value = null
        return
      }
      // 立即拿缓存填充, 不让 chart 闪空
      currentReconstruction.value =
        reconstructionCache.value.get(id) ?? null
      // 调度真重建(防抖)
      scheduleReconstruction(id)
    },
    { immediate: true }
  )

  /**
   * 当前 baseline 的 per-sample 数据 + 所属上旋趟参数
   * 供 chart tooltip 反解使用
   *
   * - tripStartTime / tripDurationMs / direction = 上旋趟(用于 timeToAngle 算 θ)
   * - points = baseline 扫描趟的样本
   */
  const currentScannerSweep = shallowRef<ScannerSweepLite | null>(null)
  watch(
    () => selectedBaseline.value?.sweepId,
    async (id) => {
      if (!id) {
        currentScannerSweep.value = null
        return
      }
      const baseline = sortedScannerTrips.value.find((s) => s.sweepId === id)
      if (!baseline) {
        currentScannerSweep.value = null
        return
      }
      const pts = await loadSamples(baseline)
      const transportDelayMs = getEffectiveTransportDelayMs()
      const alignedBaselineTs = baseline.startTs - transportDelayMs
      const upper = findUpperSweepAt(alignedBaselineTs)
      if (!upper) {
        currentScannerSweep.value = null
        return
      }
      currentScannerSweep.value = {
        tripStartTime: upper.time,
        tripDurationMs: upper.cycleDurationMs,
        direction: upper.direction,
        points: pts,
      }
    },
    { immediate: true }
  )

  /** 加载上旋趟(用于 timeToAngle 算 θ) */
  async function loadUpperSweeps(): Promise<void> {
    if (params.value.transportDelayMs == null) {
      // 缺标定参数,后端的 buildProfile 会反复 warn,所以这里直接短路
      upperSweeps.value = []
      errorMessage.value =
        '运输延迟参数缺失：需标定 测量点距离(upperDistance) 和 牵引速度(rollerTractionSpeed)'
      return
    }
    try {
      const now = Date.now()
      if (
        upperSweeps.value.length > 0 &&
        now - lastUpperSweepsRefreshAt.value < UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS
      ) {
        return
      }
      const result = (await window.ipcApi.invoke(
        'db-get-latest-rotation-trips',
        UPPER_SWEEPS_FETCH_COUNT
      )) as RotationTripSummaryRow[]
      upperSweeps.value = [...result].sort((a, b) => a.time - b.time)
      lastUpperSweepsRefreshAt.value = now
    } catch (err) {
      upperSweeps.value = []
      errorMessage.value = err instanceof Error ? err.message : '加载上旋趟失败'
    }
  }

  async function loadScannerTrips(beforeTs?: number): Promise<void> {
    try {
      const rows = (await window.ipcApi.invoke(
        'db-get-sweep-summaries',
        SCANNER_TRIPS_FETCH_COUNT,
        beforeTs
      )) as SweepSummaryRow[]
      if (beforeTs && beforeTs > 0) {
        // 加载更老的数据
        if (rows.length === 0) {
          hasOlderData.value = false
          return
        }
        const existingFirst = sortedScannerTrips.value[0]?.startTs ?? 0
        let start = 0
        while (start < rows.length) {
          if (
            existingFirst > 0 &&
            (rows[start].startTs ?? 0) >= existingFirst
          ) {
            start += 1
          } else {
            break
          }
        }
        if (start >= rows.length) {
          hasOlderData.value = false
          return
        }
        const older = rows.slice(start)
        const merged = [...older, ...scannerTrips.value]
        const seen = new Set<string>()
        const dedup: SweepSummaryRow[] = []
        for (const s of merged) {
          if (seen.has(s.sweepId)) continue
          seen.add(s.sweepId)
          dedup.push(s)
        }
        scannerTrips.value = dedup
        hasOlderData.value = true
      } else {
        scannerTrips.value = rows
        selectedIndex.value = Math.max(0, rows.length - 1)
        alignSelectedBaselineToUpperCoverage()
        hasOlderData.value = true
      }
    } catch (err) {
      if (!beforeTs) scannerTrips.value = []
      errorMessage.value = err instanceof Error ? err.message : '加载扫描趟失败'
    }
  }

  async function refresh() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    errorMessage.value = null
    try {
      await Promise.all([loadUpperSweeps(), loadScannerTrips()])
      alignSelectedBaselineToUpperCoverage()
      lastUpdatedAt.value = Date.now()
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '刷新失败'
    } finally {
      isRefreshing.value = false
    }
  }

  function prevTrip() {
    if (selectedIndex.value > 0) {
      selectedIndex.value -= 1
    } else {
      void loadOlderTrips()
    }
  }
  function nextTrip() {
    if (selectedIndex.value < sortedScannerTrips.value.length - 1) {
      selectedIndex.value += 1
    }
  }
  async function loadOlderTrips() {
    if (isRefreshing.value || !hasOlderData.value) return
    const first = sortedScannerTrips.value[0]
    if (!first) return
    await loadScannerTrips(first.startTs)
  }

  async function checkConnection() {
    try {
      isConnected.value = (await window.ipcApi.invoke(
        'adbox-get-connection-status'
      )) as boolean
    } catch {
      isConnected.value = false
    }
  }
  function handleStatus(_msg: unknown, payload: { connected: boolean }) {
    isConnected.value = payload.connected
  }

  let refreshTimer: number | null = null
  function startAutoRefresh() {
    stopAutoRefresh()
    if (!autoRefresh.value) return
    if (dataMode.value === 'historical') return
    refreshTimer = window.setInterval(() => {
      void refresh()
    }, Math.max(REFRESH_INTERVAL_MS, RECON_REFRESH_INTERVAL_MS))
  }
  function stopAutoRefresh() {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
  watch(autoRefresh, (val) => {
    if (val) startAutoRefresh()
    else stopAutoRefresh()
  })
  watch(dataMode, (mode) => {
    if (mode === 'historical') stopAutoRefresh()
    else startAutoRefresh()
  })

  // 连接状态变化时同步 dataMode + 触发一次刷新
  watch(isConnected, (connected) => {
    dataMode.value = connected ? 'live' : 'historical'
    void refresh()
  })

  // 实时模式: 新进来的扫描趟自动选中为 baseline 并触发重构
  // 监听列表中"最新一趟"的 sweepId,只在 dataMode==='live' 时响应
  watch(
    () => sortedScannerTrips.value[sortedScannerTrips.value.length - 1]?.sweepId,
    (newLatestId, oldLatestId) => {
      if (!newLatestId || newLatestId === oldLatestId) return
      if (dataMode.value !== 'live') return
      // 实时模式不盲目追最新,优先选可被上旋趟覆盖的最新扫描趟。
      alignSelectedBaselineToUpperCoverage()
    }
  )

  onMounted(async () => {
    await loadConfigs()
    await checkConnection()
    dataMode.value = isConnected.value ? 'live' : 'historical'
    window.ipcApi.on('adbox-status', handleStatus)
    await refresh()
    startAutoRefresh()
  })
  onUnmounted(() => {
    stopAutoRefresh()
    window.ipcApi.off('adbox-status', handleStatus)
  })

  return {
    // state
    dataMode,
    scannerTrips,
    sortedScannerTrips,
    upperSweeps,
    selectedIndex,
    selectedBaseline,
    currentReconstruction,
    currentScannerSweep,
    canGoPrev,
    canGoNext,
    isRefreshing,
    isReconstructing,
    autoRefresh,
    lastUpdatedAt,
    errorMessage,
    isConnected,
    hasOlderData,
    thicknessCfg,
    calResults,
    params,
    // actions
    refresh,
    prevTrip,
    nextTrip,
    loadOlderTrips,
    checkConnection,
    reconstructForBaseline,
  }
}
