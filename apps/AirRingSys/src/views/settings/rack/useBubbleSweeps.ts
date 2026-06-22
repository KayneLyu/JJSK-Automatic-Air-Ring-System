import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { BubbleSweepResult } from '@/types/ipc'
import {
  REFRESH_INTERVAL_MS,
  DEFAULT_MEMBRANE_WIDTH_MM,
  DEFAULT_NUM_BINS,
  DEFAULT_PROCESS_DEFORMATION,
  SWEEP_PAGE_SIZE,
  type DataMode,
  type ViewMode,
  type MergedSweepResult,
  type ChartSweepData,
} from './bubbleRawThickness.constants'

/**
 * 将相邻的正向/反向扫描两两配对，按 coverage 加权合并 profile
 * 扫描仪来回扫描，正/反自然交替，相邻异向即为一对
 */
function pairAndMerge(sweeps: BubbleSweepResult[]): MergedSweepResult[] {
  const results: MergedSweepResult[] = []
  let i = 0
  while (i < sweeps.length - 1) {
    const a = sweeps[i]
    const b = sweeps[i + 1]
    if (a.direction !== b.direction && a.numBins === b.numBins) {
      const forward = a.direction === 'forward' ? a : b
      const reverse = a.direction === 'reverse' ? a : b
      results.push(mergePair(forward, reverse))
      i += 2
    } else {
      i += 1
    }
  }
  return results
}

function mergePair(
  forward: BubbleSweepResult,
  reverse: BubbleSweepResult
): MergedSweepResult {
  const numBins = forward.numBins
  const profile = new Array<number>(numBins)
  const binCoverage = new Array<number>(numBins)

  for (let j = 0; j < numBins; j++) {
    const fc = forward.binCoverage[j] ?? 0
    const rc = reverse.binCoverage[j] ?? 0
    const totalCov = fc + rc
    if (totalCov > 0) {
      profile[j] =
        (forward.profile[j] * fc + reverse.profile[j] * rc) / totalCov
    } else {
      profile[j] = (forward.profile[j] + reverse.profile[j]) / 2
    }
    binCoverage[j] = totalCov
  }

  const startTs = Math.min(forward.time, reverse.time)
  const endTs = Math.max(
    forward.time + forward.cycleDurationMs,
    reverse.time + reverse.cycleDurationMs
  )

  return {
    id: `merged-${forward.id}-${reverse.id}`,
    time: startTs,
    direction: 'merged',
    cycleDurationMs: endTs - startTs,
    profile,
    numBins,
    binWidthDeg: forward.binWidthDeg,
    rmsError: (forward.rmsError + reverse.rmsError) / 2,
    maxError: (forward.maxError + reverse.maxError) / 2,
    numMeasurements: forward.numMeasurements + reverse.numMeasurements,
    binCoverage,
    forward,
    reverse,
  }
}

interface CalibrationResults {
  frameLengthMM?: number
  frameLengthPulse?: number
  upperMaxAngle?: number
}

interface DeviceConstants {
  airAD?: string
  materialGain?: string
}

