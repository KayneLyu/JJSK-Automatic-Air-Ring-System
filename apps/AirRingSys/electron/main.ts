import { app, BrowserWindow, globalShortcut } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  setupRendererCommunicator,
  stopPlcPolling,
} from './rendererCommunicator.ts'
import { setupConsoleFileLogger } from './consoleFileLogger.ts'

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
let restoreConsoleFileLogger: (() => void) | null = null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    autoHideMenuBar: true,
    width: 1280,
    height: 1024,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // 与渲染进程通信.
  if (win) {
    setupRendererCommunicator(win)
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}
// 防止重复点击软件
const getLock = app.requestSingleInstanceLock()
if (!getLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.on('ready', () => {
  // 开机自动启动应用
  app.setLoginItemSettings({
    openAtLogin: true,
  })
})

app.on('will-finish-launching', () => {
  if (process.platform !== 'win32') {
    return
  }

  if (!fs.existsSync('D:/JJSK_Data')) {
    fs.mkdirSync('D:/JJSK_Data')
  }

  app.setPath('appData', 'D:/JJSK_Data')
})

app.on('before-quit', () => {
  stopPlcPolling()
  win?.removeAllListeners('close')
  globalShortcut.unregisterAll()
  win?.close()
  restoreConsoleFileLogger?.()
  restoreConsoleFileLogger = null
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  const { dirPath, restore } = setupConsoleFileLogger(app)
  restoreConsoleFileLogger = restore
  console.log('主进程控制台日志已写入:', dirPath)
  createWindow()
})
