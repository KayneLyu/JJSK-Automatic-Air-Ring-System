import { BrowserWindow, ipcMain, app } from 'electron'
import { join } from 'node:path'
import { ADBoxClient } from '@jjsk/adbox-sdk'
import type { PushData, RunResult } from '@jjsk/adbox-sdk'
import { createUpperRotationS7Connection } from '@jjsk/air-ring-server/electron'
import Store from 'electron-store'
import { UtilityHost, type RendererSendFn } from './utilityHost'

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
  mmPerPulseResult?: number
  membraneWidthMmResult?: number
  mutationWindowSizeResult?: number
  upperResultMaxAngle?: number
  upperResultDistance?: number
  scannerToleranceMsResult?: number
}

// ==================== 全局状态 (模块级私有) ====================
let mainWindow: BrowserWindow | null = null
let adb: ADBoxClient | null = null
let store: Store<AppConfig> | null = null
let utilityHost: UtilityHost | null = null
let upperRotationConnection: ReturnType<
  typeof createUpperRotationS7Connection
> | null = null
let upperRotationPollInterval: NodeJS.Timeout | null = null

// 运动状态
let motionState: MotionState = 'idle'
let currentMotionSerial = 0
let scanDir = 1 // 1:正向, -1:反向
let emergencyStopFlag = false
let currentMaxPulse = 0
let pauseTimer: NodeJS.Timeout | null = null
const END_PAUSE_MS = 200
let scannerMotionActive = false // 扫描仪运动控制接管换向，禁用 onScanStepComplete 自动换向

// 辊速状态
// 速度计算缓存（X10专用）
let x10LastRiseTime = 0;          // 上次上升沿时间 (ms)
let x10PulseCount = 0;            // 脉冲计数（用于累计长度）
const x10SpeedBuffer: number[] = []; // 滑动滤波（存最近5次速度）

// 物理参数（根据现场标定，请务必核对！）
const X10_PULSE_PER_REVOLUTION = 1;   // 接近开关每转触发次数 (单齿为1)
const ROLLER_DIAMETER_MM = 10;     // 测速辊直径 (mm)

const ERR_SCAN_ACTIVE_STOP_FIRST =
  'E_SCAN_ACTIVE_STOP_FIRST: scanning in progress, stop scan before home/move'
const ERR_EMERGENCY_ACTIVE =
  'E_EMERGENCY_ACTIVE: emergency stop is active'

/**
 * 计算辊速 (米/分钟)
 */
function calcSpeedFromX10(deltaTimeMs: number): number {
  if (deltaTimeMs <= 0) return 0;
  const pulsesPerSec = 1000 / deltaTimeMs;                         // 每秒脉冲数
  const speedMmPerSec = (pulsesPerSec / X10_PULSE_PER_REVOLUTION) * (ROLLER_DIAMETER_MM * Math.PI);
  return (speedMmPerSec * 60) / 1000;                             // 转 m/min
}

const getConnectionLogDir = (device: string) =>
  join(app.getPath('userData'), 'logs', 'connections', device)

const getUpperRotationConnection = () => {
  if (!upperRotationConnection) {
    upperRotationConnection = createUpperRotationS7Connection({
      host: '192.168.2.10',
      loggerDirPath: getConnectionLogDir('airRing'),
    })
  }

  return upperRotationConnection
}

