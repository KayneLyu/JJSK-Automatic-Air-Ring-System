import { BrowserWindow, ipcMain, app } from 'electron'
import { mkdirSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ADBoxClient } from '@jjsk/adbox-sdk'
import type { PushData, RunResult } from '@jjsk/adbox-sdk'
import type {
  ICalibrationBridgeState,
  ICalibrationControlData,
  ICalibrationControlResult,
  ICalibrationResult,
  IUpperRotationDebugData,
} from '@/types/ipc'
import { createUpperRotationS7Connection } from '@jjsk/air-ring-server/electron'
import Store from 'electron-store'
import { DataBatcher } from './data-batcher'
import { createModbusCalibrationBridge } from './calibrationBridge'

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
}

// ==================== 全局状态 (模块级私有) ====================
let mainWindow: BrowserWindow | null = null // 保存引用供内部使用
let dataBatcher: DataBatcher<PushData> | null = null
let adb: ADBoxClient | null = null
let store: Store<AppConfig> | null = null
let upperRotationConnection: ReturnType<
  typeof createUpperRotationS7Connection
> | null = null
let upperRotationPollInterval: NodeJS.Timeout | null = null
let thicknessLogWriteQueue = Promise.resolve()
let thicknessLogSeq = 0
let sysTickBaseWallTime: number | undefined
let sysTickBaseExpanded: number | undefined
let previousSysTickRaw: number | undefined
let previousSysTickExpanded: number | undefined
const pendingThicknessBatch: Array<{
  adValue: number
  pulse: number
  timestamp: number
  sysTick: number
}> = []

// 运动状态
let motionState: MotionState = 'idle'
let currentMotionSerial = 0
let scanDir = 1 // 1:正向, -1:反向
let emergencyStopFlag = false
let currentMaxPulse = 6500
let pauseTimer: NodeJS.Timeout | null = null
const END_PAUSE_MS = 200
const THICKNESS_LOG_BATCH_SIZE = 25

const calibrationBridge = createModbusCalibrationBridge({
  onResult: (result) => {
    emitCalibrationResult(result as ICalibrationResult)
  },
})

const getConnectionLogDir = (name: string) => {
  return join(app.getPath('userData'), 'logs', name)
}

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

const getRelativeUtcDayTimestamp = (timestampMs: number) => {
  const now = new Date(timestampMs)
  const dayStartMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  )

  return timestampMs - dayStartMs
}

const formatDateHour = (timestampMs: number) => {
  const date = new Date(timestampMs)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  return `${year}-${month}-${day}-${hour}`
}

const appendThicknessLogLine = (line: string, timestampMs: number) => {
  const dirPath = getConnectionLogDir('thickness')
  mkdirSync(dirPath, { recursive: true })
  const filePath = join(
    dirPath,
    `thickness-adbox-${formatDateHour(timestampMs)}.log`
  )

  thicknessLogWriteQueue = thicknessLogWriteQueue
    .then(() => appendFile(filePath, line, 'utf8'))
    .catch((error) => {
      console.error('ADBox 测厚日志写入失败:', error)
    })
}

const flushThicknessLogBatch = (force = false) => {
  while (
    pendingThicknessBatch.length >= THICKNESS_LOG_BATCH_SIZE ||
    (force && pendingThicknessBatch.length > 0)
  ) {
    const batch = pendingThicknessBatch.splice(
      0,
      force ? pendingThicknessBatch.length : THICKNESS_LOG_BATCH_SIZE
    )

    if (batch.length === 0) {
      return
    }

    thicknessLogSeq += 1

    const batchTimestamp = batch[batch.length - 1].timestamp
    const data = {
      adValues: batch.map((item) => item.adValue),
      pulses: batch.map((item) => item.pulse),
      timestamps: batch.map((item) =>
        getRelativeUtcDayTimestamp(item.timestamp)
      ),
    }

    const record = {
      level: 'info',
      message: {
        source: 'thickness/app-adbox',
        deviceType: 'thickness',
        deviceName: '测厚仪',
        protocol: 'adbox',
        event: 'read',
        data,
        meta: {
          pollSeq: thicknessLogSeq,
          adCount: data.adValues.length,
          pulseCount: data.pulses.length,
          timestampCount: data.timestamps.length,
          firstTimestamp: data.timestamps[0],
          lastTimestamp: data.timestamps[data.timestamps.length - 1],
          firstPulse: data.pulses[0],
          lastPulse: data.pulses[data.pulses.length - 1],
          firstSysTick: batch[0]?.sysTick,
          lastSysTick: batch[batch.length - 1]?.sysTick,
          sourceProtocol: 'adbox',
        },
      },
      timestamp: new Date(batchTimestamp).toISOString(),
    }

    appendThicknessLogLine(`${JSON.stringify(record)}\n`, batchTimestamp)
  }
}

