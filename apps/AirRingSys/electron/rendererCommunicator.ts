import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import type {
  IpcChannelArgs,
  IpcChannelName,
  IpcChannelOutput,
  IPlcControlResult,
  IPlcParamData,
} from '@/types/ipc'
import ModbusTCPService from './modbus/modbus.ts'
import { readAllData } from './modbus/reader.ts'
import { PLCConnector } from './nodeS7/PLC-S7.ts'
import { ensureServerRunning } from './utils.ts'

let plcPollInterval: NodeJS.Timeout | null = null
let modbusPollInterval: NodeJS.Timeout | null = null

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

  const modbus = ModbusTCPService.getInstance()
  await modbus.connect('192.168.2.20', 502, 1)

  modbusPollInterval = setInterval(async () => {
    try {
      const data = await readAllData()
      useIpcSend(win, 'ModBus-read', data)
    } catch (err) {
      console.error('Modbus 读取失败:', err)
    }
  }, 400)
}

function startPlcPolling(win: BrowserWindow) {
  if (plcPollInterval) {
    return
  }

  const plc = new PLCConnector()

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
}

export function setupRendererCommunicator(win: BrowserWindow) {
  startPlcPolling(win)
  void modbusRead(win)

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main-process-message', new Date().toLocaleString())
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

  useIpcOn('change-State', (message) => {
    try {
      const plc = new PLCConnector()
      void plc.writeItems(message.address, message.value)
    } catch {
      dialog.showErrorBox('PLC通信故障', '写入PLC数据失败')
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