const rendererSend: RendererSendFn = (channel, data) => {
  mainWindow?.webContents.send(channel, data)
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

      utilityHost?.pushRotation(upperRotationData)
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
 *
 * 架构：主进程仅保留设备 I/O（ADBox TCP、S7 TCP）与运动控制指令，
 * 全部 CPU 密集型/IO 阻塞型业务逻辑（DataPipeline、SQLite、标定）运行在 utilityProcess 中。
 *
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

  // ---------- utilityProcess: 承载全部业务逻辑 ----------
  utilityHost = new UtilityHost({
    onRendererSend: rendererSend,
    onCalibrationResult: (result) => {
      rendererSend('calibration-result', result)
    },
    onScannerAction: (action, state, log, debug, targetPulse, boundarySide) => {
      handleScannerAction(action, state, log, debug, targetPulse, boundarySide)
    },
    onError: (message) => {
      console.error('[MotionControl] utility 错误:', message)
    },
  })

  // 提前注册 IPC 处理器，前端加载后可立即调用（返回"未就绪"直到 utility 初始化完成）
  registerIpcHandlers()
  registerProxiedIpcHandlers()

  const dbDir = join(app.getPath('userData'), 'db')
  const storedAirAD = store.get('airAD')
  const airAD = Number(storedAirAD)
  await utilityHost.init({
    dbDir,
    maxPulse: currentMaxPulse,
    margin: store.get('margin'),
    config: {}, // 配置由主进程管理，utility 无需
    airAD: Number.isFinite(airAD) && airAD > 0 ? airAD : undefined,
    scannerToleranceMs: store.get('scannerToleranceMsResult'),
  })

  // AD盒初始化（utilityProcess 已就绪，可以接收数据）
  initADBox()
  void startUpperRotationPolling()

  // ---------- 应用退出清理 ----------
  app.on('before-quit', () => {
    stopUpperRotationPolling()
    utilityHost?.destroy()
    ADBoxClient.destroyInstance()
  })
}



// ==================== AD盒初始化 ====================
async function initADBox() {
  // 确保 mainWindow 在此处可用
  if (!mainWindow) throw new Error('Main window is not available')

  adb = ADBoxClient.getInstance({
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
    await adb?.syncPos0().catch(() => { })
  })

  adb.on('data', (push: PushData) => {
    // 将原始数据直接推送到 utilityProcess 处理
    // utility 内部负责：时间戳解析、RingBuffer、SQLite、标定、渲染批推
    utilityHost?.pushThickness(push, Date.now())

    // 辊速计算
    // 处理输入变化（X0~X15）
    // 注意：push.inChange 只有在输入状态变化时才有值
    if (push.in !== undefined && push.inChange !== undefined) {
      // 检测 X10 (bit 10 = 0x0400) 是否发生了变化
      if ((push.inChange & 0x0400) !== 0) {
        // X10 发生了翻转！判断它是上升沿还是下降沿
        const isX10High = (push.in & 0x0400) !== 0; // true=高电平(开关断开), false=低电平(导通)

        // 上升沿 isX10High
        if (!isX10High) {
          // 下降沿触发！
          const now = Date.now();
          x10PulseCount++;

          if (x10LastRiseTime > 0) {
            const deltaMs = now - x10LastRiseTime;

            // 过滤无效间隔（防止抖动，比如间隔 < 50ms 认为是干扰）
            if (deltaMs > 50) {
              const speed = calcSpeedFromX10(deltaMs);

              // 滑动平均滤波
              x10SpeedBuffer.push(speed);
              if (x10SpeedBuffer.length > 5) x10SpeedBuffer.shift();
              const avgSpeed = x10SpeedBuffer.reduce((a, b) => a + b, 0) / x10SpeedBuffer.length;

              // 推送给 UI
              // mainWindow?.webContents.send('production-speed', {
              //   speed: Math.round(avgSpeed * 100) / 100,
              //   pulseCount: x10PulseCount,
              //   deltaMs: deltaMs,
              //   source: 'X10',
              // });
              console.log('product-speed', avgSpeed);
              
            }
          }
          x10LastRiseTime = now;
        }
      }
    }
  })

  adb.on('runResult', (result: RunResult) => {
    mainWindow?.webContents.send('adbox-run-result', result)
    console.log('result', result)
    handleRunResult(result)
  })

  adb.on('disconnected', () => {
    console.log('ADBox disconnected')
    mainWindow?.webContents.send('adbox-status', { connected: false })
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
  if (emergencyStopFlag) throw new Error(ERR_EMERGENCY_ACTIVE)
  if (motionState === 'scanning') throw new Error(ERR_SCAN_ACTIVE_STOP_FIRST)
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
  if (emergencyStopFlag) throw new Error(ERR_EMERGENCY_ACTIVE)
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
  if (emergencyStopFlag) throw new Error(ERR_EMERGENCY_ACTIVE)
  if (motionState === 'scanning') throw new Error(ERR_SCAN_ACTIVE_STOP_FIRST)
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
  scannerMotionActive = false
  adb?.stopEmergency()
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
  // 停止扫描仪运动控制
  utilityHost?.disableScannerMotion()
  mainWindow?.webContents.send('motion-state', 'emergency')
}

// ==================== 扫描仪运动控制回调 ====================
/**
 * 处理来自 utilityProcess 的扫描仪控制动作
 * 映射 scannerMotionControl 的 ControlAction 到 ADBox 命令
 *
 * 竞态保护：每次发送新命令前先清除 onScanStepComplete 的自动换向定时器，
 * 防止 scannerMotionControl 的换向指令与 ADBox 自身的扫描完成回调冲突。
 */
function handleScannerAction(
  action: string,
  state: string,
  log: string | null,
  debug?: { pulse?: number; probeValue?: number; inMembrane?: boolean; direction?: 'FWD' | 'REV' },
  targetPulse?: number,
  boundarySide?: 'left' | 'right' | null,
): void {
  if (log) {
    const debugSuffix = debug
      ? ` pulse=${debug.pulse ?? '-'} ad=${debug.probeValue ?? '-'} inMembrane=${debug.inMembrane ?? '-'} dir=${debug.direction ?? '-'}`
      : ''
    const tpSuffix = targetPulse !== undefined ? ` targetPulse=${targetPulse}` : ''
    console.log(`[ScannerMotion] ${log}${debugSuffix}${tpSuffix}`)
  }

  // 向渲染进程转发状态（含 debug 信息）
  mainWindow?.webContents.send('scanner-motion-state', { action, state, log, debug, targetPulse })

  if (emergencyStopFlag) return

  switch (action) {
    case 'STOP':
      if (motionState === 'scanning') {
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null }
        currentMotionSerial = generateSerial()
        adb?.stopDecel()
      }
      break

    case 'REV':
    case 'FWD':
      // 保留兼容旧逻辑（无 targetPulse 时的兜底）
      if (motionState === 'scanning' && targetPulse === undefined) {
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null }
        scanDir = action === 'FWD' ? 1 : -1
        const target = scanDir === 1 ? currentMaxPulse : 0
        sendMoveToCommand(target, undefined, true)
      }
      break

    case 'MOVE_TO':
      if (motionState === 'scanning' && targetPulse !== undefined) {
        scannerMotionActive = true
        if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null }
        adb?.stopDecel()
        setTimeout(() => {
          if (motionState !== 'scanning') return
          sendMoveToCommand(targetPulse, undefined, true)
        }, 100)
      }
      break

    case 'ALERT':
      console.warn(`[ScannerMotion] 告警: state=${state}`)
      mainWindow?.webContents.send('scanner-motion-alert', { action, state, log })
      break

    default:
      break
  }
}

