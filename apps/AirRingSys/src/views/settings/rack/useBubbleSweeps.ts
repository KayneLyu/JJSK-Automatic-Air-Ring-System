import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { BubbleSweepResult, ICalibrationResults } from '@/types/ipc'
import {
  REFRESH_INTERVAL_MS,
  DEFAULT_MEMBRANE_WIDTH_MM,
  DEFAULT_NUM_BINS,
  DEFAULT_PROCESS_DEFORMATION,
  SWEEP_PAGE_SIZE,
  type DataMode,
} from './bubbleRawThickness.constants'

interface DeviceConstants {
  airAD?: string
  materialGain?: string
}

export function useBubbleSweeps() {
  const sweeps = ref<BubbleSweepResult[]>([])
  const liveSweep = ref<BubbleSweepResult | null>(null)
  // 按时间升序（旧 → 新），上一幅/下一幅对应 index 加减
  const sortedSweeps = computed(() =>
    [...sweeps.value].sort((a, b) => a.time - b.time)
  )
  const selectedIndex = ref(0)

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

  const thicknessCfg = ref({ airAD: '50300', materialGain: '1.0' })
  const calResults = ref<ICalibrationResults>({})

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
      )) as ICalibrationResults
      calResults.value = cal
    } catch {
      /* 默认值即可 */
    }
  }

  const params = computed(() => {
    const {
      frameLengthMM,
      frameLengthPulse,
      mmPerPulse: storedMmPerPulse,
      membraneWidthMm: storedMembraneWidthMm,
      upperMaxAngle,
    } = calResults.value
    // mm/脉冲 优先用持久化值，否则用 frameLengthMM/frameLengthPulse 计算
    const mmPerPulse =
      storedMmPerPulse !== undefined &&
      Number.isFinite(storedMmPerPulse) &&
      storedMmPerPulse > 0
        ? storedMmPerPulse
        : frameLengthMM && frameLengthPulse && frameLengthPulse > 0
          ? frameLengthMM / frameLengthPulse
          : 0.1
    const airADNum = Number(thicknessCfg.value.airAD) || 50300
    const gainNum = Number(thicknessCfg.value.materialGain) || 1.0

    const { upperDistance, rollerTractionSpeed } = calResults.value
    const transportDelayMs =
      upperDistance != null &&
      upperDistance > 0 &&
      rollerTractionSpeed != null &&
      rollerTractionSpeed > 0
        ? (upperDistance / rollerTractionSpeed) * 1000
        : undefined

    return {
      // 膜宽优先级：寻边标定的膜宽 > 机架长度（mm）> 默认值
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

  const selectedSweep = computed<BubbleSweepResult | null>(() => {
    if (dataMode.value === 'live') {
      if (liveSweep.value) return liveSweep.value
      return sortedSweeps.value[sortedSweeps.value.length - 1] ?? null
    }
    return sortedSweeps.value[selectedIndex.value] ?? null
  })

  const canGoPrev = computed(
    () =>
      !isRefreshing.value &&
      sortedSweeps.value.length > 0 &&
      (selectedIndex.value > 0 || hasOlderData.value)
  )
  const canGoNext = computed(
    () =>
      selectedIndex.value < sortedSweeps.value.length - 1 &&
      sortedSweeps.value.length > 0
  )

  // 记录当前选中的 sweep id，新数据进来时保持原选中
  watch(selectedSweep, (cur) => {
    if (!cur || dataMode.value === 'live' || cur.inProgress) return
    lastSelectedId.value = cur.id
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

  async function fetchCurrentSweep(): Promise<BubbleSweepResult | null> {
    return (await window.ipcApi.invoke('bubble-get-current-sweep', {
      ...params.value,
    })) as BubbleSweepResult | null
  }

  /**
   * 首次加载 / 自动刷新：拿最新 N 趟，**覆盖** sweeps
   * 保留当前选中（按 id）— 若选中已不在窗口内，跳到最新
   */
  async function refresh() {
    if (isRefreshing.value) return
    if (params.value.transportDelayMs == null) {
      errorMessage.value =
        '运输延迟参数缺失：需标定 测量点距离(upperDistance) 和 牵引速度(rollerTractionSpeed)'
      sweeps.value = []
      liveSweep.value = null
      return
    }
    isRefreshing.value = true
    errorMessage.value = null
    try {
      // **关键**：必须在 await 之前捕获 prevId
      // await 之后 microtask 队列会被排空，watch
      // 会同步触发并把 lastSelectedId 覆盖成第一条的 id（因为
      // 此时 index 还没被更新），那时再读就晚了
      const prevId = lastSelectedId.value
      const [current, result] = await Promise.all([
        dataMode.value === 'live' ? fetchCurrentSweep() : Promise.resolve(null),
        fetchSweeps(SWEEP_PAGE_SIZE + 1),
      ])
      liveSweep.value = current
      hasOlderData.value = result.length > SWEEP_PAGE_SIZE
      const page = hasOlderData.value
        ? result.slice(result.length - SWEEP_PAGE_SIZE)
        : result
      sweeps.value = page
      lastUpdatedAt.value = Date.now()
      if (!current && page.length === 0) {
        errorMessage.value =
          dataMode.value === 'live'
            ? '等待当前扫描累计数据'
            : '数据库内尚无扫描'
      } else {
        if (prevId) {
          const idx = page.findIndex((s) => s.id === prevId)
          selectedIndex.value = idx >= 0 ? idx : page.length - 1
        } else {
          selectedIndex.value = page.length - 1
        }
      }
    } catch (err) {
      liveSweep.value = null
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
    if (params.value.transportDelayMs == null) return
    const first = sortedSweeps.value[0]
    if (!first) return
    // beforeTs 取最早一趟的起点 — 1ms 避免把已有那趟再拉回来
    const beforeTs = first.time - 1
    isRefreshing.value = true
    errorMessage.value = null
    try {
      const older = await fetchSweeps(SWEEP_PAGE_SIZE + 1, beforeTs)
      if (older.length === 0) {
        hasOlderData.value = false
        return
      }
      hasOlderData.value = older.length > SWEEP_PAGE_SIZE
      const pageOlder = hasOlderData.value
        ? older.slice(older.length - SWEEP_PAGE_SIZE)
        : older
      // 拼接到头部，按时间升序
      const merged = [...pageOlder, ...sweeps.value]
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
      selectedIndex.value += pageOlder.length
      lastUpdatedAt.value = Date.now()
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : '加载历史失败'
    } finally {
      isRefreshing.value = false
    }
  }

  function prevSweep() {
    if (selectedIndex.value > 0) {
      selectedIndex.value -= 1
    } else {
      void loadOlderSweeps()
    }
  }

  function nextSweep() {
    if (selectedIndex.value < sortedSweeps.value.length - 1) {
      selectedIndex.value += 1
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
      liveSweep.value = null
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
