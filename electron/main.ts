import { app, BrowserWindow, dialog, globalShortcut } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupRendererCommunicator } from './rendererCommunicator';
import fs from "fs";

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    autoHideMenuBar: true,
    width: 1280,
    height: 1024,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: false, // 禁用安全策略
    },
  })

  // push message to Renderer-process.
  if (win) {
    setupRendererCommunicator(win)
  }

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

}
// 防止重复点击软件
const getLock = app.requestSingleInstanceLock()
if (!getLock) {
  app.quit()
} else {
  app.on('second-instance', (event) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

app.on('will-finish-launching', () => {
  // 判断文件夹是否存在
  if (!fs.existsSync('D:/JJSK_Data')) {
    fs.mkdirSync('D:/JJSK_Data')
  }
  // 指定数据库文件夹和文件名
  app.setPath('appData', 'D:/JJSK_Data')
})

app.on('before-quit', () => {
  win?.removeAllListeners('close')
  globalShortcut.unregisterAll()
  win?.close()
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

app.whenReady().then(createWindow)
