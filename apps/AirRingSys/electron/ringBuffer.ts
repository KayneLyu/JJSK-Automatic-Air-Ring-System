/**
 * Ring Buffer — 内存环形缓冲区
 *
 * 固定大小循环队列，O(1) 写入/读取。
 * 用于硬件上报数据的快速缓冲，供渲染/计算/持久化三个路径消费。
 */
export class RingBuffer<T extends { timestamp: number }> {
  private buffer: (T | null)[]
  private head = 0
  private tail = 0
  private _size = 0
  private readonly capacity: number

  constructor(capacity: number = 100_000) {
    this.capacity = capacity
    this.buffer = new Array(capacity).fill(null)
  }

  get size(): number {
    return this._size
  }

  get isFull(): boolean {
    return this._size === this.capacity
  }

  /** O(1) 写入 */
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this._size < this.capacity) {
      this._size++
    } else {
      this.tail = (this.tail + 1) % this.capacity
    }
  }

  /** 批量写入 */
  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item)
    }
  }

  /** O(n) 获取所有数据（按时间升序） */
  getAll(): T[] {
    const result: T[] = new Array(this._size)
    for (let i = 0; i < this._size; i++) {
      result[i] = this.buffer[(this.tail + i) % this.capacity]!
    }
    return result
  }

  /** 按时间范围切片 (startMs ≤ timestamp < endMs) */
  slice(startMs: number, endMs: number): T[] {
    const result: T[] = []
    for (let i = 0; i < this._size; i++) {
      const item = this.buffer[(this.tail + i) % this.capacity]
      if (item && item.timestamp >= startMs && item.timestamp < endMs) {
        result.push(item)
      }
    }
    return result
  }

  /** 获取最后 N 条数据 */
  last(n: number): T[] {
    const count = Math.min(n, this._size)
    const result: T[] = new Array(count)
    const start = (this.tail + this._size - count) % this.capacity
    for (let i = 0; i < count; i++) {
      result[i] = this.buffer[(start + i) % this.capacity]!
    }
    return result
  }

  /** 清空 */
  clear(): void {
    this.buffer.fill(null)
    this.head = 0
    this.tail = 0
    this._size = 0
  }

  /** 获取最旧和最新的时间戳 */
  getTimeRange(): { oldest: number | null; newest: number | null } {
    if (this._size === 0) return { oldest: null, newest: null }
    const oldest = this.buffer[this.tail]
    const newest = this.buffer[(this.head - 1 + this.capacity) % this.capacity]
    return {
      oldest: oldest?.timestamp ?? null,
      newest: newest?.timestamp ?? null,
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 专用 Ring Buffer 类型
// ═══════════════════════════════════════════════════════════

export interface ThicknessRingItem {
  timestamp: number
  pulse: number
  ad: number
  source: 'adbox'
}

export interface RotationRingItem {
  timestamp: number
  forwardRotation: boolean
  reverseRotation: boolean
  motorFrequency: number
  heats: number[]
}

export interface AirRingRingItem {
  timestamp: number
  channelHeats: number[]
  isAuto: boolean
  sigma: number
  corrR: number
}

export interface RollerRingItem {
  timestamp: number
  speed: number
  position: number
  direction: boolean
}