export function useBubbleSweeps() {
  const sweeps = ref<BubbleSweepResult[]>([])
  // 按时间升序（旧 → 新），上一幅/下一幅对应 index 加减
  const sortedSweeps = computed(() =>
    [...sweeps.value].sort((a, b) => a.time - b.time)
  )
  const selectedIndex = ref(0)

  const viewMode = ref<ViewMode>('single')

  // 合并扫描：将相邻的正/反向扫描两两配对，加权合并 profile
  const mergedSweeps = computed(() => pairAndMerge(sortedSweeps.value))
  const selectedMergedIndex = ref(0)

  const dataMode = ref<DataMode>('live')
  const isRefreshing = ref(false)
  const autoRefresh = ref(true)
  const lastUpdatedAt = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const isConnected = ref(false)
  const hasOlderData = ref(true) // 往前翻有没有更多历史

  // 记录当前选中的 sweep id，新数据进来时保持原选中
  // （sortedSweeps 重组不破坏 sweep 对象的 id 字段）
  const lastSelectedId = ref<string | null>(null)
  const lastSelectedMergedId = ref<string | null>(null)

  const thicknessCfg = ref({ airAD: '50300', materialGain: '1.0' })
  const calResults = ref<CalibrationResults>({})

  async function loadConfigs() {
    try {
      const dev = (await window.ipcApi.invoke(
        'config-get-device-constants'
      )) as DeviceConstants
      if (dev?.airAD) thicknessCfg.value.airAD = dev.airAD
      if (dev?.materialGain) thicknessCfg.value.materialGain = dev.materialGain
    } catch {
      /* 默认值即可 */
    }
    try {
      const cal = (await window.ipcApi.invoke(
        'config-get-calibration-results'
      )) as CalibrationResults
      calResults.value = cal
    } catch {
      /* 默认值即可 */
    }
  }

  const params = computed(() => {
    const { frameLengthMM, frameLengthPulse, upperMaxAngle } = calResults.value
    const mmPerPulse =
      frameLengthMM && frameLengthPulse && frameLengthPulse > 0
        ? frameLengthMM / frameLengthPulse
        : 0.1
    const airADNum = Number(thicknessCfg.value.airAD) || 50300
    const gainNum = Number(thicknessCfg.value.materialGain) || 1.0
    return {
      // 使用标定的扫描仪行程长度作为膜宽；未标定时才回退到默认值
      membraneWidthMm:
        frameLengthMM && frameLengthMM > 0 ? frameLengthMM : DEFAULT_MEMBRANE_WIDTH_MM,
      thetaMaxDeg: upperMaxAngle && upperMaxAngle > 0 ? upperMaxAngle : 300,
      mmPerPulse,
      airAD: airADNum,
      gain: gainNum,
      numBins: DEFAULT_NUM_BINS,
      processDeformationFactor: DEFAULT_PROCESS_DEFORMATION,
    }
  })

  const selectedSweep = computed<BubbleSweepResult | null>(
    () => sortedSweeps.value[selectedIndex.value] ?? null
  )

  const selectedMergedSweep = computed<MergedSweepResult | null>(
    () => mergedSweeps.value[selectedMergedIndex.value] ?? null
  )

  /** 当前视图模式下的激活 sweep（单趟或合并） */
  const activeSweep = computed<ChartSweepData | null>(() =>
    viewMode.value === 'merged' ? selectedMergedSweep.value : selectedSweep.value
  )

  /** 合并模式下显示的正/反向淡色叠加 */
  const overlaySweeps = computed<BubbleSweepResult[]>(() => {
    if (viewMode.value !== 'merged') return []
    const m = selectedMergedSweep.value
    return m ? [m.forward, m.reverse] : []
  })

  const currentListLength = computed(() =>
    viewMode.value === 'merged'
      ? mergedSweeps.value.length
      : sortedSweeps.value.length
  )
  const currentIndex = computed(() =>
    viewMode.value === 'merged' ? selectedMergedIndex.value : selectedIndex.value
  )

  const canGoPrev = computed(
    () =>
      !isRefreshing.value &&
      currentListLength.value > 0 &&
      (currentIndex.value > 0 || hasOlderData.value)
  )
  const canGoNext = computed(
    () =>
      currentIndex.value < currentListLength.value - 1 &&
      currentListLength.value > 0
  )

  // 记录当前选中的 sweep id，新数据进来时保持原选中
  watch(activeSweep, (cur) => {
    if (!cur) return
    if (viewMode.value === 'merged') {
      lastSelectedMergedId.value = cur.id
    } else {
      lastSelectedId.value = cur.id
    }
  })

  /**
   * 按 count + beforeTs 拉一趟数据
   *   - beforeTs 不传 → 拉最新 count 趟
   *   - beforeTs 有值 → 拉时间 < beforeTs 的 count 趟
   * 返回按时间升序（旧→新）
   */
  async function fetchSweeps(
    count: number,
    beforeTs?: number
  ): Promise<BubbleSweepResult[]> {
    return (await window.ipcApi.invoke('bubble-get-latest-sweeps', {
      ...params.value,
      count,
      beforeTs,
    })) as BubbleSweepResult[]
  }

  /**
   * 首次加载 / 自动刷新：拿最新 N 趟，**覆盖** sweeps
   * 保留当前选中（按 id）— 若选中已不在窗口内，跳到最新
   */
  async function refresh() {
    if (isRefreshing.value) return
    isRefreshing.value = true
    errorMessage.value = null
    try {
      // **关键**：必须在 await 之前捕获 prevId
      // await 之后 microtask 队列会被排空，watch
      // 会同步触发并把 lastSelectedId 覆盖成第一条的 id（因为
      // 此时 index 还没被更新），那时再读就晚了
      const prevId = lastSelectedId.value
      const prevMergedId = lastSelectedMergedId.value
      const result = await fetchSweeps(SWEEP_PAGE_SIZE)
      sweeps.value = result
      hasOlderData.value = true
      lastUpdatedAt.value = Date.now()
      if (result.length === 0) {
        errorMessage.value =
          dataMode.value === 'live'
            ? '无完整扫描（等待上旋方向变化）'
            : '数据库内尚无扫描'
      } else {
        // 恢复单趟选中
        if (prevId) {
          const idx = result.findIndex((s) => s.id === prevId)
          selectedIndex.value = idx >= 0 ? idx : result.length - 1
        } else {
          selectedIndex.value = result.length - 1
        }
        // 恢复合并选中
        const newMerged = pairAndMerge(
          [...result].sort((a, b) => a.time - b.time)
        )
        if (prevMergedId) {
          const mIdx = newMerged.findIndex((s) => s.id === prevMergedId)
          selectedMergedIndex.value =
            mIdx >= 0 ? mIdx : Math.max(0, newMerged.length - 1)
        } else {
          selectedMergedIndex.value = Math.max(0, newMerged.length - 1)
        }
      }
    } catch (err) {
      sweeps.value = []
      errorMessage.value = err instanceof Error ? err.message : '获取扫描失败'
    } finally {
      isRefreshing.value = false
    }
  }

  /**
   * 往前翻加载更老的数据（参考 LongitudinalCharts.loadOlderData）
   * 触发条件：selectedIndex 已经到 0，且 hasOlderData 为 true
   */
  async function loadOlderSweeps() {
    if (isRefreshing.value || !hasOlderData.value) return
    const first = sortedSweeps.value[0]
    if (!first) return
    // beforeTs 取最早一趟的起点 — 1ms 避免把已有那趟再拉回来
    const beforeTs = first.time - 1
    isRefreshing.value = true
    errorMessage.value = null
    try {
      const older = await fetchSweeps(SWEEP_PAGE_SIZE, beforeTs)
      if (older.length === 0) {
        hasOlderData.value = false
        return
      }
      // 拼接到头部，按时间升序
      const merged = [...older, ...sweeps.value]
      // 去重（按 id）
      const seen = new Set<string>()
      const dedup: BubbleSweepResult[] = []
      for (const s of merged) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        dedup.push(s)
      }
      sweeps.value = dedup
      // 调整 selectedIndex（因为前面插了 older，索引要 +older.length）
      selectedIndex.value += older.length
      // 同步调整 mergedIndex（合并对数可能增加，但保守做法是保持选中在可见范围）
      const newMerged = pairAndMerge(
        [...dedup].sort((a, b) => a.time - b.time)
      )
      const prevMergedId = lastSelectedMergedId.value
      if (prevMergedId) {
        const mIdx = newMerged.findIndex((s) => s.id === prevMergedId)
        selectedMergedIndex.value =
          mIdx >= 0 ? mIdx : Math.max(0, newMerged.length - 1)
      } else {
        selectedMergedIndex.value = Math.max(0, newMerged.length - 1)
      }
      hasOlderData.value = true
      lastUpdatedAt.value = Date.now()
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '加载历史失败'
    } finally {
      isRefreshing.value = false
    }
  }

  function prevSweep() {
    if (viewMode.value === 'merged') {
      if (selectedMergedIndex.value > 0) {
        selectedMergedIndex.value -= 1
      } else {
        void loadOlderSweeps()
      }
    } else {
      if (selectedIndex.value > 0) {
        selectedIndex.value -= 1
      } else {
        void loadOlderSweeps()
      }
    }
  }

  function nextSweep() {
    if (viewMode.value === 'merged') {
      if (selectedMergedIndex.value < mergedSweeps.value.length - 1) {
        selectedMergedIndex.value += 1
      }
    } else {
      if (selectedIndex.value < sortedSweeps.value.length - 1) {
        selectedIndex.value += 1
      }
    }
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prevSweep()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextSweep()
    }
  }

  watch(autoRefresh, (val) => {
    if (val) startAutoRefresh()
    else stopAutoRefresh()
  })

  watch(dataMode, (mode) => {
    if (mode === 'historical') {
      stopAutoRefresh()
    } else {
      startAutoRefresh()
    }
  })

  watch(isConnected, (connected) => {
    dataMode.value = connected ? 'live' : 'historical'
    void refresh()
  })

  onMounted(async () => {
    await loadConfigs()
    await checkConnection()
    dataMode.value = isConnected.value ? 'live' : 'historical'
    window.ipcApi.on('adbox-status', handleStatus)
    window.addEventListener('keydown', handleKeydown)
    await refresh()
    startAutoRefresh()
  })

  onUnmounted(() => {
    stopAutoRefresh()
    window.ipcApi.off('adbox-status', handleStatus)
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    // state
    sweeps,
    sortedSweeps,
    selectedIndex,
    selectedSweep,
    mergedSweeps,
    selectedMergedIndex,
    selectedMergedSweep,
    activeSweep,
    overlaySweeps,
    viewMode,
    canGoPrev,
    canGoNext,
    dataMode,
    isRefreshing,
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
    prevSweep,
    nextSweep,
    checkConnection,
  }
}
