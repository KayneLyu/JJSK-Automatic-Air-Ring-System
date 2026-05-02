import type { IpcChannelName, IpcChannelArgs, IpcChannelOutput } from './ipc';

// 扩展 Window
declare global {
  interface Window {
    ipcApi: {
      on<T extends IpcChannelName>(
        channel: T,
        callback: (_, ...args: IpcChannelOutput<T>) => void),
      send<T extends IpcChannelName>(
        channel: T,
        ...args: IpcChannelArgs<T>
      ): void,
      invoke<T extends IpcChannelName>(
        channel: T,
        ...args: IpcChannelArgs<T>
      ): Promise<IpcChannelOutput<T>>,
    };
  }
}

export { };