<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import * as echarts from 'echarts/core'
import {
  TooltipComponent,
  GridComponent,
  LegendComponent,
} from 'echarts/components'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import useChartsInit from '@/hooks/useInitCharts'
import {
  normalizeThicknessRealtimePayload,
  createThicknessCollector,
  calcThickness,
} from './utiles'
import type { ThicknessConfig } from './utiles'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IPollingModBusData, SweepRow } from '@/types/ipc'

echarts.use([
  TooltipComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  CanvasRenderer,
])

interface SweepData {
  direction: 'forward' | 'backward'
  points: [number, number, number][] // [pos, ad, ts]
}

const isConnected = ref(false)
const loading = ref(false)
const displayMode = ref<'single' | 'round'>('single')
const sweeps = ref<SweepData[]>([])
const currentIndex = ref(0)
const thicknessCfg = ref<ThicknessConfig>({ airAD: 50300, gain: 1.0 })

async function loadThicknessConfig() {
  try {
    const result = (await window.ipcApi.invoke(
      'config-get-device-constants'
    )) as { airAD?: string; materialGain?: string }
    if (result?.airAD) {
      const val = Number(result.airAD)
      if (val > 0) thicknessCfg.value.airAD = val
    }
    if (result?.materialGain) {
      const val = Number(result.materialGain)
      if (val > 0) thicknessCfg.value.gain = val
    }
  } catch {}
}

function detectDirection(points: number[][]): 'forward' | 'backward' {
  if (points.length < 2) return 'forward'
  return points[points.length - 1][0] > points[0][0] ? 'forward' : 'backward'
}

const navIndex = computed(() => {
  if (sweeps.value.length === 0) return 0
  if (displayMode.value === 'single')
    return sweeps.value.length - currentIndex.value
  return Math.floor((sweeps.value.length - 1 - currentIndex.value) / 2) + 1
})

const hasOlderData = ref(true)

const displaySweeps = computed(() => {
  if (sweeps.value.length === 0) return []
  const idx = Math.min(currentIndex.value, sweeps.value.length - 1)
  if (displayMode.value === 'single') {
    return [sweeps.value[idx]]
  }
  const cur = sweeps.value[idx]
  if (!cur) return []
  let other: SweepData | undefined
  if (cur.direction === 'forward') {
    for (let i = idx + 1; i < sweeps.value.length; i++) {
      if (sweeps.value[i].direction !== cur.direction) {
        other = sweeps.value[i]
        break
      }
    }
    if (!other) {
      for (let i = idx - 1; i >= 0; i--) {
        if (sweeps.value[i].direction !== cur.direction) {
          other = sweeps.value[i]
          break
        }
      }
    }
  } else {
    for (let i = idx - 1; i >= 0; i--) {
      if (sweeps.value[i].direction !== cur.direction) {
        other = sweeps.value[i]
        break
      }
    }
    if (!other) {
      for (let i = idx + 1; i < sweeps.value.length; i++) {
        if (sweeps.value[i].direction !== cur.direction) {
          other = sweeps.value[i]
          break
        }
      }
    }
  }
  return cur.direction === 'forward'
    ? ([cur, other].filter(Boolean) as SweepData[])
    : ([other, cur].filter(Boolean) as SweepData[])
})

