import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'node:path'
import { ADBoxClient } from '@jjsk/adbox-sdk'
import type { PushData, RunResult } from '@jjsk/adbox-sdk'
import type { ICalibrationResult, IUpperRotationDebugData } from '@/types/ipc'
import { createUpperRotationS7Connection } from '@jjsk/air-ring-server/electron'
import Store from 'electron-store'
import { DataBatcher } from './data-batcher'
import { createModbusCalibrationBridge } from './calibrationBridge'
import { initCalibrationIpc } from './calibrationIpc'
import { SQLiteService, type FrameRow } from './sqliteService'
import { DataPipeline } from './dataPipeline'

// ==================== 类型定义 ====================
type MotionState =
  | 'idle'
  | 'forward'
  | 'backward'
  | 'stopping'
  | 'scanning'
  | 'emergency'

// ==================== 配置接口 ====================
interface AppConfig {
  maxPulse: number
  margin: number
  manualTractionSpeed?: number
  manualDistance?: number
  manualMaxAngle?: number
  manualMutationWindowSize?: number
  // 设备常量
  rollerMode: string
  rollerValue: string
  rollerNumCycles: string
  airAD: string
  materialGain: string
  upperDeltaMin: string
  upperDeltaMax: string
  upperObjectiveMode: string
  airDuctCount: string
  systemAirDuct1Angle: string
  // 标定结果
  rollerResultTractionSpeed?: number
  frameLengthMMResult?: number
  frameLengthPulseResult?: number
  mutationWindowSizeResult?: number
  upperResultMaxAngle?: number
  upperResultDistance?: number
}

// ==================== 全局状态 (模块级私有) ====================
let mainWindow: BrowserWindow | null = null // 保存引用供内部使用
let dataBatcher: DataBatcher<PushData> | null = null
let pipeline: DataPipeline | null = null
let sqliteDb: SQLiteService | null = null
let adb: ADBoxClient | null = null
let store: Store<AppConfig> | null = null
let upperRotationConnection: ReturnType<
  typeof createUpperRotationS7Connection
> | null = null
let upperRotationPollInterval: NodeJS.Timeout | null = null
let sysTickBaseWallTime: number | undefined
let sysTickBaseExpanded: number | undefined
let previousSysTickRaw: number | undefined
let previousSysTickExpanded: number | undefined

// 运动状态
let motionState: MotionState = 'idle'
let currentMotionSerial = 0
let scanDir = 1 // 1:正向, -1:反向
let emergencyStopFlag = false
let currentMaxPulse = 6500
let pauseTimer: NodeJS.Timeout | null = null
const END_PAUSE_MS = 200

const getConnectionLogDir = (device: string) =>
  join(app.getPath('userData'), 'logs', 'connections', device)

const calibrationBridge = createModbusCalibrationBridge({
  onResult: (result) => {
    emitCalibrationResult(result as ICalibrationResult)
  },
})

const getUpperRotationConnection = () => {
  if (!upperRotationConnection) {
    upperRotationConnection = createUpperRotationS7Connection({
      host: '192.168.2.10',
      loggerDirPath: getConnectionLogDir('airRing'),
    })
  }

  return upperRotationConnection
}

const emitCalibrationResult = (result: ICalibrationResult) => {
  mainWindow?.webContents.send('calibration-result', result)
}

const emitUpperRotationData = (data: IUpperRotationDebugData) => {
  mainWindow?.webContents.send('upperRotation-read', data)
}

const resetSysTickClock = () => {
  sysTickBaseWallTime = undefined
  sysTickBaseExpanded = undefined
  previousSysTickRaw = undefined
  previousSysTickExpanded = undefined
}