// ==================== 扫描控制 ====================
async function startScan() {
  if (!adb?.isConnected) throw new Error('设备未连接')
  if (emergencyStopFlag) throw new Error('急停状态，请先复位')
  if (motionState === 'scanning') return

  // 确保之前的运动完全停止
  await adb.stopDecel()
  await new Promise((r) => setTimeout(r, 300))

  const maxPulse = store?.get('maxPulse')
  if (maxPulse === undefined || maxPulse <= 0) {
    throw new Error('未设置 MaxPulse 扫描范围，请先在设置中配置')
  }
  currentMaxPulse = maxPulse

  motionState = 'scanning'
  emergencyStopFlag = false
  scanDir = 1

  // 开启扫描仪运动控制（从 store 读取最新配置，每次扫描时刷新参数）
  const scanAirAD = store?.get('airAD')
  const parsedAirAD = Number(scanAirAD)
  utilityHost?.enableScannerMotion(
    Number.isFinite(parsedAirAD) && parsedAirAD > 0 ? parsedAirAD : undefined,
    store?.get('scannerToleranceMsResult'),
  )

  mainWindow?.webContents.send('motion-state', 'scanning')
  const target = currentMaxPulse
  // keepState = true，保持扫描状态不变
  sendMoveToCommand(target, undefined, true)
}

