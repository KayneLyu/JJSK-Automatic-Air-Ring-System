<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { useConfigStore } from '@/store/config.ts'
import { normalizeThicknessRealtimePayload, calcThickness } from './utiles'
import type { ThicknessConfig } from './utiles'
import type { PushData } from '@jjsk/adbox-sdk'
import type {
  IPollingModBusData,
  SweepPoint,
  SweepSummaryRow,
} from '@/types/ipc'

use([
  TooltipComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  CanvasRenderer,
])

interface SweepData {
  sweepId?: string
  direction: 'forward' | 'backward'
  startTs?: number
  endTs?: number
  points: [number, number, number][]
}

const configStore = useConfigStore()
const isConnected = ref(false)
const loading = ref(false)
const displayMode = ref<'single' | 'round'>('single')
const sweeps = ref<SweepData[]>([])
const liveSweep = ref<SweepData | null>(null)
const currentIndex = ref(0)
const thicknessCfg = ref<ThicknessConfig>({ airAD: 50300, gain: 1.0 })

async function loadThicknessConfig() {
  try {
    const result = (await window.ipcApi.invoke(
      'config-get-device-constants'
    )) as { airAD?: string; materialGain?: string }
    if (result?.airAD) {
      const v = Number(result.airAD)
      if (v > 0) thicknessCfg.value.airAD = v
    }
    if (result?.materialGain) {
      const v = Number(result.materialGain)
      if (v > 0) thicknessCfg.value.gain = v
    }
  } catch {}
}

const navIndex = computed(() => {
  if (sweeps.value.length === 0) return 0
  if (displayMode.value === 'single')
    return sweeps.value.length - currentIndex.value
  return Math.floor((sweeps.value.length - 1 - currentIndex.value) / 2) + 1
})

const hasOlderData = ref(true)

function getVisibleIndices(): number[] {
  if (sweeps.value.length === 0) return []
  const idx = Math.min(currentIndex.value, sweeps.value.length - 1)
  if (displayMode.value === 'single') return [idx]

  const cur = sweeps.value[idx]
  if (!cur) return []
  let otherIdx = -1
  if (cur.direction === 'forward') {
    for (let i = idx + 1; i < sweeps.value.length; i++) {
      if (sweeps.value[i].direction !== cur.direction) {
        otherIdx = i
        break
      }
    }
    if (otherIdx < 0) {
      for (let i = idx - 1; i >= 0; i--) {
        if (sweeps.value[i].direction !== cur.direction) {
          otherIdx = i
          break
        }
      }
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (sweeps.value[i].direction !== cur.direction) {
        otherIdx = i
        break
      }
    }
    if (otherIdx < 0) {
      for (let i = idx + 1; i < sweeps.value.length; i++) {
        if (sweeps.value[i].direction !== cur.direction) {
          otherIdx = i
          break
        }
      }
    }
  }

  return otherIdx >= 0 ? [idx, otherIdx] : [idx]
}

async function loadSweepPoints(
  summary: Pick<SweepData, 'startTs' | 'endTs'>
): Promise<[number, number, number][]> {
  if (!summary.startTs || !summary.endTs) return []
  const points = (await window.ipcApi.invoke(
    'db-get-sweep-points-by-range',
    summary.startTs,
    summary.endTs
  )) as SweepPoint[]
  return points.map(function (p) {
    return [p.pos, p.ad, p.ts] as [number, number, number]
  })
}

async function ensureVisibleSweepsLoaded() {
  if (isConnected.value) return
  const indices = getVisibleIndices()
  if (indices.length === 0) return

  for (const idx of indices) {
    const target = sweeps.value[idx]
    if (!target || target.points.length > 0) continue
    const points = await loadSweepPoints(target)
    const replaced = { ...target, points }
    sweeps.value.splice(idx, 1, replaced)
  }
}

const displaySweeps = computed(() => {
  if (isConnected.value) return getRealtimeDisplaySweeps()

  const indices = getVisibleIndices()
  if (indices.length === 0) return []
  const visible = indices
    .map((i) => sweeps.value[i])
    .filter((s): s is SweepData => Boolean(s))

  if (visible.length <= 1) return visible
  if (visible[0].direction === 'forward') return visible
  return [visible[1], visible[0]]
})