const resolvePushTimestamp = (push: PushData, receivedAt: number) => {
  const rawSysTick = push.sysTick

  if (!Number.isFinite(rawSysTick)) {
    return receivedAt
  }

  if (
    push.reset ||
    previousSysTickRaw === undefined ||
    previousSysTickExpanded === undefined ||
    sysTickBaseWallTime === undefined ||
    sysTickBaseExpanded === undefined
  ) {
    previousSysTickRaw = rawSysTick
    previousSysTickExpanded = rawSysTick
    sysTickBaseWallTime = receivedAt
    sysTickBaseExpanded = rawSysTick
    return receivedAt
  }

  let expandedSysTick = previousSysTickExpanded

  if (rawSysTick >= previousSysTickRaw) {
    expandedSysTick += rawSysTick - previousSysTickRaw
  } else {
    const backwardDelta = previousSysTickRaw - rawSysTick

    // 协议中的 PN/sysTick 是 1ms 的 7 位计数器，超过 127 后会回绕到 0。
    if (backwardDelta > 64) {
      expandedSysTick += 128 - backwardDelta
    } else {
      previousSysTickRaw = rawSysTick
      previousSysTickExpanded = rawSysTick
      sysTickBaseWallTime = receivedAt
      sysTickBaseExpanded = rawSysTick
      return receivedAt
    }
  }

  previousSysTickRaw = rawSysTick
  previousSysTickExpanded = expandedSysTick

  return sysTickBaseWallTime + (expandedSysTick - sysTickBaseExpanded)
}

async function startUpperRotationPolling() {
  if (upperRotationPollInterval) {
    return
  }

  try {
    await getUpperRotationConnection().connect()
  } catch (error) {
    console.error('上旋 S7 连接失败:', error)
    return
  }

  upperRotationPollInterval = setInterval(async () => {
    try {
      const upperRotationData = await getUpperRotationConnection().read()
      if (!upperRotationData) {
        return
      }

      pipeline?.receiveRotation(upperRotationData)
    } catch (error) {
      console.error('上旋 S7 读取失败:', error)
    }
  }, 400)
}

const handleThicknessPush = (push: PushData) => {
  if (typeof push.ad0 !== 'number' || typeof push.pos0 !== 'number') return

  const receivedAt = Date.now()
  const timestamp = resolvePushTimestamp(push, receivedAt)

  calibrationBridge.feedThicknessSample({
    timestamp,
    ProbeValue: push.ad0,
    HorizontalPulse: push.pos0,
  })
}

function stopUpperRotationPolling() {
  if (upperRotationPollInterval) {
    clearInterval(upperRotationPollInterval)
    upperRotationPollInterval = null
  }

  upperRotationConnection?.disconnect()
  upperRotationConnection = null
}

// ==================== 导出初始化函数 ====================
/**
 * 初始化运动控制模块
 * @param win Electron 主窗口实例
 */
export async function initMotionControl(win: BrowserWindow) {
  mainWindow = win

  // ---------- 配置存储 ----------
  store = new Store<AppConfig>({
    defaults: {
      maxPulse: 7000,
      margin: 300,
      rollerMode: 'circumference',
      rollerValue: '314',
      rollerNumCycles: '10',
      airAD: '2048',
      materialGain: '1.0',
      upperDeltaMin: '180',
      upperDeltaMax: '359',
      upperObjectiveMode: 'auto',
      airDuctCount: '48',
      systemAirDuct1Angle: '0',
    },
  })
  currentMaxPulse = store.get('maxPulse')

  // ---------- 数据管道 (RingBuffer + SQLite + 三路分离) ----------
  if (!mainWindow) throw new Error('Main window not set')
  sqliteDb = new SQLiteService()

  sqliteDb.init()

  pipeline = new DataPipeline(mainWindow, sqliteDb)
  pipeline.registerComputation({
    feedThicknessSample: (sample) =>
      calibrationBridge.feedThicknessSample(sample),
    feedUpperRotationData: (data) =>
      calibrationBridge.feedUpperRotationData(data),
    emitUpperRotationData: (data) => emitUpperRotationData(data),
  })
  pipeline.start()

  // pipeline内部的 batcher 用于渲染，替代原来的 dataBatcher
  dataBatcher = pipeline['batcher'] as unknown as DataBatcher<PushData>

  // ---------- AD盒初始化 ----------
  initADBox()
  void startUpperRotationPolling()

  // ---------- IPC 注册 ----------
  registerIpcHandlers()
  initCalibrationIpc({
    bridge: calibrationBridge,
    sqliteDb: sqliteDb!,
    sendToWindow: (channel, data) => {
      mainWindow?.webContents.send(channel, data)
    },
  })

  // ---------- 应用退出清理 ----------
  app.on('before-quit', () => {
    stopUpperRotationPolling()
    resetSysTickClock()
    pipeline?.stop()
    sqliteDb?.close()
    adb?.disconnect()
    dataBatcher?.destroy()
  })
}

