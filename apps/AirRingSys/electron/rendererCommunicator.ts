import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import type {
  ICalibrationResult,
  ICalibrationControlData,
  ICalibrationControlResult,
  IpcChannelArgs,
  IpcChannelName,
  IpcChannelOutput,
  ICalibrationBridgeState,
  IPlcControlResult,
  IPlcParamData,
  IPlcWriteMessage,
  IUpperRotationDebugData,
} from '@/types/ipc'
import {
  createThicknessS7Connection,
  createUpperRotationS7Connection,
  createThicknessBatchModbusConnection,
} from '@jjsk/air-ring-server/electron'
import { ensureServerRunning } from './utils.ts'
import { createModbusCalibrationBridge } from './calibrationBridge.ts'

let plcPollInterval: NodeJS.Timeout | null = null
let modbusPollInterval: NodeJS.Timeout | null = null
let currentWindow: BrowserWindow | null = null
let thicknessS7ControlConnection: ReturnType<
  typeof createThicknessS7Connection
> | null = null
let thicknessConnection: ReturnType<
  typeof createThicknessBatchModbusConnection
> | null = null
let upperRotationConnection: ReturnType<
  typeof createUpperRotationS7Connection
> | null = null

const LOGO_PATH_CANDIDATES = ['D:/logo/logo.png']

const getLogoPathCandidates = () => {
  const candidates = [
    ...LOGO_PATH_CANDIDATES,
    process.env.VITE_PUBLIC
      ? join(process.env.VITE_PUBLIC, 'logo.png')
      : undefined,
    process.env.APP_ROOT
      ? join(process.env.APP_ROOT, 'public', 'logo.png')
      : undefined,
    process.env.APP_ROOT
      ? join(process.env.APP_ROOT, 'dist', 'logo.png')
      : undefined,
  ]

  return [
    ...new Set(candidates.filter((item): item is string => Boolean(item))),
  ]
}

const readLogoAsDataUrl = () => {
  for (const filePath of getLogoPathCandidates()) {
    if (!fs.existsSync(filePath)) {
      continue
    }

    try {
      const imageBuffer = fs.readFileSync(filePath)
      if (!imageBuffer.length) {
        continue
      }

      const base64Image = Buffer.from(imageBuffer).toString('base64')
      return `data:image/png;base64,${base64Image}`
    } catch (error) {
      console.error(`读取 logo 失败: ${filePath}`, error)
    }
  }

  return undefined
}

const getConnectionLogDir = (name: string) => {
  return join(app.getPath('userData'), 'logs', name)
}

const createThicknessS7ConnectionOptions = () => {
  return {
    host: '192.168.2.20',
    loggerDirPath: getConnectionLogDir('thickness'),
    logger: {
      source: 'thickness/s7',
    },
  }
}

