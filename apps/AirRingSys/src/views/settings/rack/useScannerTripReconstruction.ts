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

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type {
  BubbleSweepResult,
  ICalibrationResults,
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
import {
  reconstructBubbleThickness,
  type BubbleReconstructionResult,
  type MeasurementTriple,
} from './utils/bubbleReconstruction'

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
  result: BubbleReconstructionResult
  /** 重构用的样本数 */
  numSamples: number
}

export const SCANNER_SLIDING_WINDOW = 640

export function useScannerTripReconstruction() {
  // 上旋趟(用于 θ_max / 起始时间)
  const upperSweeps = ref<BubbleSweepResult[]>([])
  // 测厚仪扫描趟 summary
  const scannerTrips = ref<SweepSummaryRow[]>([])
  // 详细 samples(按 sweepId 缓存)
  const samplesCache = ref<Map<string, SweepPoint[]>>(new Map())
  // 重构结果(按 baseline sweepId 缓存)
  const reconstructionCache = ref<Map<string, ReconstructedSweep>>(new Map())

  const selectedIndex = ref(0)
  const dataMode = ref<DataMode>('live')
  const isRefreshing = ref(false)
  const isReconstructing = ref(false)
  const autoRefresh = ref(true)
  const lastUpdatedAt = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const isConnected = ref(false)
  const hasOlderData = ref(true)

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

  /** 给定 ts, 找出包含它的上旋趟(用于 timeToAngle 算 θ) */
  function findUpperSweepAt(ts: number): BubbleSweepResult | null {
    // 上旋趟按 time 升序, 选包含 ts 的最后一个
    let candidate: BubbleSweepResult | null = null
    for (const s of upperSweeps.value) {
      if (s.time <= ts) candidate = s
      else break
    }
    if (candidate) {
      const end = candidate.time + candidate.cycleDurationMs
      if (ts <= end) return candidate
    }
    // 不在任何一趟内, 退回用最近的
    return candidate
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

  /** 滑动窗口: baseline + 前 N-1 趟 */
  function getWindowTrips(
    baseline: SweepSummaryRow
  ): SweepSummaryRow[] {
    const all = sortedScannerTrips.value
    const idx = all.findIndex((s) => s.sweepId === baseline.sweepId)
    if (idx < 0) return [baseline]
    const start = Math.max(0, idx - (SCANNER_SLIDING_WINDOW - 1))
    return all.slice(start, idx + 1)
  }

  /** 用 (pos, ad, ts) + 上旋趟信息 构造测量三元组 */
  function buildMeasurements(
    samples: SweepPoint[],
    airAD: number,
    gain: number
  ): MeasurementTriple[] {
    const p = params.value
    const triples: MeasurementTriple[] = []
    for (const s of samples) {
      if (s.ad <= 0 || s.ad >= airAD) continue
      const upper = findUpperSweepAt(s.ts)
      if (!upper) continue
      const tInTrip = s.ts - upper.time
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
      triples.push({
        upperAngleDeg: theta,
        scannerPosMm: x,
        thickness: T,
        timestamp: s.ts,
      })
    }
    return triples
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
      // 并行加载窗口内所有 trips 的 samples(本地 SQLite,64 路并发 OK)
      const batches = await Promise.all(windowTrips.map((t) => loadSamples(t)))
      const allSamples: SweepPoint[] = []
      for (const pts of batches) allSamples.push(...pts)
      const p = params.value
      const measurements = buildMeasurements(allSamples, p.airAD, p.gain)
      if (measurements.length < 50) {
        // 数据太少,放弃
        return null
      }
      const result = reconstructBubbleThickness(
        measurements,
        p.membraneWidthMm,
        {
          numBins: p.numBins,
          processDeformationFactor: p.processDeformationFactor,
        }
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
  const currentReconstruction = ref<ReconstructedSweep | null>(null)

  /**
   * 防快速翻页把队列打满:150ms 内多次切 baseline 只触发最后一次
   * - 切了立刻拿缓存出来, 不让 chart 闪空
   * - 150ms 静止后真重建, 重启预热相邻
   */
  const RECON_DEBOUNCE_MS = 150
  let pendingBaselineId: string | null = null
  let debounceTimer: number | null = null

  function scheduleReconstruction(id: string) {
    if (pendingBaselineId === id) return
    pendingBaselineId = id
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      const targetId = pendingBaselineId
      pendingBaselineId = null
      debounceTimer = null
      if (targetId) void runReconstruction(targetId)
    }, RECON_DEBOUNCE_MS)
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
  const currentScannerSweep = ref<ScannerSweepLite | null>(null)
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
      const upper = findUpperSweepAt(baseline.startTs)
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
      const result = (await window.ipcApi.invoke(
        'bubble-get-latest-sweeps',
        { ...params.value, count: 200 }
      )) as BubbleSweepResult[]
      upperSweeps.value = [...result].sort((a, b) => a.time - b.time)
    } catch (err) {
      upperSweeps.value = []
      errorMessage.value = err instanceof Error ? err.message : '加载上旋趟失败'
    }
  }

  async function loadScannerTrips(beforeTs?: number): Promise<void> {
    try {
      const rows = (await window.ipcApi.invoke(
        'db-get-sweep-summaries',
        2000,
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
    }, REFRESH_INTERVAL_MS)
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
      // 切到最新趟 → 触发 selectedBaseline.sweepId watcher → 触发重构
      selectedIndex.value = sortedScannerTrips.value.length - 1
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
    scannerTrips,
    sortedScannerTrips,
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
