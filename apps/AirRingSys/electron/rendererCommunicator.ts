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
import ModbusTCPService from './modbus/modbus.ts'
import { readAllData } from './modbus/reader.ts'
import { PLCConnector } from './nodeS7/PLC-S7.ts'
import {
  disconnectUpperRotationReader,
  readUpperRotationData,
} from './nodeS7/upperRotationReader.ts'
import { ensureServerRunning } from './utils.ts'
import { createModbusCalibrationBridge } from './calibrationBridge.ts'
import { createConnectionLogger } from '../../../packages/AirRingServer/connections/base/connectionLogger.ts'

let plcPollInterval: NodeJS.Timeout | null = null
let modbusPollInterval: NodeJS.Timeout | null = null
let currentWindow: BrowserWindow | null = null
let thicknessLogSequence = 0
let thicknessDataLogger: ReturnType<typeof createConnectionLogger> | null = null

const getThicknessDataLogger = () => {
  if (!thicknessDataLogger) {
    thicknessDataLogger = createConnectionLogger({
      dirPath: join(app.getPath('userData'), 'logs', 'thickness'),
      source: 'thickness/app-modbus',
      maxSize: '100m',
      maxFiles: '7d',
    })
  }

  return thicknessDataLogger
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

  const thicknessModbus = ModbusTCPService.getInstance('thickness')
  const logger = getThicknessDataLogger()
  await thicknessModbus.connect('192.168.2.20', 502, 1)

  modbusPollInterval = setInterval(async () => {
    try {
      const startedAt = Date.now()
      const thicknessData = await readAllData()
      const durationMs = Date.now() - startedAt
      thicknessLogSequence += 1

      const lengthMismatch =
        thicknessData.adValues.length !== thicknessData.pulses.length ||
        thicknessData.adValues.length !== thicknessData.timestamps.length

      logger.log({
        protocol: 'modbus',
        event: 'read',
        data: thicknessData,
        meta: {
          ip: '192.168.2.20',
          pollSeq: thicknessLogSequence,
          readLatencyMs: durationMs,
          adCount: thicknessData.adValues.length,
          pulseCount: thicknessData.pulses.length,
          timestampCount: thicknessData.timestamps.length,
          firstTimestamp: thicknessData.timestamps[0],
          lastTimestamp:
            thicknessData.timestamps[thicknessData.timestamps.length - 1],
          firstPulse: thicknessData.pulses[0],
          lastPulse: thicknessData.pulses[thicknessData.pulses.length - 1],
          lengthMismatch,
        },
      })

      calibrationBridge.feedModbusData(thicknessData)
      useIpcSend(win, 'ModBus-read', thicknessData)
    } catch (err) {
      console.error('厚度 Modbus 读取失败:', err)
      logger.log({
        protocol: 'modbus',
        event: 'subscribe_error',
        error: err,
        meta: {
          ip: '192.168.2.20',
          pollSeq: thicknessLogSequence + 1,
        },
      })
    }

    try {
      const upperRotationData = await readUpperRotationData()
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

  const plc = PLCConnector.getInstance()

  plc.defineItems({
    FWD: 'DB4,X0.0',
    REV: 'DB4,X0.1',
    STOP: 'DB4,X0.2',
    HOME: 'DB4,X0.3',
    MEASURE: 'DB4,X0.4',
  })

  plc
    .connectIfNeeded()
    .then(() => {
      console.log('✅ PLC 连接成功，开始轮询')
      plcPollInterval = setInterval(async () => {
        try {
          const values = await plc.readAll()
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

  disconnectUpperRotationReader()
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
      try {
        const imageBuffer = fs.readFileSync('D:/logo/logo.png')
        if (!imageBuffer) return
        const base64Image = Buffer.from(imageBuffer).toString('base64')
        return `data:image/png;base64,${base64Image}`
      } catch (error) {
        console.error('读取 logo 失败:', error)
      }
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
    try {
      const plc = new PLCConnector()
      void plc.writeItems(message.address, message.value)
    } catch {
      dialog.showErrorBox('PLC通信故障', '写入PLC数据失败')
    }
  })

  useIpcHandle('plc-writeValue', async (message: IPlcWriteMessage) => {
    try {
      const plc = new PLCConnector()
      await plc.writeItems(message.address, message.value)
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
    const plc = new PLCConnector()
    plc.defineItems(data)

    try {
      await plc.connectIfNeeded()
      return await plc.readAll()
    } catch (err) {
      console.error('PLC 读取失败:', err)
      throw new Error('PLC 读取或连接失败')
    }
  })
}