const chartOption = computed(() => {
  const fwdPoints: [number, number, number][] = []
  const bwdPoints: [number, number, number][] = []
  for (const s of displaySweeps.value) {
    if (s.direction === 'forward') fwdPoints.push(...s.points)
    else bwdPoints.push(...s.points)
  }
  fwdPoints.sort((a, b) => a[0] - b[0])
  bwdPoints.sort((a, b) => b[0] - a[0])

  return {
    tooltip: {
      trigger: 'axis' as const,
      formatter(params: unknown) {
        const items = params as {
          seriesName: string
          data: [number, number, number] | [number, number]
          color: string
        }[]
        if (!items.length) return ''
        const pos = items[0].data[0]
        let html = `<div style="font-weight:bold;margin-bottom:4px">位置 ${pos}</div>`
        for (var i = 0; i < items.length; i++) {
          var s = items[i],
            ad = s.data[1]
          var ts = s.data.length > 2 ? s.data[2] || 0 : 0
          var timeStr = ts > 0 ? new Date(ts).toLocaleString() : '—'
          var thick = calcThickness(ad, thicknessCfg.value)

          html += `<div style="font-weight:bold;margin-bottom:4px">AD ${Number(ad.toFixed(0))}</div>`
          html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color}"></span> ${s.seriesName} <span style="color:#909399;font-size:11px">${timeStr}</b> 厚度 <b>${thick.toFixed(2)}μm</b></div>`
        }
        return html
      },
    },
    legend: { data: ['正程', '逆程'] },
    grid: { left: 50, right: 40, top: 40, bottom: 40 },
    xAxis: { type: 'value' as const, name: '位置(pulse)', min: 0 },
    yAxis: { type: 'value' as const, name: 'AD', splitLine: { show: true } },
    series: [
      {
        name: '正程',
        type: 'line' as const,
        showSymbol: false,
        data: fwdPoints,
      },
      {
        name: '逆程',
        type: 'line' as const,
        showSymbol: false,
        data: bwdPoints,
      },
    ],
  }
})

const theme = computed(() => (configStore.isDark ? 'dark' : ''))

let rtLastPulse: number | null = null
let rtDirection: 'forward' | 'backward' | null = null
let rtBuffer: [number, number, number][] = []

function buildLiveSweep(): SweepData | null {
  if (rtBuffer.length === 0) return null

  const direction =
    rtDirection ??
    (rtBuffer.length >= 2 && rtBuffer[rtBuffer.length - 1][0] < rtBuffer[0][0]
      ? 'backward'
      : 'forward')

  return {
    sweepId: `live-${rtBuffer[0]?.[2] ?? Date.now()}-${direction}`,
    direction,
    startTs: rtBuffer[0]?.[2] ?? 0,
    endTs: rtBuffer[rtBuffer.length - 1]?.[2] ?? 0,
    points: rtBuffer.slice(),
  }
}

function getRealtimeDisplaySweeps(): SweepData[] {
  const current = liveSweep.value
  if (!current) return []
  if (displayMode.value === 'single') return [current]

  const opposite = [...sweeps.value]
    .reverse()
    .find((s) => s.direction !== current.direction)

  if (!opposite) return [current]
  return current.direction === 'forward'
    ? [current, opposite]
    : [opposite, current]
}

function handleRealtimeData(
  _: unknown,
  payload: IPollingModBusData | PushData | PushData[]
) {
  const data = normalizeThicknessRealtimePayload(payload)
  if (!data) return

  let needUpdateLiveSweep = false

  for (var j = 0; j < data.pulses.length; j++) {
    var pulse = data.pulses[j]
    if (pulse < 0) continue
    var ad = data.adValues[j]
    var ts = data.timestamps[j] ?? Date.now()

    if (rtLastPulse !== null) {
      var delta = pulse - rtLastPulse
      var newDir: 'forward' | 'backward' = delta >= 0 ? 'forward' : 'backward'

      if (rtDirection !== null && newDir !== rtDirection) {
        // 方向翻转 → 上一趟结束，推入 sweeps
        if (rtBuffer.length > 10) {
          sweeps.value.push({
            sweepId: `live-${rtBuffer[0]?.[2] ?? ts}-${rtDirection}`,
            direction: rtDirection,
            startTs: rtBuffer[0]?.[2] ?? ts,
            endTs: rtBuffer[rtBuffer.length - 1]?.[2] ?? ts,
            points: rtBuffer.slice(),
          })
          if (sweeps.value.length > 20)
            sweeps.value.splice(0, sweeps.value.length - 20)
          currentIndex.value = sweeps.value.length - 1
        }
        rtBuffer = []
        liveSweep.value = null
      }
      rtDirection = newDir
    }
    rtBuffer.push([pulse, ad, ts])
    needUpdateLiveSweep = true
    rtLastPulse = pulse
  }
  
  // 只在批次结束时更新一次 liveSweep，避免每个数据点都触发 Vue 响应式 + ECharts 重渲染
  if (needUpdateLiveSweep) {
    if (rtBuffer.length > 8000) {
      rtBuffer = rtBuffer.slice(-8000)
    }
    liveSweep.value = buildLiveSweep()
  }
}

const HISTORY_PAGE_SIZE = 500000
const OVERLAP_MS = 30000

