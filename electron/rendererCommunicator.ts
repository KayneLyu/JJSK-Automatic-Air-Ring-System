// rendererCommunicator.ts
import { BrowserWindow } from 'electron';

export function setupRendererCommunicator(win: BrowserWindow) {
  // 发送消息到渲染进程
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main-process-message', new Date().toLocaleString());
  });

  // 添加其他通信逻辑
  // 例如，监听来自渲染进程的消息
//   win.webContents.on('message-from-renderer', (event, message) => {
//     console.log('Message from renderer:', message);
//     // 处理消息并可能回复
//     event.sender.send('response-to-renderer', 'Message received');
//   });
}