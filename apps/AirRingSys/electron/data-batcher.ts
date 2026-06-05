// data-batcher.ts
import { BrowserWindow } from 'electron';

export interface DataBatcherOptions {
  /** 帧数批量大小，与 interval 互斥 */
  batchSize?: number;
  /** 时间间隔（ms），发送最新一帧，与 batchSize 互斥 */
  interval?: number;
  /** 最大累积帧数（仅在 batchSize 模式有效，防止内存溢出） */
  maxQueueSize?: number;
}

export class DataBatcher<T> {
  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private window: BrowserWindow;
  private channel: string;
  private batchSize: number;
  private interval: number | undefined;
  private maxQueueSize: number;

  constructor(window: BrowserWindow, channel: string, options: DataBatcherOptions) {
    this.window = window;
    this.channel = channel;
    this.batchSize = options.batchSize ?? 10;
    this.interval = options.interval;
    this.maxQueueSize = options.maxQueueSize ?? 100;

    if (this.interval) {
      this.startInterval();
    }
  }

  /** 添加一帧数据 */
  push(frame: T): void {
    if (this.interval) {
      // 时间间隔模式：只保留最新一帧
      this.queue[0] = frame;
      return;
    }

    // 批量模式：累积帧
    this.queue.push(frame);
    if (this.queue.length >= this.batchSize) {
      this.flush();
    } else if (this.queue.length > this.maxQueueSize) {
      // 超出最大容量，丢弃最旧帧
      this.queue.splice(0, this.queue.length - this.batchSize);
      this.flush();
    }
  }

  /** 立即发送当前队列中的所有帧 */
  flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      if (!this.window.isDestroyed()) {
        // 间隔模式发送单帧，批量模式发送数组
        this.window.webContents.send(this.channel, this.interval ? batch[0] : batch);
      }
    } catch (err) {
      // 窗口可能已关闭
    }
  }

  /** 清理定时器 */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }

  private startInterval(): void {
    if (this.timer || !this.interval) return;
    this.timer = setInterval(() => {
      this.flush();
    }, this.interval);
  }
}