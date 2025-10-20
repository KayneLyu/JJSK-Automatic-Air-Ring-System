// rendererCommunicator.ts
import { BrowserWindow, app, ipcMain, IpcMainInvokeEvent, dialog } from 'electron';
import fs from "fs";
import { ensureServerRunning } from './utils.ts';

export function setupRendererCommunicator(win: BrowserWindow) {
  // 发送消息到渲染进程
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main-process-message', new Date().toLocaleString());
  });

  // 最小化
  ipcMain.on("win-minimize", () => {
    win.minimize();
  })

  // 最大化
  ipcMain.on("win-maximize", () => {
    const windowIsMax = win.isMaximized();
    if (windowIsMax) {
      win.restore()
    } else {
      win.maximize();
    }
  })

  // 退出程序
  ipcMain.on("win-close", () => {
    app.quit();
  })

  // 全屏
  ipcMain.on("win-toggle-fullscreen", () => {
    if (win) {
      win.setFullScreen(!win.isFullScreen());
    }
  })

  // 获取logo
  ipcMain.handle("win-get-logo", (e: IpcMainInvokeEvent, message: string, params: any) => {
    if (win) {
      try {
        const imageBuffer = fs.readFileSync("D:/logo/logo.png");
        if (!imageBuffer) return
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        const imgSrc = `data:image/png;base64,${base64Image}`; // 假设图片格式是png
        return imgSrc
      } catch (error) {
      }
    }
  })

  // 打开服务的界面软件
  ipcMain.handle("win-open-client", () => {
    try {
      const result = ensureServerRunning('JinJiu.Scan.Client2', 'D:/server/JinJiu.Scan.Client2.exe', dialog);
      return result
    } catch (error) {}
  })

  // 添加其他通信逻辑
  // 例如，监听来自渲染进程的消息
  // win.webContents.on('message-from-renderer', (event, message) => {
  //   console.log('Message from renderer:', message);
  //   // 处理消息并可能回复
  //   event.sender.send('response-to-renderer', 'Message received');
  // });
}