const handleThicknessPush = (push: PushData) => {
  if (typeof push.ad0 !== 'number' || typeof push.pos0 !== 'number') {
    return
  }

  const receivedAt = Date.now()
  const timestamp = resolvePushTimestamp(push, receivedAt)

  calibrationBridge.feedThicknessSample({
    timestamp,
    ProbeValue: push.ad0,
    HorizontalPulse: push.pos0,
  })

  pendingThicknessBatch.push({
    adValue: push.ad0,
    pulse: push.pos0,
    timestamp,
    sysTick: push.sysTick,
  })
  flushThicknessLogBatch()
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

      calibrationBridge.feedUpperRotationData(upperRotationData)
      emitUpperRotationData(upperRotationData)
    } catch (error) {
      console.error('上旋 S7 读取失败:', error)
    }
  }, 400)
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
export function initMotionControl(win: BrowserWindow) {
  mainWindow = win

  // ---------- 配置存储 ----------
  store = new Store<AppConfig>({
    defaults: {
      maxPulse: 7000,
      margin: 300,
    },
  })
  currentMaxPulse = store.get('maxPulse')

  // ---------- 节流器 ----------
  // 确保 mainWindow 已赋值
  if (!mainWindow) throw new Error('Main window not set')
  dataBatcher = new DataBatcher<PushData>(mainWindow, 'adbox-data', {
    interval: 50,
  })

  // ---------- AD盒初始化 ----------
  initADBox()
  void startUpperRotationPolling()

  // ---------- IPC 注册 ----------
  registerIpcHandlers()

  // ---------- 应用退出清理 ----------
  app.on('before-quit', () => {
    flushThicknessLogBatch(true)
    stopUpperRotationPolling()
    resetSysTickClock()
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
    dataBatcher?.push(push)
  })

  adb.on('runResult', (result: RunResult) => {
    mainWindow?.webContents.send('adbox-run-result', result)
    console.log('result', result)
    handleRunResult(result)
  })

  adb.on('disconnected', () => {
    console.log('ADBox disconnected')
    mainWindow?.webContents.send('adbox-status', { connected: false })
    flushThicknessLogBatch(true)
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
    'calibration-set-manual-traction-speed': async (
      _event: unknown,
      data: unknown
    ): Promise<ICalibrationControlResult> => {
      const calibrationData = data as ICalibrationControlData
      const manualTractionSpeed = Number(calibrationData.manualTractionSpeed)

      if (!Number.isFinite(manualTractionSpeed) || manualTractionSpeed <= 0) {
        return {
          success: false,
          disturbanceTs: calibrationBridge.getDisturbanceTs() ?? Date.now(),
          error: '牵引速度必须是大于 0 的有效数字',
        }
      }

      const disturbanceTs = Date.now()
      calibrationBridge.setManualTractionSpeed(
        manualTractionSpeed,
        disturbanceTs
      )
      emitCalibrationResult({ tractionSpeed: manualTractionSpeed })

      return {
        success: true,
        manualTractionSpeed,
        disturbanceTs,
      }
    },
    'calibration-get-state': async (): Promise<ICalibrationBridgeState> => {
      return {
        manualTractionSpeed: calibrationBridge.getManualTractionSpeed(),
        disturbanceTs: calibrationBridge.getDisturbanceTs() ?? Date.now(),
        result: calibrationBridge.getResult(),
      }
    },
    'calibration-reset': async (): Promise<ICalibrationControlResult> => {
      const disturbanceTs = Date.now()
      const manualTractionSpeed = calibrationBridge.getManualTractionSpeed()

      calibrationBridge.reset(disturbanceTs)

      if (manualTractionSpeed !== undefined) {
        emitCalibrationResult({ tractionSpeed: manualTractionSpeed })
      }

      return {
        success: true,
        manualTractionSpeed,
        disturbanceTs,
      }
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
}
