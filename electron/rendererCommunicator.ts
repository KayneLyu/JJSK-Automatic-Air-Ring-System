import { BrowserWindow, app, ipcMain, dialog } from 'electron';
import fs from "fs";
import { ensureServerRunning } from './utils';
import { PLCConnector } from './PLC-S7';
import type { IpcChannelName, IpcChannelArgs, IpcChannelOutput, IPlcControlData } from '@/types/ipc';

export function useIpcOn<T extends IpcChannelName>(
  channel: T,
  callback: (...args: IpcChannelArgs<T>) => void
) {
  ipcMain.on(channel, (_, ...args) => {
    callback(...(args as IpcChannelArgs<T>));
  });
}

export function useIpcHandle<T extends IpcChannelName>(
  channel: T,
  callback: (...args: IpcChannelArgs<T>) => IpcChannelOutput<T>
) {
  ipcMain.handle(channel, (_, ...args) => {
    return callback(...(args as IpcChannelArgs<T>));
  });
}

export function useIpcSend<T extends IpcChannelName>(
  win: BrowserWindow,
  channel: T,
  ...args: IpcChannelArgs<T>
) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, ...args);
}

// 保存定时器 ID
let plcPollInterval: NodeJS.Timeout | null = null;

/**
 * 启动 PLC 轮询
 */
export function startPlcPolling(win: BrowserWindow) {
  // 如果已经在轮询，防止重复启动
  if (plcPollInterval) return;
  const plc = new PLCConnector();

  plc.defineItems({
    FWD: "DB4,X0.0",
    REV: "DB4,X0.1",
    STOP: "DB4,X0.2",
    HOME: "DB4,X0.3",
    MEASURE: "DB4,X0.4",
  });
  
  plc.connectIfNeeded()
    .then(() => {
      console.log('✅ PLC 连接成功，开始轮询');
      // 1秒轮询一次
      plcPollInterval = setInterval(async () => {
        try {
          const values = await plc.readAll();
          useIpcSend(win, 'plc-controlData', values as IPlcControlData);
        } catch (err) {
          console.error('PLC 读取失败:', err);
        }
      }, 1000);
    })
    .catch((err: any) => {
      dialog.showErrorBox('PLC 初始化失败', '连接 PLC 失败，请联系管理员');
    });
}

/**
 * 停止 PLC 轮询（窗口关闭/退出时调用）
 */
export function stopPlcPolling() {
  if (plcPollInterval) {
    clearInterval(plcPollInterval);
    plcPollInterval = null;
  }
}

/**
 * 进程通信交互
 */
export function setupRendererCommunicator(win: BrowserWindow) {
  // 最小化
  useIpcOn("win-minimize", () => {
    win.minimize();
  })

  // 最大化
  useIpcOn("win-maximize", () => {
    const windowIsMax = win.isMaximized();
    if (windowIsMax) {
      win.restore()
    } else {
      win.maximize();
    }
  })

  // 退出程序
  useIpcOn("win-close", () => {
    app.quit();
  })

  // 全屏
  useIpcOn("win-toggle-fullscreen", () => {
    if (win) {
      win.setFullScreen(!win.isFullScreen());
    }
  })

  // 获取logo
  useIpcHandle("win-get-logo", () => {
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
    } catch (error) { }
  })

  // plc写入
  useIpcOn("change-State", (message) => {
    try {
      const plc = new PLCConnector();
      plc.writeItems(message.address, message.value);
    } catch (error) {
      dialog.showErrorBox('PLC通信故障', '写入PLC数据失败');
    }
  })


  // 发送消息到渲染进程
  // useIpcSend('did-finish-load', () => {
  //   win.webContents.send('main-process-message', new Date().toLocaleString());
  // });

  // 添加其他通信逻辑
  // 例如，监听来自渲染进程的消息
  // win.webContents.on('message-from-renderer', (event, message) => {
  //   console.log('Message from renderer:', message);
  //   // 处理消息并可能回复
  //   event.sender.send('response-to-renderer', 'Message received');
  // });
}