// ==================== AD盒初始化 ====================
async function initADBox() {
  // 确保 mainWindow 在此处可用
  if (!mainWindow) throw new Error('Main window is not available')

  adb = new ADBoxClient({
    host: '192.168.251.12',
    port: 20021,
    pushTimeout: 1000,
    commandTimeout: 1000,
    maxRetries: 2,
  })

  adb.on('connected', () => {
    console.log('ADBox connected')
    mainWindow?.webContents.send('adbox-status', { connected: true })
  })

  adb.on('firstFrame', async () => {
    console.log('First frame received')
    resetSysTickClock()
    await adb?.syncPos0().catch(() => {})
  })

  adb.on('data', (push: PushData) => {
    handleThicknessPush(push)
    pipeline?.receiveThickness(push, Date.now())
  })

  adb.on('runResult', (result: RunResult) => {
    mainWindow?.webContents.send('adbox-run-result', result)
    console.log('result', result)
    handleRunResult(result)
  })

  adb.on('disconnected', () => {
    console.log('ADBox disconnected')
    mainWindow?.webContents.send('adbox-status', { connected: false })
    resetSysTickClock()
    stopScanInternal(false)
    motionState = 'idle'
    mainWindow?.webContents.send('motion-state', 'idle')
  })

  adb.on('error', (err) => console.error('ADBox error:', err))

  try {
    await adb.connect()
  } catch (err) {
    console.error('ADBox connection failed:', err)
  }
}

function handleRunResult(result: RunResult) {
  mainWindow?.webContents.send('adbox-run-result', result)

  if (result.serial !== currentMotionSerial) return

  // 根据协议，status = 0 (空闲/停止) 或 2 (停止) 都表示运动结束
  const isMotionFinished = result.status === 0 || result.status === 2

  if (isMotionFinished) {
    switch (motionState) {
      case 'scanning':
        onScanStepComplete()
        break
      case 'stopping':
        motionState = 'idle'
        mainWindow?.webContents.send('motion-state', 'idle')
        break
      default:
        motionState = 'idle'
        mainWindow?.webContents.send('motion-state', 'idle')
        break
    }
  }
}

