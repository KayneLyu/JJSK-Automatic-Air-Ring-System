import { BrowserWindow } from 'electron';

export interface BatcherOptions {
  /** 批量大小（帧数），与 interval 互斥 */
  batchSize?: number;
  /** 时间间隔(ms)，发送最新一帧并丢弃中间帧 */
  interval?: number;
  /** 最大累积帧数，防止内存无限增长（仅 batchSize 模式有效） */
  maxQueueSize?: number;
}

export class DataBatcher<T> {
  private queue: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private window: BrowserWindow;
  private channel: string;
  private options: Required<Pick<BatcherOptions, 'batchSize' | 'maxQueueSize'>> & { interval?: number };

  constructor(window: BrowserWindow, channel: string, options: BatcherOptions = {}) {
    this.window = window;
    this.channel = channel;
    this.options = {
      batchSize: options.batchSize || 10,
      maxQueueSize: options.maxQueueSize || 100,
      interval: options.interval,
    };
    if (this.options.interval) {
      this.startTimer();
    }
  }

  push(frame: T) {
    if (this.options.interval) {
      // 时间间隔模式：只保留最新一帧
      this.queue[0] = frame;
      return;
    }
    // 帧数模式
    this.queue.push(frame);
    if (this.queue.length >= this.options.batchSize) {
      this.flush();
    } else if (this.queue.length > this.options.maxQueueSize) {
      // 防止累积过多
      this.queue.splice(0, this.queue.length - this.options.batchSize);
      this.flush();
    }
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.options.interval);
  }

  private flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      this.window.webContents.send(this.channel, this.options.interval ? batch[0] : batch);
    } catch (err) {
      // 窗口可能已销毁
    }
  }

  destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}