const chartOption = computed<echarts.EChartsCoreOption>(() => ({
  tooltip: {
    trigger: 'axis',
    formatter(params: unknown) {
      const items = params as {
        seriesName: string
        data: [number, number, number]
        color: string
      }[]
      if (!items.length) return ''
      const pos = items[0].data[0]
      let html = `<div style="font-weight:bold;margin-bottom:4px">位置 ${pos} pulse</div>`
      for (const s of items) {
        const ad = s.data[1]
        const ts = s.data[2]
        const timeStr = ts > 0 ? new Date(ts).toLocaleString() : '—'
        const thick = calcThickness(ad, thicknessCfg.value)
        html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color}"></span>
          ${s.seriesName} <span style="color:#909399;font-size:11px">${timeStr}</span> AD <b>${ad}</b> 厚度 <b>${thick.toFixed(2)}μm</b>
        </div>`
      }
      return html
    },
  },
  legend: { data: ['正程', '逆程'] },
  grid: { left: 50, right: 40, top: 40, bottom: 40 },
  xAxis: { type: 'value', name: '位置(pulse)', min: 0 },
  yAxis: { type: 'value', name: 'AD', splitLine: { show: true } },
  series: [
    { name: '正程', type: 'line', showSymbol: false, data: [] },
    { name: '逆程', type: 'line', showSymbol: false, data: [] },
  ],
}))
const { updateCharts } = useChartsInit('chartRef', chartOption.value)

let buildSeriesCallCount = 0
function buildSeries() {
  buildSeriesCallCount++
  const fwdPoints: [number, number, number][] = []
  const bwdPoints: [number, number, number][] = []
  for (const s of displaySweeps.value) {
    if (s.direction === 'forward') fwdPoints.push(...s.points)
    else bwdPoints.push(...s.points)
  }
  fwdPoints.sort((a, b) => a[0] - b[0])
  // 返程 pulse 逐渐减小，从右往左绘制：按 pulse 降序排列
  bwdPoints.sort((a, b) => b[0] - a[0])
  console.log(`[Longitudinal] buildSeries #${buildSeriesCallCount} | sweeps=${sweeps.value.length} displaySweeps=${displaySweeps.value.length} | fwd=${fwdPoints.length} bwd=${bwdPoints.length}`)
  updateCharts({ series: [{ data: fwdPoints }, { data: bwdPoints }] })
}

watch(
  displaySweeps,
  () => {
    buildSeries()
  },
  { deep: true }
)
watch(displayMode, () => {
  buildSeries()
})

// ── Real-time ──
let collector = createThicknessCollector()
let realtimeCount = 0

function handleRealtimeData(
  _: unknown,
  payload: IPollingModBusData | PushData | PushData[]
) {
  realtimeCount++
  const data = normalizeThicknessRealtimePayload(payload)
  if (!data) {
    if (realtimeCount <= 3) console.log(`[Longitudinal] handleRealtimeData #${realtimeCount}: normalize returned null`, payload)
    return
  }
  const completed = collector.process(data.pulses, data.adValues)
  if (realtimeCount <= 3 || completed) {
    console.log(`[Longitudinal] handleRealtimeData #${realtimeCount} | pulses=${data.pulses.length} completed=${!!completed} sweeps=${sweeps.value.length}`)
  }
  if (completed && completed.length > 0) {
    const nowTs = Date.now()
    const pts = completed
      .filter((p) => p.ad !== null)
      .map((p) => [p.pulse, p.ad!, nowTs] as [number, number, number])
    if (pts.length > 0) {
      const dir = detectDirection(pts)
      console.log(`[Longitudinal] sweep completed! dir=${dir} pts=${pts.length}`)
      sweeps.value.push({ direction: dir, points: pts })
      if (sweeps.value.length > 20)
        sweeps.value.splice(0, sweeps.value.length - 20)
      currentIndex.value = sweeps.value.length - 1
      console.log(`[Longitudinal] sweep added | total sweeps=${sweeps.value.length}`)
    }
  }
}

// ── Historical ──
const HISTORY_PAGE_SIZE = 500000
const OVERLAP_MS = 30000 // 30秒重叠缓冲，确保边界 sweep 完整

async function loadHistoricalData(beforeTs?: number) {
  loading.value = true
  try {
    const rows = (await window.ipcApi.invoke(
      'db-get-latest-sweeps',
      HISTORY_PAGE_SIZE,
      beforeTs
    )) as SweepRow[]
    const mapped = rows.map((r) => ({
      direction: r.direction,
      points: r.points.map(
        (p) => [p.pos, p.ad, p.ts] as [number, number, number]
      ),
    }))
    if (beforeTs && beforeTs > 0) {
      if (mapped.length === 0) {
        hasOlderData.value = false
        return
      }
      // 跳过与已有数据重叠的 sweep（基于首个数据点时间戳去重）
      let start = 0
      const existingFirstTs = sweeps.value[0]?.points?.[0]?.[2] ?? 0
      while (start < mapped.length) {
        const ts = mapped[start].points[0]?.[2] ?? 0
        if (existingFirstTs > 0 && ts >= existingFirstTs) start++
        else break
      }
      if (start >= mapped.length) {
        hasOlderData.value = false
        return
      }
      const added = mapped.slice(start)
      sweeps.value.unshift(...added)
      currentIndex.value = currentIndex.value + added.length
      hasOlderData.value = true
    } else {
      sweeps.value = mapped
      currentIndex.value = sweeps.value.length > 0 ? sweeps.value.length - 1 : 0
      hasOlderData.value = true
    }
  } catch {
    if (!beforeTs) sweeps.value = []
  } finally {
    loading.value = false
  }
}

async function loadOlderData() {
  if (isConnected.value) return
  const first = sweeps.value[0]
  if (!first?.points?.[0]) return
  const oldestTs = first.points[0][2]
  if (oldestTs <= 0) return
  await loadHistoricalData(oldestTs + OVERLAP_MS)
}

function prevSweep() {
  const step = displayMode.value === 'round' ? 2 : 1
  if (currentIndex.value >= step) {
    currentIndex.value -= step
  } else {
    loadOlderData()
  }
}

function nextSweep() {
  const step = displayMode.value === 'round' ? 2 : 1
  currentIndex.value = Math.min(
    currentIndex.value + step,
    sweeps.value.length - 1
  )
}

// ── Connection ──
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
  const wasConnected = isConnected.value
  isConnected.value = payload.connected
  if (isConnected.value && !wasConnected) {
    // 从离线切换到在线：清空历史数据，开始接收实时数据
    collector = createThicknessCollector()
    sweeps.value = []
  } else if (!isConnected.value && wasConnected) {
    // 从在线切换到离线：加载历史数据
    loadHistoricalData()
  }
}

onMounted(async () => {
  console.log('[Longitudinal] onMounted')
  // 始终立即注册 adbox-data（与 side.vue 一致），避免错过实时数据
  window.ipcApi.on('adbox-data', handleRealtimeData)
  window.ipcApi.on('adbox-status', handleStatus)
  console.log('[Longitudinal] handlers registered')

  await loadThicknessConfig()
  console.log('[Longitudinal] thicknessConfig loaded', thicknessCfg.value)
  await checkConnection()
  console.log('[Longitudinal] isConnected =', isConnected.value)

  if (!isConnected.value) {
    await loadHistoricalData()
    console.log('[Longitudinal] historical data loaded | sweeps=', sweeps.value.length)
  }
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
    <div ref="chartRef" class="chart-container"></div>
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
