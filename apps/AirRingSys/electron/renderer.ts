import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import { join } from 'node:path'
import type {

  IpcChannelArgs,
  IpcChannelName,
  IpcChannelOutput,

} from '@/types/ipc'
import { ADBoxClient } from '../../../packages/adbox-sdk'


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

let adb: ADBoxClient;

/**
 * 初始化ADBOX
 */
export function initADBox(win: BrowserWindow) {
  adb = new ADBoxClient('192.168.251.12', 20021);

  adb.on('connected', async () => {
    console.log('AD Box 已连接');
    // 连接后同步一次编码器，确保 32 位扩展准确
    await adb.syncAllPos();
    // 通知渲染进程已连接
    win.webContents.send('adbox-connected');
  });

  adb.on('data', (push) => {
    // 将变化的数据直接转发给渲染进程
    useIpcSend(win, 'adbox:data', push)
  });

  adb.on('runResult', (result) => {
    useIpcSend(win, 'adbox:RunResult', result)
  });

  adb.on('error', (err) => {
    console.error('AD Box 错误:', err);
  });

  adb.connect();
}


/**
 * 与渲染进程通信
 * @param win 
 */
export function setupRendererCommunicator(win: BrowserWindow) {
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

  /**
   * 前进
   */
  useIpcOn('ADBOX:FORW', async () => {
    try {
      await adb.moveForward(1)
    } catch (error) {

    }
  })

  /**
   * 后退
   */
  useIpcOn('ADBOX:REV', async () => {
    try {
      await adb.moveBackward(1)
    } catch (error) {

    }
  })

  /**
  * 停止
  */
  useIpcOn('ADBOX:STOP', async () => {
    try {
      await adb.stopDecel()
    } catch (error) {

    }
  })


  /**
 * 归零
 */
  useIpcOn('ADBOX:HOME', async () => {
    try {
      await adb.home()
    } catch (error) {

    }
  })
  //   useIpcHandle('win-open-client', () => {
  //     try {
  //       return ensureServerRunning(
  //         'JinJiu.Scan.Client2',
  //         'D:/server/JinJiu.Scan.Client2.exe',
  //         dialog
  //       )
  //     } catch (error) {
  //       console.error('打开客户端失败:', error)
  //     }
  //   })
}