// ==================== 运动指令封装 ====================
function generateSerial(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function sendMotionCommand(dir: 'forward' | 'backward', serial?: number) {
  if (emergencyStopFlag) throw new Error('急停状态')
  if (motionState === 'scanning') throw new Error('扫描中，请先停止扫描')
  const s = serial ?? generateSerial()
  currentMotionSerial = s
  motionState = dir
  mainWindow?.webContents.send('motion-state', motionState)

  if (dir === 'forward') {
    adb?.moveForward(s)
  } else {
    adb?.moveBackward(s)
  }
}

function sendMoveToCommand(pos: number, serial?: number, keepState = false) {
  if (emergencyStopFlag) throw new Error('急停状态')
  const s = serial ?? generateSerial()
  currentMotionSerial = s
  // 只有非扫描模式下才更新运动状态为 forward/backward
  if (!keepState) {
    const currentPos = adb?.getCachedPos0() || 0
    motionState = pos >= currentPos ? 'forward' : 'backward'
    mainWindow?.webContents.send('motion-state', motionState)
  }
  adb?.moveToPosition(pos, s)
}

function sendHomeCommand(serial?: number) {
  if (emergencyStopFlag) throw new Error('急停状态')
  if (motionState === 'scanning') throw new Error('扫描中，请先停止扫描')
  const s = serial ?? generateSerial()
  currentMotionSerial = s
  motionState = 'backward'
  mainWindow?.webContents.send('motion-state', motionState)

  adb?.home(s)
}

function stopMotion() {
  if (motionState === 'idle' || motionState === 'emergency') return
  motionState = 'stopping'
  currentMotionSerial = generateSerial()
  mainWindow?.webContents.send('motion-state', 'stopping')
  adb?.stopDecel()
}

function emergencyStop() {
  motionState = 'emergency'
  emergencyStopFlag = true
  adb?.stopEmergency()
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  mainWindow?.webContents.send('motion-state', 'emergency')
}

// ==================== 扫描控制 ====================
async function startScan() {
  if (!adb?.isConnected) throw new Error('设备未连接')
  if (emergencyStopFlag) throw new Error('急停状态，请先复位')
  if (motionState === 'scanning') return

  // 确保之前的运动完全停止
  await adb.stopDecel()
  await new Promise((r) => setTimeout(r, 100))

  motionState = 'scanning'
  emergencyStopFlag = false
  currentMaxPulse = store?.get('maxPulse') || currentMaxPulse
  scanDir = 1

  mainWindow?.webContents.send('motion-state', 'scanning')
  const target = currentMaxPulse
  // keepState = true，保持扫描状态不变
  sendMoveToCommand(target, undefined, true)
}

function onScanStepComplete() {
  console.log('motionState', motionState)

  if (motionState !== 'scanning') return

  if (pauseTimer) clearTimeout(pauseTimer)
  pauseTimer = setTimeout(() => {
    pauseTimer = null
    if (motionState !== 'scanning') return

    scanDir *= -1
    const target = scanDir === 1 ? currentMaxPulse : 0
    sendMoveToCommand(target, undefined, true) // 保持扫描状态
  }, END_PAUSE_MS)
}

function stopScanGracefully() {
  if (motionState !== 'scanning') return
  stopMotion()
}

function stopScanInternal(graceful: boolean) {
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  if (graceful) {
    stopScanGracefully()
  } else {
    motionState = 'idle'
    mainWindow?.webContents.send('motion-state', 'idle')
  }
}

// ==================== 配置管理 ====================
function setMaxPulse(value: number) {
  if (!store) return
  store.set('maxPulse', value)
  currentMaxPulse = value
  mainWindow?.webContents.send('config-updated', { maxPulse: value })
}

function getMaxPulse(): number {
  return store?.get('maxPulse') || currentMaxPulse
}

function setMargin(value: number) {
  if (!store) return
  store.set('margin', value)
}

function getMargin(): number {
  return store?.get('margin') || 300
}

function setScanRangeByWebWidth(webWidth: number) {
  const margin = getMargin()
  const newMax = webWidth + margin
  setMaxPulse(newMax)
  mainWindow?.webContents.send('scan-range-updated', {
    maxPulse: newMax,
    webWidth,
    margin,
  })
}

// ==================== IPC 注册 ====================
function registerIpcHandlers() {
  const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    // 连接管理
    'adbox-connect': async () => {
      if (!adb) await initADBox()
      return adb?.isConnected ?? false
    },
    'adbox-disconnect': async () => {
      adb?.disconnect()
    },

    // 运动控制
    'adbox-forward': async () => sendMotionCommand('forward'),
    'adbox-backward': async () => sendMotionCommand('backward'),
    'adbox-home': async () => sendHomeCommand(),
    'adbox-move-to': async (_event: unknown, pos: unknown) =>
      sendMoveToCommand(Number(pos)),
    'adbox-stop': async () => stopMotion(),
    'adbox-emergency-stop': async () => emergencyStop(),

    // 扫描
    'adbox-start-scan': async () => startScan(),
    'adbox-stop-scan': async () => stopScanGracefully(),

    // 状态查询
    'adbox-get-motion-state': async () => motionState,
    'adbox-get-connection-status': async () => adb?.isConnected ?? false,

    // 配置
    'config-get-max-pulse': async () => getMaxPulse(),
    'config-set-max-pulse': async (_event: unknown, value: unknown) =>
      setMaxPulse(Number(value)),
    'config-get-margin': async () => getMargin(),
    'config-set-margin': async (_event: unknown, value: unknown) =>
      setMargin(Number(value)),
    'config-set-scan-range': async (_event: unknown, webWidth: unknown) =>
      setScanRangeByWebWidth(Number(webWidth)),

    // 手动标定参数
    'calibration-get-manual-params': async () => ({
      tractionSpeed: store?.get('manualTractionSpeed'),
      distance: store?.get('manualDistance'),
      maxAngle: store?.get('manualMaxAngle'),
      mutationWindowSize: store?.get('manualMutationWindowSize'),
    }),
    'calibration-set-manual-params': async (
      _event: unknown,
      params: unknown
    ) => {
      const p = params as {
        tractionSpeed?: number
        distance?: number
        maxAngle?: number
        mutationWindowSize?: number
      }
      if (p.tractionSpeed !== undefined)
        store?.set('manualTractionSpeed', p.tractionSpeed)
      if (p.distance !== undefined) store?.set('manualDistance', p.distance)
      if (p.maxAngle !== undefined) store?.set('manualMaxAngle', p.maxAngle)
      if (p.mutationWindowSize !== undefined)
        store?.set('manualMutationWindowSize', p.mutationWindowSize)
      return { success: true }
    },

    // 设备常量
    'config-get-device-constants': async () => ({
      rollerMode: store?.get('rollerMode') ?? 'circumference',
      rollerValue: store?.get('rollerValue') ?? '314',
      rollerNumCycles: store?.get('rollerNumCycles') ?? '10',
      airAD: store?.get('airAD') ?? '2048',
      materialGain: store?.get('materialGain') ?? '1.0',
      upperDeltaMin: store?.get('upperDeltaMin') ?? '180',
      upperDeltaMax: store?.get('upperDeltaMax') ?? '359',
      upperObjectiveMode: store?.get('upperObjectiveMode') ?? 'auto',
      airDuctCount: store?.get('airDuctCount') ?? '48',
      systemAirDuct1Angle: store?.get('systemAirDuct1Angle') ?? '0',
    }),
    'config-set-device-constants': async (_event: unknown, params: unknown) => {
      const p = params as {
        rollerMode?: string
        rollerValue?: string
        rollerNumCycles?: string
        airAD?: string
        materialGain?: string
        upperDeltaMin?: string
        upperDeltaMax?: string
        upperObjectiveMode?: string
        airDuctCount?: string
        systemAirDuct1Angle?: string
      }
      if (p.rollerMode !== undefined) store?.set('rollerMode', p.rollerMode)
      if (p.rollerValue !== undefined) store?.set('rollerValue', p.rollerValue)
      if (p.rollerNumCycles !== undefined)
        store?.set('rollerNumCycles', p.rollerNumCycles)
      if (p.airAD !== undefined) store?.set('airAD', p.airAD)
      if (p.materialGain !== undefined)
        store?.set('materialGain', p.materialGain)
      if (p.upperDeltaMin !== undefined)
        store?.set('upperDeltaMin', p.upperDeltaMin)
      if (p.upperDeltaMax !== undefined)
        store?.set('upperDeltaMax', p.upperDeltaMax)
      if (p.upperObjectiveMode !== undefined)
        store?.set('upperObjectiveMode', p.upperObjectiveMode)
      if (p.airDuctCount !== undefined)
        store?.set('airDuctCount', p.airDuctCount)
      if (p.systemAirDuct1Angle !== undefined)
        store?.set('systemAirDuct1Angle', p.systemAirDuct1Angle)
      return { success: true }
    },

    // 标定结果
    'config-get-calibration-results': async () => ({
      rollerTractionSpeed: store?.get('rollerResultTractionSpeed'),
      frameLengthMM: store?.get('frameLengthMMResult'),
      frameLengthPulse: store?.get('frameLengthPulseResult'),
      mutationWindowSize: store?.get('mutationWindowSizeResult'),
      upperMaxAngle: store?.get('upperResultMaxAngle'),
      upperDistance: store?.get('upperResultDistance'),
    }),
    'config-set-calibration-results': async (
      _event: unknown,
      params: unknown
    ) => {
      const p = params as {
        rollerTractionSpeed?: number
        frameLengthMM?: number
        frameLengthPulse?: number
        mutationWindowSize?: number
        upperMaxAngle?: number
        upperDistance?: number
      }
      if (p.rollerTractionSpeed !== undefined)
        store?.set('rollerResultTractionSpeed', p.rollerTractionSpeed)
      if (p.frameLengthMM !== undefined)
        store?.set('frameLengthMMResult', p.frameLengthMM)
      if (p.frameLengthPulse !== undefined)
        store?.set('frameLengthPulseResult', p.frameLengthPulse)
      if (p.mutationWindowSize !== undefined)
        store?.set('mutationWindowSizeResult', p.mutationWindowSize)
      if (p.upperMaxAngle !== undefined)
        store?.set('upperResultMaxAngle', p.upperMaxAngle)
      if (p.upperDistance !== undefined)
        store?.set('upperResultDistance', p.upperDistance)
      return { success: true }
    },
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args)
      } catch (err) {
        console.error(`IPC ${channel} error:`, err)
        throw err instanceof Error ? err.message : String(err)
      }
    })
  }

  // ═══ SQLite 历史数据查询 ═══
  ipcMain.handle(
    'db-get-frames',
    async (_event, startMs: number, endMs: number, limit?: number) => {
      return sqliteDb?.queryFramesByTime(startMs, endMs, limit ?? 100) ?? []
    }
  )

  ipcMain.handle('db-get-latest-frame', async () => {
    return sqliteDb?.getLatestFrame() ?? null
  })

  ipcMain.handle(
    'db-get-thickness-raw',
    async (_event, startMs: number, endMs: number) => {
      return sqliteDb?.queryThicknessRaw(startMs, endMs) ?? []
    }
  )

  ipcMain.handle('db-get-pipeline-stats', async () => {
    return pipeline?.getStats() ?? null
  })

  ipcMain.handle('db-persist-frame', async (_event, frame: unknown) => {
    if (!pipeline || !frame) return
    pipeline.persistFrame(frame as any)
  })

  ipcMain.handle(
    'db-get-frames-by-id',
    async (_event, startId: number, endId: number) => {
      return sqliteDb?.queryFramesByIdRange(startId, endId) ?? []
    }
  )

  ipcMain.handle(
    'db-import-sweep',
    async (
      _event,
      sweep: {
        pulses: number[]
        adValues: number[]
        airAD: number
        gain: number
        source: string
      }
    ) => {
      if (!sqliteDb) return 0
      return sqliteDb.importSweep(
        sweep.pulses,
        sweep.adValues,
        sweep.airAD,
        sweep.gain,
        sweep.source
      )
    }
  )

  ipcMain.handle('db-get-latest-frames', async (_event, count: number) => {
    return sqliteDb?.queryLatestFrames(count) ?? []
  })
}