const getThicknessConnection = () => {
  if (!thicknessConnection) {
    thicknessConnection = createThicknessBatchModbusConnection({
      url: 'tcp://192.168.2.20:502',
      unitId: 1,
      logger: {
        dirPath: getConnectionLogDir('thickness'),
        source: 'thickness/app-modbus',
        maxSize: '100m',
        maxFiles: '7d',
      },
    })
  }

  return thicknessConnection
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

const getThicknessS7Connection = () => {
  if (!thicknessS7ControlConnection) {
    thicknessS7ControlConnection = createThicknessS7Connection(
      createThicknessS7ConnectionOptions()
    )
  }

  return thicknessS7ControlConnection
}

const withThicknessS7Connection = async <T>(
  task: (
    connection: ReturnType<typeof createThicknessS7Connection>
  ) => Promise<T>
) => {
  return await task(getThicknessS7Connection())
}

const emitCalibrationResult = (result: ICalibrationResult) => {
  if (!currentWindow) {
    return
  }

  useIpcSend(currentWindow, 'calibration-result', result)
}

const emitUpperRotationData = (data: IUpperRotationDebugData) => {
  if (!currentWindow) {
    return
  }

  useIpcSend(currentWindow, 'upperRotation-read', data)
}

const calibrationBridge = createModbusCalibrationBridge({
  onResult: (result) => {
    console.log('标定算法已收到完整结果:', result)
    emitCalibrationResult(result)
  },
})

export function useIpcOn<T extends IpcChannelName>(
  channel: T,
  callback: (...args: IpcChannelArgs<T>) => void
) {
  ipcMain.on(channel, (_, ...args) => {
    callback(...(args as IpcChannelArgs<T>))
  })
}

export function useIpcHandle<T extends IpcChannelName>(
  channel: T,
  callback: (
    ...args: IpcChannelArgs<T>
  ) => IpcChannelOutput<T> | Promise<IpcChannelOutput<T>>
) {
  ipcMain.handle(channel, (_, ...args) => {
    return callback(...(args as IpcChannelArgs<T>))
  })
}

export function useIpcSend<T extends IpcChannelName>(
  win: BrowserWindow,
  channel: T,
  ...args: IpcChannelArgs<T>
) {
  if (win.isDestroyed()) {
    return
  }

  win.webContents.send(channel, ...args)
}

async function modbusRead(win: BrowserWindow) {
  if (modbusPollInterval) {
    return
  }

  const thicknessModbus = getThicknessConnection()
  await thicknessModbus.connect()

  modbusPollInterval = setInterval(async () => {
    try {
      const thicknessData = await thicknessModbus.read()
      calibrationBridge.feedModbusData(thicknessData)
      useIpcSend(win, 'ModBus-read', thicknessData)
    } catch (err) {
      console.error('厚度 Modbus 读取失败:', err)
    }

    try {
      const upperRotationData = await getUpperRotationConnection().read()
      if (upperRotationData) {
        calibrationBridge.feedUpperRotationData(upperRotationData)
        emitUpperRotationData(upperRotationData)
      }
    } catch (err) {
      console.error('上旋 S7 读取失败:', err)
    }
  }, 400)
}

function startPlcPolling(win: BrowserWindow) {
  if (plcPollInterval) {
    return
  }

  const plc = getThicknessS7Connection()

  plc
    .connect()
    .then(() => {
      console.log('✅ PLC 连接成功，开始轮询')
      plcPollInterval = setInterval(async () => {
        try {
          const values = await plc.readControlState()
          useIpcSend(win, 'plc-controlData', values as IPlcControlResult)
        } catch (err) {
          console.error('PLC 读取失败:', err)
        }
      }, 1000)
    })
    .catch((err) => {
      dialog.showErrorBox('PLC 初始化失败', '连接 PLC 失败，请联系管理员')
      console.error('PLC 初始化失败:', err)
    })
}

export function stopPlcPolling() {
  if (plcPollInterval) {
    clearInterval(plcPollInterval)
    plcPollInterval = null
  }

  if (modbusPollInterval) {
    clearInterval(modbusPollInterval)
    modbusPollInterval = null
  }

  thicknessS7ControlConnection?.disconnect()
  thicknessS7ControlConnection = null

  upperRotationConnection?.disconnect()
  upperRotationConnection = null

  void thicknessConnection?.disconnect()
  thicknessConnection = null
}

export function setupRendererCommunicator(win: BrowserWindow) {
  currentWindow = win
  startPlcPolling(win)
  void modbusRead(win)

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main-process-message', new Date().toLocaleString())

    const calibrationResult = calibrationBridge.getResult()
    if (calibrationResult) {
      useIpcSend(win, 'calibration-result', calibrationResult)
    }
  })

  useIpcOn('win-minimize', () => {
    win.minimize()
  })

  useIpcOn('win-maximize', () => {
    const windowIsMax = win.isMaximized()
    if (windowIsMax) {
      win.restore()
    } else {
      win.maximize()
    }
  })

  useIpcOn('win-close', () => {
    app.quit()
  })

  useIpcOn('win-toggle-fullscreen', () => {
    if (win) {
      win.setFullScreen(!win.isFullScreen())
    }
  })

  useIpcHandle('win-get-logo', () => {
    if (win) {
      return readLogoAsDataUrl()
    }
  })

  useIpcHandle('win-open-client', () => {
    try {
      return ensureServerRunning(
        'JinJiu.Scan.Client2',
        'D:/server/JinJiu.Scan.Client2.exe',
        dialog
      )
    } catch (error) {
      console.error('打开客户端失败:', error)
    }
  })

  useIpcHandle(
    'calibration-set-manual-traction-speed',
    async (
      data: ICalibrationControlData
    ): Promise<ICalibrationControlResult> => {
      const manualTractionSpeed = Number(data.manualTractionSpeed)

      if (!Number.isFinite(manualTractionSpeed) || manualTractionSpeed <= 0) {
        return {
          success: false,
          disturbanceTs: calibrationBridge.getDisturbanceTs(),
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
    }
  )

  useIpcHandle('calibration-get-state', (): ICalibrationBridgeState => {
    return {
      manualTractionSpeed: calibrationBridge.getManualTractionSpeed(),
      disturbanceTs: calibrationBridge.getDisturbanceTs(),
      result: calibrationBridge.getResult(),
    }
  })

  useIpcHandle('calibration-reset', (): ICalibrationControlResult => {
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
  })

  useIpcOn('change-State', (message) => {
    void withThicknessS7Connection(async (connection) => {
      await connection.writeValue(message.address, message.value)
    }).catch(() => {
      dialog.showErrorBox('PLC通信故障', '写入PLC数据失败')
    })
  })

  useIpcHandle('plc-writeValue', async (message: IPlcWriteMessage) => {
    try {
      await withThicknessS7Connection(async (connection) => {
        await connection.writeValue(message.address, message.value)
      })
      return {
        success: true,
        address: message.address,
        value: message.value,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'PLC 写入失败'

      console.error('PLC 写入失败:', error)

      return {
        success: false,
        address: message.address,
        value: message.value,
        error: errorMessage,
      }
    }
  })

  ipcMain.handle('plc-paramData', async (_, data: IPlcParamData) => {
    try {
      return await withThicknessS7Connection(async (connection) => {
        return await connection.readParams(data)
      })
    } catch (err) {
      console.error('PLC 读取失败:', err)
      throw new Error('PLC 读取或连接失败')
    }
  })
}
