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
import {
  SCANNER_TRIPS_FETCH_COUNT,
  UPPER_SWEEPS_REFRESH_MIN_INTERVAL_MS,
  UPPER_SWEEPS_FETCH_COUNT,
  RECON_REFRESH_INTERVAL_MS,
  UPPER_SWEEP_GAP_TOLERANCE_MS,
  MAX_EFFECTIVE_TRANSPORT_DELAY_MS,
} from './scannerTripReconstruction.constants'
import type {
  ReconstructedSweep,
  DeviceConstants,
  UpperSweepCoverage,
  MeasurementBuildResult,
  MeasurementParams,
} from './scannerTripReconstruction.types'
import {
  getUpperSweepsCoverage,
  buildMeasurements,
  mergeMeasurementBuildResults,
  estimateCoverageRatio,
  estimatePhiSeparationStats,
  estimateThetaCoverageStats,
  suggestFallbackAirAD,
  getWindowTrips as collectWindowTrips,
} from './scannerTripReconstruction.utils'
import type { ThicknessConfig } from './utiles'

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

  const thicknessCfg = ref<ThicknessConfig>({ airAD: 50300, gain: 1.0 })
  const calResults = ref<ICalibrationResults>({})

  async function loadConfigs() {
    try {
      const dev = (await window.ipcApi.invoke(
        'config-get-device-constants'
      )) as DeviceConstants
      if (dev?.airAD) thicknessCfg.value.airAD = Number(dev.airAD) || 50300
      if (dev?.materialGain)
        thicknessCfg.value.gain = Number(dev.materialGain) || 1.0
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
      thicknessCfg.value.gain !== undefined &&
      Number.isFinite(thicknessCfg.value.gain)
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

      const buildWithDelay = (
        delayMs: number,
        airAD: number,
        diagnostics: boolean
      ): MeasurementBuildResult =>
        mergeMeasurementBuildResults(
          filteredBatches.map((pts, idx) =>
            buildMeasurements(
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
        const candidateSet = new Set<number>([
          0,
          preferredDelayMs,
          Math.max(0, preferredDelayMs - 120_000),
          Math.max(0, preferredDelayMs - 90_000),
          Math.max(0, preferredDelayMs - 60_000),
          Math.max(0, preferredDelayMs - 30_000),
          preferredDelayMs + 30_000,
          preferredDelayMs + 60_000,
          preferredDelayMs + 90_000,
          preferredDelayMs + 120_000,
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

      const measurements = chosenBuild.measurements
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
      if (thetaCoverage.ratio < 0.65) {
        reconstructionHint.value = `上旋覆盖不足（θ p05=${thetaCoverage.p05.toFixed(0)}°, p95=${thetaCoverage.p95.toFixed(0)}°, 覆盖=${(thetaCoverage.ratio * 100).toFixed(1)}%）`
        console.warn(
          `[B(φ)] 跳过重构: 上旋覆盖严重不足 (thetaSpan=${thetaCoverage.span.toFixed(1)}°, ratio=${(thetaCoverage.ratio * 100).toFixed(1)}%, meas=${measurements.length})`
        )
        return null
      }
      if (thetaCoverage.ratio < 0.75) {
        console.warn(
          `[B(φ)] 上旋覆盖偏低但继续重构: thetaSpan=${thetaCoverage.span.toFixed(1)}°, ratio=${(thetaCoverage.ratio * 100).toFixed(1)}%, meas=${measurements.length}`
        )
      }

      const baseCoverage = estimateCoverageRatio(
        measurements,
        p.membraneWidthMm,
        p.numBins
      )
      const coverageDrivenBins =
        baseCoverage.ratio >= 0.8
          ? p.numBins
          : Math.floor((p.numBins * baseCoverage.ratio) / 0.8)
      const adaptiveNumBins = Math.max(
        90,
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
      const result = (await window.ipcApi.invoke('bubble-reconstruct-window', {
        measurements,
        membraneWidthMm: p.membraneWidthMm,
        numBins: adaptiveNumBins,
        processDeformationFactor: p.processDeformationFactor,
        preferAfterTs: baseline.startTs,
      })) as BubbleWindowReconstructionResult | null
      if (!result) {
        reconstructionHint.value = `重构求解无结果（samples=${samplesForReconstruction.length}, meas=${measurements.length}, delay=${chosenBuild.stats.transportDelayMs.toFixed(0)}ms）`
        return null
      }
      reconstructionHint.value = null

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
    mm/pls=${p.mmPerPulse.toFixed(4)} airAD=${chosenAirAD}${chosenAirAD !== p.airAD ? ` (cfg=${p.airAD})` : ''} gain=${p.gain.toFixed(3)}`
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
      const phiDist: {
        theta: number
        x: number
        delta: number
        phi1: number
        phi2: number
        T: number
      }[] = []
      for (let i = 0; i < measurements.length; i += step) {
        const m = measurements[i]
        const delta = (m.scannerPosMm / p.membraneWidthMm) * 180
        phiDist.push({
          theta: m.upperAngleDeg,
          x: m.scannerPosMm,
          delta,
          phi1: (((m.upperAngleDeg + 90 + delta) % 360) + 360) % 360,
          phi2: (((m.upperAngleDeg + 90 - delta) % 360) + 360) % 360,
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
    // state — consumed by BubbleRawThickness.vue
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
    calResults,
    // actions
    prevTrip,
    nextTrip,
  }
}
