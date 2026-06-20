import { BrowserWindow } from 'electron'
import { RingBuffer, ThicknessRingItem, RotationRingItem } from './ringBuffer'
import { SQLiteService } from './sqliteService'
import type { PushData } from '@jjsk/adbox-sdk'
import type { IUpperRotationDebugData } from '@/types/ipc'
import { DataBatcher } from './data-batcher'

/**
 * 数据管道 — 硬件→RingBuffer→{渲染, 计算, 持久化} 三路分离
 *
 *                                ┌─► DataBatcher ─► Renderer (50ms, 最新帧)
 *   ADBox/S7 ─► RingBuffer ─────┼─► computation (calibrationBridge)
 *                                └─► SQLite (WAL, 500ms批量写入)
 */
export class DataPipeline {
  readonly thicknessRing: RingBuffer<ThicknessRingItem>
  readonly rotationRing: RingBuffer<RotationRingItem>

  private sqlite: SQLiteService
  private batcher: DataBatcher<PushData>
  private flushTimer: NodeJS.Timeout | null = null
  private readonly FLUSH_INTERVAL_MS = 500
  private cleanupTimer: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL_MS = 60_000 // 每分钟
  private readonly RETENTION_THICKNESS_MS = 2 * 3600_000  // 2小时

  // 计算回调
  private feedThicknessSample?: (sample: {
    timestamp: number
    ProbeValue: number
    HorizontalPulse: number
  }) => void
  private feedUpperRotationData?: (data: IUpperRotationDebugData) => void
  private emitUpperRotationData?: (data: IUpperRotationDebugData) => void

  constructor(window: BrowserWindow, sqlite: SQLiteService) {
    this.thicknessRing = new RingBuffer<ThicknessRingItem>(200_000)
    this.rotationRing = new RingBuffer<RotationRingItem>(10_000)
    this.sqlite = sqlite

    // 50ms 节流推送至渲染层
    this.batcher = new DataBatcher<PushData>(window, 'adbox-data', {
      interval: 50,
    })
  }

  /** 注册计算管线回调 */
  registerComputation(callbacks: {
    feedThicknessSample: (sample: {
      timestamp: number
      ProbeValue: number
      HorizontalPulse: number
    }) => void
    feedUpperRotationData: (data: IUpperRotationDebugData) => void
    emitUpperRotationData: (data: IUpperRotationDebugData) => void
  }): void {
    this.feedThicknessSample = callbacks.feedThicknessSample
    this.feedUpperRotationData = callbacks.feedUpperRotationData
    this.emitUpperRotationData = callbacks.emitUpperRotationData
  }

  /** 启动定时 flush + cleanup */
  start(): void {
    this.flushTimer = setInterval(() => {
      const counts = this.sqlite.flush()
      if (counts.thickness > 0 || counts.rotation > 0) {
        console.log(`[Pipeline] SQLite flush: T=${counts.thickness} R=${counts.rotation}`)
      }
    }, this.FLUSH_INTERVAL_MS)

    // this.cleanupTimer = setInterval(() => {
    //   const before = Date.now() - this.RETENTION_THICKNESS_MS
    //   const result = this.sqlite.cleanup(before)
    //   if (result.thickness > 0) {
    //     console.log(`[Pipeline] 清理过期数据: T=${result.thickness} R=${result.rotation} A=${result.airRing}`)
    //   }
    // }, this.CLEANUP_INTERVAL_MS)
  }

  stop(): void {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.sqlite.flush()
    this.batcher.destroy()
  }

  // ══ 数据接收 ══

  /** ADBox 测厚数据入口 */
  receiveThickness(push: PushData, timestamp: number): void {
    // 1. RingBuffer 写入
    this.thicknessRing.push({
      timestamp,
      pulse: push.pos0,
      ad: push.ad0,
      source: 'adbox',
    })

    // 2. 推送至渲染 (50ms 节流)
    this.batcher.push(push)

    // 3. 推送至计算管线
    this.feedThicknessSample?.({
      timestamp,
      ProbeValue: push.ad0,
      HorizontalPulse: push.pos0,
    })

    // 4. 持久化 (批量缓冲)
    this.sqlite.pushThickness(timestamp, push.pos0, push.ad0, 'adbox', 0, 1.0)
  }

  /** 上旋/风环数据入口 */
  receiveRotation(data: IUpperRotationDebugData): void {
    const ts = data.timestamp ?? Date.now()

    // 1. RingBuffer
    this.rotationRing.push({
      timestamp: ts,
      forwardRotation: data.ForwardRotation ?? false,
      reverseRotation: data.ReverseRotation ?? false,
      motorFrequency: data.MotorFrequency ?? 0,
      heats: data.Heats ?? [],
    })

    // 2. 推送至计算管线
    this.feedUpperRotationData?.(data)

    // 3. 推送至渲染
    this.emitUpperRotationData?.(data)

    // 4. 持久化
    this.sqlite.pushRotation(
      ts,
      data.ForwardRotation ? 1 : 0,
      data.ReverseRotation ? 1 : 0,
      data.MotorFrequency ?? 0,
      data.ForwardDirectionChange ? 1 : 0,
      data.ReverseDirectionChange ? 1 : 0,
      data.Reset ? 1 : 0,
      data.Heats ?? []
    )

    // 5. 风环通道数据
    if (data.Heats && data.Heats.length > 0) {
      this.sqlite.pushAirRing(ts, data.Heats, 0, 0, 0)
    }
  }

  /** 强制刷写 SQLite 缓冲区 */
  flush(): void {
    this.sqlite.flush()
  }

  /** 获取 RingBuffer 统计 */
  getStats(): {
    thicknessInRing: number
    rotationInRing: number
    thicknessTimeRange: { oldest: number | null; newest: number | null }
  } {
    return {
      thicknessInRing: this.thicknessRing.size,
      rotationInRing: this.rotationRing.size,
      thicknessTimeRange: this.thicknessRing.getTimeRange(),
    }
  }
}