async function loadHistoricalData(beforeTs?: number) {
  loading.value = true
  try {
    const rows = (await window.ipcApi.invoke(
      'db-get-sweep-summaries',
      HISTORY_PAGE_SIZE,
      beforeTs
    )) as SweepSummaryRow[]
    const mapped = rows.map(function (r) {
      return {
        sweepId: r.sweepId,
        direction: r.direction,
        startTs: r.startTs,
        endTs: r.endTs,
        points: [],
      }
    })

    if (beforeTs && beforeTs > 0) {
      if (mapped.length === 0) {
        hasOlderData.value = false
        return
      }

      let start = 0
      const existingFirstTs = sweeps.value[0]?.startTs ?? 0
      while (start < mapped.length) {
        if (
          existingFirstTs > 0 &&
          (mapped[start].startTs ?? 0) >= existingFirstTs
        ) {
          start += 1
        } else {
          break
        }
      }

      if (start >= mapped.length) {
        hasOlderData.value = false
        return
      }

      const append = mapped.slice(start)
      sweeps.value.unshift(...append)
      currentIndex.value += append.length
      hasOlderData.value = true
    } else {
      // IPC 返回的 rows 已经是 startTs 升序(旧→新),保持原序
      // sweeps[0] = 最早, sweeps[length-1] = 最新
      // currentIndex 默认指到最新,与"打开页面就看到最新"的预期一致
      sweeps.value = mapped
      currentIndex.value = sweeps.value.length > 0 ? sweeps.value.length - 1 : 0
      hasOlderData.value = true
    }
    await ensureVisibleSweepsLoaded()
  } catch {
    if (!beforeTs) sweeps.value = []
  } finally {
    loading.value = false
  }
}

async function loadOlderData() {
  if (isConnected.value) return
  var first = sweeps.value[0]
  if (!first?.startTs) return
  if (first.startTs <= 0) return
  await loadHistoricalData(first.startTs + OVERLAP_MS)
}

function prevSweep() {
  var s = displayMode.value === 'round' ? 2 : 1
  if (currentIndex.value >= s) {
    currentIndex.value -= s
    void ensureVisibleSweepsLoaded()
  } else {
    loadOlderData()
  }
}

function nextSweep() {
  var s = displayMode.value === 'round' ? 2 : 1
  currentIndex.value = Math.min(currentIndex.value + s, sweeps.value.length - 1)
  void ensureVisibleSweepsLoaded()
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
  var wasConnected = isConnected.value
  isConnected.value = payload.connected
  if (isConnected.value && !wasConnected) {
    sweeps.value = []
    liveSweep.value = null
    rtLastPulse = null
    rtDirection = null
    rtBuffer = []
  } else if (!isConnected.value && wasConnected) {
    liveSweep.value = null
    loadHistoricalData()
  }
}

watch(displayMode, () => {
  void ensureVisibleSweepsLoaded()
})

onMounted(async () => {
  window.ipcApi.on('adbox-data', handleRealtimeData)
  window.ipcApi.on('adbox-status', handleStatus)
  await loadThicknessConfig()
  await checkConnection()
  if (!isConnected.value) await loadHistoricalData()
})

onUnmounted(() => {
  window.ipcApi.off('adbox-status', handleStatus)
  window.ipcApi.off('adbox-data', handleRealtimeData)
})
</script>

<template>
  <div class="longitudinal">
    <div class="status-bar">
      <span :class="['status-dot', isConnected ? 'online' : 'offline']"></span>
      <span class="status-text">{{
        isConnected ? '测厚仪已连接 — 实时数据' : '离线模式 — 历史数据'
      }}</span>
      <span v-if="!isConnected" class="nav-controls">
        <button
          :disabled="
            sweeps.length === 0 ||
            (currentIndex < (displayMode === 'round' ? 2 : 1) && !hasOlderData)
          "
          @click="prevSweep"
        >
          上一幅
        </button>
        <span class="nav-info">{{ sweeps.length > 0 ? navIndex : 0 }}</span>
        <button
          :disabled="
            currentIndex >= sweeps.length - (displayMode === 'round' ? 2 : 1)
          "
          @click="nextSweep"
        >
          下一幅
        </button>
      </span>
      <span class="mode-controls">
        <label
          :class="['mode-btn', { active: displayMode === 'single' }]"
          @click="displayMode = 'single'"
          >单程</label
        >
        <label
          :class="['mode-btn', { active: displayMode === 'round' }]"
          @click="displayMode = 'round'"
          >来回</label
        >
      </span>
    </div>
    <VChart
      class="chart-container"
      :option="chartOption"
      :theme="theme"
      autoresize
    />
    <div v-if="loading" class="loading-overlay">加载中...</div>
    <div
      v-else-if="!isConnected && sweeps.length === 0"
      class="loading-overlay"
    >
      暂无历史数据
    </div>
  </div>
</template>

<style scoped>
.longitudinal {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
  position: relative;
}
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  flex-shrink: 0;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online {
  background: #67c23a;
}
.status-dot.offline {
  background: #909399;
}
.status-text {
  color: #909399;
}
.nav-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.nav-controls button {
  padding: 2px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  background: #fff;
  color: #606266;
  font-size: 12px;
}
.nav-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.nav-info {
  font-size: 12px;
  color: #909399;
  min-width: 50px;
  text-align: center;
}
.mode-controls {
  display: flex;
  gap: 2px;
}
.mode-btn {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: #909399;
  border: 1px solid #dcdfe6;
  background: #fff;
}
.mode-btn.active {
  color: #409eff;
  border-color: #409eff;
  background: #ecf5ff;
}
.chart-container {
  flex: 1;
  min-height: 100px;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.6);
  z-index: 1;
  pointer-events: none;
}
</style>
