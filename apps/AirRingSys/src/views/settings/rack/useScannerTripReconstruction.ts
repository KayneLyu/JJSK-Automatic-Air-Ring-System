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
  RotationTripSummaryRow,
  SweepPoint,
  SweepSummaryRow,
} from '@/types/ipc'
import { useDeviceConfig } from './useDeviceConfig'
import {
  REFRESH_INTERVAL_MS,
  DEFAULT_NUM_BINS,
  DEFAULT_PROCESS_DEFORMATION,
  type DataMode,
} from './bubbleRawThickness.constants'
import {
  SCANNER_TRIPS_FETCH_COUNT,
  UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS,
  UPPER_SWEEPS_FETCH_COUNT,
  RECON_REFRESH_INTERVAL_MS,
  UPPER_SWEEP_GAP_TOLERANCE_MS,
  MAX_EFFECTIVE_TRANSPORT_DELAY_MS,
  HARD_MIN_THETA_COVERAGE_RATIO,
  MIN_THETA_COVERAGE_RATIO,
} from '@jjsk/air-ring-server/algorithms/scannerPreprocessing'
import type {
  UpperSweepCoverage,
  MeasurementBuildResult,
  MeasurementParams,
} from '@jjsk/air-ring-server/algorithms/scannerPreprocessing.types'
import {
  computePhiPair,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import {
  getUpperSweepsCoverage,
  buildMeasurementsFromReversal,
  mergeMeasurementBuildResults,
  estimatePhiSeparationStats,
  estimateThetaCoverageStats,
  suggestFallbackAirAD,
  getWindowTrips as collectWindowTrips,
  estimateAverageTHalf,
} from '@jjsk/air-ring-server/algorithms/scannerPreprocessing'

/** baseline 的重构结果 */
interface ReconstructedSweep {
  baseline: SweepSummaryRow
  windowIds: string[]
  result: BubbleWindowReconstructionResult
  /** 重构用的样本数 */
  numSamples: number
  /** 方案B：直接分箱 B(φ)（中位数去偏，保留方差） */
  directProfile?: number[]
  /** 角度偏移校准后的 LS 剖面（用于风环控制的风道映射） */
  shiftedProfile?: number[]
}

export function useScannerTripReconstruction() {
  // 上旋趟(用于 θ_max / 起始时间)
  const upperSweeps = ref<RotationTripSummaryRow[]>([])
  // 测厚仪扫描趟 summary
  const scannerTrips = ref<SweepSummaryRow[]>([])
  // 详细 samples(按 sweepId 缓存)
  const samplesCache = shallowRef<Map<string, SweepPoint[]>>(new Map())
  // 重构结果(按 baseline sweepId 缓存)
  const reconstructionCache = shallowRef<Map<string, ReconstructedSweep>>(
    new Map()
  )

  const selectedIndex = ref(0)
  const dataMode = ref<DataMode>('live')
  const isRefreshing = ref(false)
  const isReconstructing = ref(false)
  const autoRefresh = ref(true)
  const lastUpdatedAt = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const reconstructionHint = ref<string | null>(null)
  const transportDelayStatus = ref<string | null>(null)
  const isConnected = ref(false)
  const hasOlderData = ref(true)
  const lastUpperSweepsRefreshAt = ref(0)

  const { thicknessCfg, angleOffsetDeg, calResults, loadConfigs } = useDeviceConfig(errorMessage)

  /** 几何/标定参数 */
  const params = computed(() => {
    const cal = calResults.value ?? {}
    const {
      frameLengthMM,
      frameLengthPulse,
      mmPerPulse: storedMmPerPulse,
      membraneWidthMm: storedMembraneWidthMm,
      upperMaxAngle,
      upperDistance,
      rollerTractionSpeed,
    } = cal

    // mmPerPulse: 必须从标定中获取，无默认回退
    const mmPerPulse =
      storedMmPerPulse !== undefined &&
      Number.isFinite(storedMmPerPulse) &&
      storedMmPerPulse > 0
        ? storedMmPerPulse
        : frameLengthMM && frameLengthPulse && frameLengthPulse > 0
          ? frameLengthMM / frameLengthPulse
          : 0
    if (mmPerPulse <= 0) {
      errorMessage.value = 'mm/脉冲 未标定，请先标定膜宽与脉冲数'
    }

    const airADNum = Number(thicknessCfg.value.airAD)
    if (!Number.isFinite(airADNum) || airADNum <= 0) {
      errorMessage.value = 'airAD 未配置或无效，请在设置页填写'
    }
    const gainNum =
      thicknessCfg.value.gain !== undefined &&
      Number.isFinite(thicknessCfg.value.gain)
        ? thicknessCfg.value.gain
        : 1.0

    // membraneWidthMm: 必须从标定中获取，无默认回退
    const membraneWidthMm =
      storedMembraneWidthMm !== undefined && storedMembraneWidthMm > 0
        ? storedMembraneWidthMm
        : frameLengthMM && frameLengthMM > 0
          ? frameLengthMM
          : 0
    if (membraneWidthMm <= 0) {
      errorMessage.value = '膜宽未标定，请先标定膜宽'
    }

    // thetaMaxDeg: 必须从标定中获取，无默认回退
    const thetaMaxDeg = upperMaxAngle && upperMaxAngle > 0 ? upperMaxAngle : 0
    if (thetaMaxDeg <= 0) {
      errorMessage.value = '上旋最大角度未标定，请先标定上旋角度'
    }

    const transportDelayMs =
      upperDistance != null &&
      upperDistance > 0 &&
      rollerTractionSpeed != null &&
      rollerTractionSpeed > 0
        ? (upperDistance / rollerTractionSpeed) * 1000
        : undefined
    return {
      membraneWidthMm,
      thetaMaxDeg,
      mmPerPulse,
      airAD: airADNum,
      gain: gainNum,
      numBins: DEFAULT_NUM_BINS,
      processDeformationFactor: DEFAULT_PROCESS_DEFORMATION,
      transportDelayMs,
    }
  })

  /** MeasurementParams for buildMeasurements (subset of computed params) */
  const measurementParams = computed<MeasurementParams>(() => ({
    membraneWidthMm: params.value.membraneWidthMm,
    mmPerPulse: params.value.mmPerPulse,
    thetaMaxDeg: params.value.thetaMaxDeg,
  }))

  // 按时间升序的扫描趟
  const sortedScannerTrips = computed(() =>
    [...scannerTrips.value].sort((a, b) => a.startTs - b.startTs)
  )

  const selectedBaseline = computed<SweepSummaryRow | null>(
    () => sortedScannerTrips.value[selectedIndex.value] ?? null
  )

  const canGoPrev = computed(
    () =>
      dataMode.value === 'historical' &&
      !isRefreshing.value &&
      selectedIndex.value > 0
  )
  const canGoNext = computed(
    () =>
      dataMode.value === 'historical' &&
      selectedIndex.value < sortedScannerTrips.value.length - 1
  )

  function getEffectiveTransportDelayMs(): number {
    const delay = params.value.transportDelayMs
    if (delay == null || !Number.isFinite(delay) || delay <= 0) return 0
    if (delay > MAX_EFFECTIVE_TRANSPORT_DELAY_MS) return 0
    return delay
  }

  function getCoverage(): UpperSweepCoverage | null {
    return getUpperSweepsCoverage(upperSweeps.value)
  }

  function findLatestReconstructableIndex(rows: SweepSummaryRow[]): number {
    if (rows.length === 0) return -1
    const coverage = getCoverage()
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

  async function ensureUpperSweepsCoverage(
    windowStartTs: number,
    windowEndTs: number
  ): Promise<void> {
    const transportDelayMs = getEffectiveTransportDelayMs()
    const targetStartTs = windowStartTs - transportDelayMs
    const targetEndTs = windowEndTs - transportDelayMs
    const coverage = getCoverage()
    if (
      coverage &&
      coverage.startTs <= targetStartTs &&
      coverage.endTs >= targetEndTs
    ) {
      return
    }
    const result = await fetchUpperSweeps(targetEndTs + 1)
    upperSweeps.value = [...result].sort((a, b) => a.time - b.time)
    lastUpperSweepsRefreshAt.value = Date.now()
  }

  async function fetchUpperSweeps(
    beforeTs?: number
  ): Promise<RotationTripSummaryRow[]> {
    const queryBeforeTs = beforeTs ?? 0
    const [fromTripTable, fromFallback] = (await Promise.all([
      window.ipcApi.invoke(
        'db-get-latest-rotation-trips',
        UPPER_SWEEPS_FETCH_COUNT,
        beforeTs
      ),
      window.ipcApi.invoke(
        'db-get-latest-rotation-trips-fallback',
        UPPER_SWEEPS_FETCH_COUNT,
        beforeTs
      ),
    ])) as [RotationTripSummaryRow[], RotationTripSummaryRow[]]

    const mergedMap = new Map<string, RotationTripSummaryRow>()
    for (const row of fromTripTable) {
      const key = `${row.time}:${row.direction}`
      mergedMap.set(key, row)
    }
    for (const row of fromFallback) {
      const key = `${row.time}:${row.direction}`
      const prev = mergedMap.get(key)
      if (!prev || row.cycleDurationMs > prev.cycleDurationMs) {
        mergedMap.set(key, row)
      }
    }
    const merged = [...mergedMap.values()].sort((a, b) => a.time - b.time)

    if (merged.length > 0) {
      const first = merged[0]
      const last = merged[merged.length - 1]
      console.warn(
        `[loadUpperSweeps] source=merged trip=${fromTripTable.length} fallback=${fromFallback.length} count=${merged.length} beforeTs=${queryBeforeTs} range=${first.time}~${last.time + Math.max(0, last.cycleDurationMs)}`
      )
      if (fromTripTable.length === 0 && fromFallback.length > 0) {
        console.warn(
          '[loadUpperSweeps] rotation_trip 为空，已回退到 rotation_raw 方向变化构建上旋趟'
        )
      }
      return merged
    }

    console.warn(
      `[loadUpperSweeps] source=none count=0 beforeTs=${queryBeforeTs} (rotation_trip/fallback 均无可用上旋趟)`
    )
    return []
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

  /**
   * 为给定 baseline 计算 B(φ)
   * - 命中缓存直接返回
   * - 否则加载窗口内所有 samples, 重建, 写缓存
   */
  async function reconstructForBaseline(
    baseline: SweepSummaryRow
  ): Promise<ReconstructedSweep | null> {
    const cached = reconstructionCache.value.get(baseline.sweepId)
    if (cached) {
      reconstructionHint.value = null
      return cached
    }
    const p = params.value
    if (p.membraneWidthMm <= 0) {
      reconstructionHint.value = '膜宽参数无效，无法重构'
      return null
    }
    reconstructionHint.value = null
    transportDelayStatus.value = null
    isReconstructing.value = true
    try {
      const windowTrips = collectWindowTrips(sortedScannerTrips.value, baseline)
      const windowStartTs = windowTrips[0]?.startTs ?? baseline.startTs
      const windowEndTs = baseline.endTs
      await ensureUpperSweepsCoverage(windowStartTs, windowEndTs)
      // 并行加载窗口内所有 trips 的 samples(本地 SQLite,64 路并发 OK)
      const batches = await Promise.all(windowTrips.map((t) => loadSamples(t)))
      const allSamples: SweepPoint[] = []
      for (const pts of batches) allSamples.push(...pts)
      const transportDelayMs = getEffectiveTransportDelayMs()
      const coverage = getCoverage()
      const minSampleTs = coverage
        ? coverage.startTs - UPPER_SWEEP_GAP_TOLERANCE_MS + transportDelayMs
        : Number.NEGATIVE_INFINITY
      const maxSampleTs = coverage
        ? coverage.endTs + UPPER_SWEEP_GAP_TOLERANCE_MS + transportDelayMs
        : Number.POSITIVE_INFINITY
      const filteredBatches = batches.map((pts) =>
        pts.filter((s) => s.ts >= minSampleTs && s.ts <= maxSampleTs)
      )
      const samplesForReconstruction = filteredBatches.flat()
      const rawDelayMs = p.transportDelayMs
      const preferredDelayMs = getEffectiveTransportDelayMs()
      let chosenAirAD = p.airAD
      let delayStatusPrefix: string | null = null
      if (
        rawDelayMs != null &&
        Number.isFinite(rawDelayMs) &&
        rawDelayMs > MAX_EFFECTIVE_TRANSPORT_DELAY_MS
      ) {
        delayStatusPrefix = `delay异常 ${rawDelayMs.toFixed(0)}ms（>${MAX_EFFECTIVE_TRANSPORT_DELAY_MS}ms），已按0ms`
      }
      const mParams = measurementParams.value
      const sweeps = upperSweeps.value

      // 计算基础 T_half（用于即时校准）
      const baseTHalf = estimateAverageTHalf(sweeps)

      const buildWithDelay = (
        delayMs: number,
        airAD: number,
        diagnostics: boolean
      ): MeasurementBuildResult =>
        mergeMeasurementBuildResults(
          filteredBatches.map((pts, idx) =>
            buildMeasurementsFromReversal(
              pts,
              airAD,
              p.gain,
              delayMs,
              sweeps,
              mParams,
              windowTrips[idx],
              diagnostics
            )
          )
        )

      const primaryBuild = buildWithDelay(preferredDelayMs, p.airAD, true)
      let chosenBuild = primaryBuild

      const shouldSearchDelay =
        chosenBuild.measurements.length > 0 &&
        (chosenBuild.stats.edgeRejectedRatio >= 0.5 ||
          chosenBuild.stats.droppedLateRatio >= 0.1)
      if (shouldSearchDelay) {
        // 约束搜索范围：物理延迟 ±30s（标定不确定性），不允许偏离太远
        const candidateSet = new Set<number>([
          preferredDelayMs,
          Math.max(0, preferredDelayMs - 30_000),
          Math.max(0, preferredDelayMs - 20_000),
          Math.max(0, preferredDelayMs - 10_000),
          preferredDelayMs + 10_000,
          preferredDelayMs + 20_000,
          preferredDelayMs + 30_000,
        ])
        const candidates = [...candidateSet]
          .filter((d) => d <= MAX_EFFECTIVE_TRANSPORT_DELAY_MS)
          .sort((a, b) => a - b)

        let bestDelay = preferredDelayMs
        let bestBuild = chosenBuild
        let bestThetaCoverageRatio = estimateThetaCoverageStats(
          bestBuild.measurements,
          p.thetaMaxDeg
        ).ratio
        for (const delayMs of candidates) {
          if (delayMs === preferredDelayMs) continue
          const candidateBuild = buildWithDelay(delayMs, p.airAD, false)
          const candidateThetaCoverageRatio = estimateThetaCoverageStats(
            candidateBuild.measurements,
            p.thetaMaxDeg
          ).ratio
          const betterByCount =
            candidateBuild.measurements.length >
            bestBuild.measurements.length * 1.12
          const betterByQuality =
            candidateBuild.measurements.length >=
              bestBuild.measurements.length * 0.95 &&
            candidateBuild.stats.edgeRejectedRatio <
              bestBuild.stats.edgeRejectedRatio * 0.85
          const betterByThetaCoverage =
            candidateBuild.measurements.length >=
              bestBuild.measurements.length * 0.9 &&
            candidateThetaCoverageRatio > bestThetaCoverageRatio + 0.08
          if (betterByCount || betterByQuality || betterByThetaCoverage) {
            bestDelay = delayMs
            bestBuild = candidateBuild
            bestThetaCoverageRatio = candidateThetaCoverageRatio
          }
        }

        if (bestDelay !== preferredDelayMs) {
          chosenBuild = buildWithDelay(bestDelay, p.airAD, true)
          console.warn(
            `[B(φ)] transportDelay 搜索: ${preferredDelayMs.toFixed(0)}ms -> ${bestDelay.toFixed(0)}ms ` +
              `(meas=${primaryBuild.measurements.length}->${chosenBuild.measurements.length}, edgeReject=${(primaryBuild.stats.edgeRejectedRatio * 100).toFixed(1)}%->${(chosenBuild.stats.edgeRejectedRatio * 100).toFixed(1)}%, thetaCov=${(estimateThetaCoverageStats(primaryBuild.measurements, p.thetaMaxDeg).ratio * 100).toFixed(1)}%->${(bestThetaCoverageRatio * 100).toFixed(1)}%)`
          )
          transportDelayStatus.value = `delay搜索 ${preferredDelayMs.toFixed(0)}ms→${bestDelay.toFixed(0)}ms（meas ${primaryBuild.measurements.length}→${chosenBuild.measurements.length}）`
        }
      }

      if (preferredDelayMs > 0) {
        const shouldTryNoDelay =
          primaryBuild.stats.droppedLateRatio >= 0.6 ||
          primaryBuild.measurements.length < 50
        if (shouldTryNoDelay) {
          const zeroDelayBuild = buildWithDelay(0, p.airAD, false)
          if (
            zeroDelayBuild.measurements.length >
            primaryBuild.measurements.length * 1.5
          ) {
            console.warn(
              `[B(φ)] transportDelay 回退: ${preferredDelayMs.toFixed(0)}ms -> 0ms ` +
                `(droppedLate=${primaryBuild.stats.droppedLateCount}/${primaryBuild.stats.totalSamples}, ` +
                `meas=${primaryBuild.measurements.length}->${zeroDelayBuild.measurements.length})`
            )
            transportDelayStatus.value = `delay回退 ${preferredDelayMs.toFixed(0)}ms→0ms（meas ${primaryBuild.measurements.length}→${zeroDelayBuild.measurements.length}）`
            chosenBuild = zeroDelayBuild
          } else {
            transportDelayStatus.value = `delay保持 ${preferredDelayMs.toFixed(0)}ms（回退收益不足）`
          }
        } else {
          transportDelayStatus.value =
            delayStatusPrefix ?? `delay ${preferredDelayMs.toFixed(0)}ms`
        }
      } else {
        transportDelayStatus.value = delayStatusPrefix ?? 'delay 0ms'
      }

      if (chosenBuild.measurements.length === 0) {
        const fallback = suggestFallbackAirAD(samplesForReconstruction, p.airAD)
        if (fallback) {
          const retryBuild = buildWithDelay(
            chosenBuild.stats.transportDelayMs,
            fallback.suggestedAirAD,
            true
          )
          if (retryBuild.measurements.length > 0) {
            console.warn(
              `[B(φ)] airAD 回退: ${p.airAD} -> ${fallback.suggestedAirAD} ` +
                `(ad>=airAD ${(fallback.aboveRatio * 100).toFixed(1)}%, p99=${fallback.p99Ad.toFixed(0)}, meas 0->${retryBuild.measurements.length})`
            )
            chosenAirAD = fallback.suggestedAirAD
            chosenBuild = retryBuild
          }
        }
      }

      // ---- T_half 即时校准：尝试多个候选值，选择最优 ----
      // 使用 θ-bin 内厚度方差作为代理指标：T_half 错误时，测量映射到错误的 θ，导致 bin 内方差大
      const computeThetaBinVariance = (
        meas: readonly { upperAngleDeg: number; thickness: number }[],
        numBins: number = 36
      ): number => {
        if (meas.length < 100) return Infinity
        const bins: number[][] = Array.from({ length: numBins }, () => [])
        for (const m of meas) {
          const binIdx = Math.floor((m.upperAngleDeg / 360) * numBins) % numBins
          bins[binIdx]!.push(m.thickness)
        }
        let totalVariance = 0
        let binCount = 0
        for (const bin of bins) {
          if (bin.length < 5) continue // 跳过样本太少的 bin
          const mean = bin.reduce((a, b) => a + b, 0) / bin.length
          const variance = bin.reduce((sum, v) => sum + (v - mean) ** 2, 0) / bin.length
          totalVariance += variance
          binCount++
        }
        return binCount > 0 ? totalVariance / binCount : Infinity
      }

      const initialVariance = computeThetaBinVariance(chosenBuild.measurements)
      console.warn(
        `[B(φ)] T_half校准检查: initialVariance=${initialVariance.toFixed(2)}, meas=${chosenBuild.measurements.length}, baseTHalf=${baseTHalf !== null ? (baseTHalf / 1000).toFixed(1) + 's' : 'null'}`
      )
      let bestTHalf = baseTHalf
      let bestVariance = initialVariance
      let bestBuild = chosenBuild

      if (initialVariance > 50 && chosenBuild.measurements.length > 500 && baseTHalf !== null) {
        // 尝试多个候选 T_half 值
        const candidates = [
          baseTHalf * 0.85,  // -15%
          baseTHalf * 0.90,  // -10%
          baseTHalf * 0.95,  // -5%
          baseTHalf,         // 0% (当前值)
          baseTHalf * 1.05,  // +5%
          baseTHalf * 1.10,  // +10%
          baseTHalf * 1.15,  // +15%
        ]

        for (const candidateTHalf of candidates) {
          const rebuildWithDelay = (
            delayMs: number,
            airAD: number
          ): MeasurementBuildResult =>
            mergeMeasurementBuildResults(
              filteredBatches.map((pts, idx) =>
                buildMeasurementsFromReversal(
                  pts,
                  airAD,
                  p.gain,
                  delayMs,
                  sweeps,
                  mParams,
                  windowTrips[idx],
                  false,
                  candidateTHalf
                )
              )
            )

          const candidateBuild = rebuildWithDelay(
            chosenBuild.stats.transportDelayMs,
            chosenAirAD
          )

          if (candidateBuild.measurements.length < 500) continue

          const candidateVariance = computeThetaBinVariance(candidateBuild.measurements)
          console.warn(
            `[B(φ)] T_half候选: ${(candidateTHalf / 1000).toFixed(1)}s, variance=${candidateVariance.toFixed(2)}`
          )

          if (candidateVariance < bestVariance) {
            bestVariance = candidateVariance
            bestBuild = candidateBuild
            bestTHalf = candidateTHalf
          }

          if (candidateVariance < 30) break // 足够好，提前退出
        }

        if (bestTHalf !== baseTHalf && baseTHalf !== null && bestTHalf !== null) {
          chosenBuild = bestBuild
          const adjustment = bestTHalf - baseTHalf
          console.warn(
            `[B(φ)] T_half 即时校准: ${(baseTHalf / 1000).toFixed(1)}s → ${(bestTHalf / 1000).toFixed(1)}s ` +
              `(adjustment=${(adjustment / 1000).toFixed(1)}s, variance: ${initialVariance.toFixed(2)} → ${bestVariance.toFixed(2)})`
          )
        }
      }

      let measurements = chosenBuild.measurements
      if (measurements.length < 50) {
        const dropPct = (chosenBuild.stats.droppedLateRatio * 100).toFixed(1)
        const fallback = suggestFallbackAirAD(
          samplesForReconstruction,
          chosenAirAD
        )
        const airADHint =
          fallback && measurements.length === 0
            ? `，airAD疑似偏小（当前${chosenAirAD}，样本中>=airAD占比${(fallback.aboveRatio * 100).toFixed(1)}%，建议≈${fallback.suggestedAirAD}）`
            : ''
        reconstructionHint.value = `有效测量点不足（${measurements.length}/50，droppedLate=${chosenBuild.stats.droppedLateCount}/${chosenBuild.stats.totalSamples}=${dropPct}%）${airADHint}`
        return null
      }

      const separationStats = estimatePhiSeparationStats(
        measurements,
        p.membraneWidthMm
      )
      if (separationStats.p95 < 18) {
        reconstructionHint.value = `横向覆盖不足（|φ1-φ2| p95=${separationStats.p95.toFixed(1)}° < 18°，max=${separationStats.max.toFixed(1)}°）`
        console.warn(
          `[B(φ)] 跳过重构: 横向覆盖不足 (sep.p95=${separationStats.p95.toFixed(1)}°, sep.max=${separationStats.max.toFixed(1)}°, meas=${measurements.length})`
        )
        return null
      }

      const thetaCoverage = estimateThetaCoverageStats(
        measurements,
        p.thetaMaxDeg
      )
      if (thetaCoverage.ratio < HARD_MIN_THETA_COVERAGE_RATIO) {
        reconstructionHint.value = `上旋覆盖不足（θ p05=${thetaCoverage.p05.toFixed(0)}°, p95=${thetaCoverage.p95.toFixed(0)}°, 覆盖=${(thetaCoverage.ratio * 100).toFixed(1)}%）`
        console.warn(
          `[B(φ)] 跳过重构: 上旋覆盖严重不足 (thetaSpan=${thetaCoverage.span.toFixed(1)}°, ratio=${(thetaCoverage.ratio * 100).toFixed(1)}%, meas=${measurements.length})`
        )
        return null
      }
      if (thetaCoverage.ratio < MIN_THETA_COVERAGE_RATIO) {
        console.warn(
          `[B(φ)] 上旋覆盖偏低但继续重构: thetaSpan=${thetaCoverage.span.toFixed(1)}°, ratio=${(thetaCoverage.ratio * 100).toFixed(1)}%, meas=${measurements.length}`
        )
      }

      let result = (await window.ipcApi.invoke('bubble-reconstruct-window', {
        measurements,
        membraneWidthMm: p.membraneWidthMm,
        numBins: p.numBins,
        processDeformationFactor: p.processDeformationFactor,
        preferAfterTs: baseline.startTs,
      })) as BubbleWindowReconstructionResult | null
      if (!result) {
        reconstructionHint.value = `重构求解无结果（samples=${samplesForReconstruction.length}, meas=${measurements.length}, delay=${chosenBuild.stats.transportDelayMs.toFixed(0)}ms）`
        return null
      }
      reconstructionHint.value = null

      // ══════════════════════════════════════════════════════════
      // 方案B：直接分箱 B(φ) — 逐点 ŝ_k = T_k/(2η) 分箱取中位数 + 去偏
      // 绕过最小二乘系统，保留完整方差（不向均值坍缩）
      // ══════════════════════════════════════════════════════════
      const directProfile: number[] = (() => {
        const eta = p.processDeformationFactor
        const binWidth = 360 / p.numBins
        const binValues: number[][] = Array.from({ length: p.numBins }, () => [])

        for (const m of measurements) {
          const s = m.thickness / (2 * eta)
          const { phi1Deg, phi2Deg } = computePhiPair(
            m.upperAngleDeg, m.scannerPosMm, p.membraneWidthMm
          )
          const b1 = Math.floor(phi1Deg / binWidth) % p.numBins
          const b2 = Math.floor(phi2Deg / binWidth) % p.numBins
          binValues[b1]!.push(s)
          if (b2 !== b1) binValues[b2]!.push(s)
        }

        // 全局中位数：取所有非空 bin 的中位数的中位数
        const binMedians: number[] = []
        for (let j = 0; j < p.numBins; j++) {
          const vs = binValues[j]!
          if (vs.length === 0) continue
          vs.sort((a, b) => a - b)
          binMedians.push(vs[Math.floor(vs.length / 2)]!)
        }
        binMedians.sort((a, b) => a - b)
        const globalMedian = binMedians[Math.floor(binMedians.length / 2)]!

        const profile = new Array<number>(p.numBins)
        for (let j = 0; j < p.numBins; j++) {
          const vs = binValues[j]!
          if (vs.length > 0) {
            vs.sort((a, b) => a - b)
            const binMedian = vs[Math.floor(vs.length / 2)]!
            // 去偏：bin_j 的 ŝ 均值 = (B[j] + B̄_other)/2 → B[j] ≈ 2*ŝ_j − B̄
            profile[j] = Math.max(0, 2 * binMedian - globalMedian)
          } else {
            profile[j] = globalMedian
          }
        }
        return profile
      })()

      // ---- θmax 保持默认值（不再搜索候选）----
      let thetaMaxCalStr = `θmax ${p.thetaMaxDeg}°`

      // ══════════════════════════════════════════════════════════
      // 角度对齐：重建剖面的最薄 bin → bin0（与参考对齐）
      // 假设：重建最薄处 = 物理最薄处 = 参考的 bin0
      // 后续物理标定可替换此自动对齐逻辑
      // ══════════════════════════════════════════════════════════

      const lsMinBin = result.profile.reduce(
        (minIdx, v, i, arr) => (v < arr[minIdx]! ? i : minIdx), 0
      )
      const offsetBins = lsMinBin // 使 org[lsMinBin] → shifted[0]
      const shiftProfile = (p: number[]): number[] =>
        p.map((_, j) => p[(j + offsetBins + result.numBins) % result.numBins]!)
      const shiftedLSProfile = shiftProfile(result.profile)
      const shiftedDirectProfile = shiftProfile(directProfile)

      // ---- 偏差诊断: 实测单层 vs 重建 Profile ----
      {
        const eta = p.processDeformationFactor
        const predicted = result.predictedThickness ?? []
        const n = measurements.length

        // 实测单层 = T_double / (2η)
        const measSingle = measurements.map((m) => m.thickness / (2 * eta))
        // Profile 预测单层 = T_predicted / (2η)
        const predSingle = predicted.map((t) => t / (2 * eta))

        // 残差 (单层)
        const residuals: number[] = []
        for (let i = 0; i < Math.min(n, predicted.length); i++) {
          residuals.push(measSingle[i]! - predSingle[i]!)
        }

        // 统计辅助
        const stats = (arr: number[]) => {
          if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0 }
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length
          const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
          let min = arr[0]!, max = arr[0]!
          for (let i = 1; i < arr.length; i++) {
            if (arr[i]! < min) min = arr[i]!
            if (arr[i]! > max) max = arr[i]!
          }
          return { mean, std, min, max }
        }

        const mS = stats(measSingle)
        const pS = stats(result.profile)
        const rS = stats(residuals)
        const rmsResid = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / Math.max(residuals.length, 1))

        // Bin 覆盖
        const coveredBins = result.binCoverage.filter((c) => c > 0).length

        // θ 分布 (采样 200 点)
        const thetaSample: number[] = []
        const thetaStep = Math.max(1, Math.floor(n / 200))
        for (let i = 0; i < n; i += thetaStep) thetaSample.push(measurements[i]!.upperAngleDeg)
        const thetaSorted = [...thetaSample].sort((a, b) => a - b)
        const thetaMin = thetaSorted[0] ?? 0
        const thetaMax = thetaSorted[thetaSorted.length - 1] ?? 0
        const thetaP10 = thetaSorted[Math.floor(thetaSorted.length * 0.1)] ?? 0
        const thetaP90 = thetaSorted[Math.floor(thetaSorted.length * 0.9)] ?? 0

        // δ 分布
        const deltas = measurements.map((m) => (m.scannerPosMm / p.membraneWidthMm) * 180)
        const dMin = Math.min(...deltas)
        const dMax = Math.max(...deltas)

        // 残差与 θ 的相关性
        const thetaVals = measurements.slice(0, residuals.length).map((m) => m.upperAngleDeg)
        let corrSum = 0
        const thetaCenter = (thetaMin + thetaMax) / 2
        for (let i = 0; i < residuals.length; i++) {
          corrSum += (thetaVals[i]! - thetaCenter) * residuals[i]!
        }
        const thetaResidCorr = corrSum / Math.max(residuals.length, 1)

        // ---- 实测 vs Profile 对照 (9 点均匀采样) ----
        const MEASURED_REF: number[] = [61, 62, 63, 65, 64, 67, 68, 70, 72]
        const NUM_SAMPLES = 9
        const binCount = result.profile.length

        const sampleIndices: number[] = []
        for (let k = 0; k < NUM_SAMPLES; k++) {
          sampleIndices.push(Math.round((k / NUM_SAMPLES) * binCount) % binCount)
        }
        const profileValues: number[] = sampleIndices.map((idx) => shiftedLSProfile[idx]!)
        const profileStr = profileValues.map((v) => v.toFixed(1)).join(', ')
        const directValues: number[] = sampleIndices.map((idx) => shiftedDirectProfile[idx]!)
        const directStr = directValues.map((v) => v.toFixed(1)).join(', ')
        const measStr = MEASURED_REF.map((v) => v.toFixed(1)).join(', ')
        const residCompStr = MEASURED_REF.map((v, i) => {
          const diff = v - profileValues[i]!
          return diff.toFixed(1)
        }).join(', ')
        const residDirectStr = MEASURED_REF.map((v, i) => {
          const diff = v - directValues[i]!
          return diff.toFixed(1)
        }).join(', ')

        // 残差分位数
        const rSorted = [...residuals].sort((a, b) => a - b)
        const rP25 = rSorted[Math.floor(rSorted.length * 0.25)] ?? 0
        const rP50 = rSorted[Math.floor(rSorted.length * 0.5)] ?? 0
        const rP75 = rSorted[Math.floor(rSorted.length * 0.75)] ?? 0

        // ---- 综合诊断日志 (单 block) ----
        const L: string[] = []
        L.push(`══════ [B(φ) 偏差诊断] ══════`)
        L.push(`窗口: trip=${baseline.sweepId.slice(-8)} ${windowTrips.length}趟(${((baseline.startTs - windowTrips[0].startTs) / 60_000).toFixed(1)}min) samples=${allSamples.length}→${samplesForReconstruction.length}→${n}`)
        L.push(`配置: W=${p.membraneWidthMm.toFixed(0)}mm θmax=${p.thetaMaxDeg.toFixed(0)}° η=${eta} bins=${result.numBins} airAD=${chosenAirAD} gain=${p.gain.toFixed(3)} 对齐=bin${lsMinBin}→0`)
        const tHalfStr = bestTHalf !== baseTHalf && baseTHalf !== null && bestTHalf !== null
          ? `T_half ${(baseTHalf / 1000).toFixed(1)}s→${(bestTHalf / 1000).toFixed(1)}s`
          : `T_half ${(baseTHalf !== null ? (baseTHalf / 1000).toFixed(1) + 's' : 'N/A')}`
        L.push(`校准: ${tHalfStr} | τ ${chosenBuild.stats.transportDelayMs.toFixed(0)}ms | ${thetaMaxCalStr}`)
        L.push(`几何: θ∈[${thetaMin.toFixed(1)}, ${thetaMax.toFixed(1)}]° P10=${thetaP10.toFixed(1)}° P90=${thetaP90.toFixed(1)}° | δ∈[${dMin.toFixed(0)}, ${dMax.toFixed(0)}]° | 覆盖 ${coveredBins}/${result.numBins}bin`)
        const dS = stats(directProfile)
        L.push(`实测单层: mean=${mS.mean.toFixed(2)} std=${mS.std.toFixed(2)} [${mS.min.toFixed(1)}, ${mS.max.toFixed(1)}]`)
        L.push(`Profile:   mean=${pS.mean.toFixed(2)} std=${pS.std.toFixed(2)} [${pS.min.toFixed(1)}, ${pS.max.toFixed(1)}] 波动比=${(pS.std / Math.max(mS.std, 0.01)).toFixed(3)}`)
        L.push(`直分箱:    mean=${dS.mean.toFixed(2)} std=${dS.std.toFixed(2)} [${dS.min.toFixed(1)}, ${dS.max.toFixed(1)}] 波动比=${(dS.std / Math.max(mS.std, 0.01)).toFixed(3)}`)
        L.push(`偏差: Δmean=${(mS.mean - pS.mean).toFixed(2)}μm (${((mS.mean - pS.mean) / mS.mean * 100).toFixed(1)}%) RMS残差=${rmsResid.toFixed(2)}μm θ相关=${thetaResidCorr.toFixed(2)}`)
        L.push(`残差: mean=${rS.mean.toFixed(2)} std=${rS.std.toFixed(2)} P25=${rP25.toFixed(2)} P50=${rP50.toFixed(2)} P75=${rP75.toFixed(2)} [${rS.min.toFixed(1)}, ${rS.max.toFixed(1)}]`)

        // 实测 vs Profile 对照表
        const colWidth = 7
        const pad = (s: string, w: number) => s.padStart(w)
        const headerIndices = sampleIndices.map((idx) => pad(`bin${idx}`, colWidth)).join('')
        L.push(`[实测 vs Profile] ${' '.repeat(18)}${headerIndices}  (最薄自动对齐→bin${lsMinBin}移至bin0)`)
        L.push(`参考(独立):        ${measStr.split(', ').map((v) => pad(v, colWidth)).join('')}`)
        L.push(`LS-Profile:        ${profileStr.split(', ').map((v) => pad(v, colWidth)).join('')}`)
        L.push(`残差(参考-LS):     ${residCompStr.split(', ').map((v) => pad(v, colWidth)).join('')}`)
        L.push(`直分箱Profile:     ${directStr.split(', ').map((v) => pad(v, colWidth)).join('')}`)
        L.push(`残差(参考-直):     ${residDirectStr.split(', ').map((v) => pad(v, colWidth)).join('')}`)
        L.push(`══════════════════════════════`)
        console.log(L.join('\n'))
      }
      const entry: ReconstructedSweep = {
        baseline,
        windowIds: windowTrips.map((t) => t.sweepId),
        result,
        numSamples: measurements.length,
        directProfile,
        shiftedProfile: shiftedLSProfile,
      }
      reconstructionCache.value.set(baseline.sweepId, entry)
      return entry
    } catch (err) {
      console.error('[reconstructForBaseline] failed', err)
      reconstructionHint.value =
        err instanceof Error ? `重构异常：${err.message}` : '重构异常：未知错误'
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
        reconstructionHint.value = null
        return
      }
      currentReconstruction.value = reconstructionCache.value.get(id) ?? null
      if (currentReconstruction.value) {
        reconstructionHint.value = null
      }
      scheduleReconstruction(id)
    },
    { immediate: true }
  )

  /** 加载上旋趟(用于 timeToAngle 算 θ) */
  async function loadUpperSweeps(): Promise<void> {
    try {
      const now = Date.now()
      if (
        upperSweeps.value.length > 0 &&
        now - lastUpperSweepsRefreshAt.value <
          UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS
      ) {
        console.warn(
          `[loadUpperSweeps] skip refresh: cached=${upperSweeps.value.length} age=${now - lastUpperSweepsRefreshAt.value}ms`
        )
        return
      }
      const result = await fetchUpperSweeps()
      upperSweeps.value = [...result].sort((a, b) => a.time - b.time)
      lastUpperSweepsRefreshAt.value = now
      if (upperSweeps.value.length > 0) {
        const first = upperSweeps.value[0]
        const last = upperSweeps.value[upperSweeps.value.length - 1]
        console.warn(
          `[loadUpperSweeps] applied count=${upperSweeps.value.length} coverage=${first.time}~${last.time + Math.max(0, last.cycleDurationMs)}`
        )
      }
    } catch (err) {
      upperSweeps.value = []
      errorMessage.value = err instanceof Error ? err.message : '加载上旋趟失败'
      console.error('[loadUpperSweeps] failed', err)
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
    if (dataMode.value !== 'historical') return
    if (selectedIndex.value > 0) {
      selectedIndex.value -= 1
    } else {
      void loadOlderTrips()
    }
  }
  function nextTrip() {
    if (dataMode.value !== 'historical') return
    if (selectedIndex.value < sortedScannerTrips.value.length - 1) {
      selectedIndex.value += 1
    }
  }
  async function loadOlderTrips() {
    if (dataMode.value !== 'historical') return
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
    refreshTimer = window.setInterval(
      () => {
        void refresh()
      },
      Math.max(REFRESH_INTERVAL_MS, RECON_REFRESH_INTERVAL_MS)
    )
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

  watch(isConnected, (connected) => {
    dataMode.value = connected ? 'live' : 'historical'
    void refresh()
  })

  watch(
    () =>
      sortedScannerTrips.value[sortedScannerTrips.value.length - 1]?.sweepId,
    (newLatestId, oldLatestId) => {
      if (!newLatestId || newLatestId === oldLatestId) return
      if (dataMode.value !== 'live') return
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
    dataMode,
    scannerTrips,
    upperSweeps,
    selectedBaseline,
    currentReconstruction,
    canGoPrev,
    canGoNext,
    isReconstructing,
    reconstructionHint,
    transportDelayStatus,
    autoRefresh,
    lastUpdatedAt,
    errorMessage,
    thicknessCfg,
    angleOffsetDeg,
    calResults,
    prevTrip,
    nextTrip,
  }
}