function onScanStepComplete() {
  console.log('motionState', motionState)

  if (motionState !== 'scanning') return

  // 扫描仪运动控制接管时，不自动换向
  if (scannerMotionActive) return
  if (currentMaxPulse <= 0) return

  if (pauseTimer) clearTimeout(pauseTimer)
  pauseTimer = setTimeout(() => {
    pauseTimer = null
    if (motionState !== 'scanning') return
    if (currentMaxPulse <= 0) return

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
  scannerMotionActive = false
  // 停止扫描仪运动控制
  utilityHost?.disableScannerMotion()
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
      ADBoxClient.destroyInstance()
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

    // 手动标定参数（主进程管理 store）
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
      mmPerPulse: store?.get('mmPerPulseResult'),
      membraneWidthMm: store?.get('membraneWidthMmResult'),
      mutationWindowSize: store?.get('mutationWindowSizeResult'),
      upperMaxAngle: store?.get('upperResultMaxAngle'),
      upperDistance: store?.get('upperResultDistance'),
      scannerToleranceMs: store?.get('scannerToleranceMsResult'),
    }),
    'config-set-calibration-results': async (
      _event: unknown,
      params: unknown
    ) => {
      const p = params as {
        rollerTractionSpeed?: number
        frameLengthMM?: number
        frameLengthPulse?: number
        mmPerPulse?: number
        membraneWidthMm?: number
        mutationWindowSize?: number
        upperMaxAngle?: number
        upperDistance?: number
        scannerToleranceMs?: number
      }
      if (p.rollerTractionSpeed !== undefined)
        store?.set('rollerResultTractionSpeed', p.rollerTractionSpeed)
      if (p.frameLengthMM !== undefined)
        store?.set('frameLengthMMResult', p.frameLengthMM)
      if (p.frameLengthPulse !== undefined)
        store?.set('frameLengthPulseResult', p.frameLengthPulse)
      if (p.mmPerPulse !== undefined)
        store?.set('mmPerPulseResult', p.mmPerPulse)
      if (p.membraneWidthMm !== undefined)
        store?.set('membraneWidthMmResult', p.membraneWidthMm)
      if (p.mutationWindowSize !== undefined)
        store?.set('mutationWindowSizeResult', p.mutationWindowSize)
      if (p.upperMaxAngle !== undefined)
        store?.set('upperResultMaxAngle', p.upperMaxAngle)
      if (p.upperDistance !== undefined)
        store?.set('upperResultDistance', p.upperDistance)
      if (p.scannerToleranceMs !== undefined)
        store?.set('scannerToleranceMsResult', p.scannerToleranceMs)
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
}

/**
 * 注册代理 IPC 处理器
 *
 * 将标定计算、SQLite 查询、膜泡重建等 CPU/IO 密集型请求
 * 透明代理到 utilityProcess，主线程事件循环不被阻塞。
 */
function registerProxiedIpcHandlers(): void {
  // 需要代理到 utilityProcess 的 IPC 通道列表
  const PROXIED_CHANNELS = [
    // 标定控制
    'calibration-set-manual-traction-speed',
    'calibration-get-state',
    'calibration-reset',
    'calibration-feed-historical',

    // 标定单参数计算
    'calibration-run-traction-speed',
    'calibration-auto-traction-speed',
    'calibration-run-mutation-window',
    'calibration-run-distance',
    'calibration-run-membrane-width',

    // SQLite 历史数据查询
    'db-get-thickness-raw',
    'db-get-latest-thickness-raw',
    'db-get-sweep-summaries',
    'db-get-latest-rotation-trips',
    'db-get-latest-rotation-trips-fallback',
    'db-get-sweep-points-by-range',
    'db-get-sweep-count-by-mode',
    'db-get-sweep-ids-by-mode',
    'db-get-sweep-by-index',
    'db-get-frames',
    'db-get-latest-frame',
    'db-get-latest-frames',
    'db-get-frames-by-id',
    'db-get-pipeline-stats',
    'db-import-sweep',

    // 膜泡原始厚度重建
    'bubble-reconstruct',
    'bubble-reconstruct-window',
    'bubble-get-sweeps',
    'bubble-get-latest-sweeps',
    'bubble-get-current-sweep',
  ]

  /** 轮询等待 utilityProcess 就绪，最长 2 分钟 */
  const waitForReady = async (): Promise<void> => {
    const deadline = Date.now() + 120_000
    while (!utilityHost?.isReady) {
      if (Date.now() > deadline) {
        throw new Error('数据处理服务初始化超时')
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  for (const channel of PROXIED_CHANNELS) {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      await waitForReady()
      return utilityHost!.ipcRequest(channel, ...args)
    })
  }
}
