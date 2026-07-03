/**
 * Ring Buffer — 内存环形缓冲区（工厂函数模式）
 *
 * 固定大小循环队列，O(1) 写入/读取。
 * 用于硬件上报数据的快速缓冲，供渲染/计算/持久化三个路径消费。
 */
export interface TimedData<T> {
  timestamp: number // ms
  value: T
}

export interface RingBufferAPI<T> {
  readonly size: number
  readonly isFull: boolean
  /** 写入单条数据 */
  push: (value: T, timestamp?: number) => void
  /** 批量写入 */
  pushMany: (items: T[], timestamp?: number) => void
  /** 以时间顺序返回所有数据 */
  toArray: () => TimedData<T>[]
  /** 按时间范围切片 (startMs ≤ timestamp < endMs) */
  slice: (startMs: number, endMs: number) => TimedData<T>[]
  /** 获取最近 N 条数据 */
  recent: (n: number) => TimedData<T>[]
  /** 按时间窗口获取最近数据 */
  window: (ms: number) => TimedData<T>[]
  /** 清空缓冲区 */
  clear: () => void
  /** 获取最旧和最新的时间戳 */
  getTimeRange: () => { oldest: number | null; newest: number | null }
}

export const RingBuffer = <T>(capacity: number): RingBufferAPI<T> => {
  const buffer: Array<TimedData<T> | null> = new Array(capacity).fill(null)
  let index = 0
  let _isFull = false

  const push = (value: T, timestamp: number = Date.now()): void => {
    buffer[index] = { value, timestamp }
    index = (index + 1) % capacity
    if (index === 0) _isFull = true
  }

  const pushMany = (items: T[], timestamp?: number): void => {
    for (const item of items) {
      push(item, timestamp)
    }
  }

  const toArray = (): TimedData<T>[] => {
    if (!_isFull) return buffer.slice(0, index) as TimedData<T>[]
    return [
      ...buffer.slice(index),
      ...buffer.slice(0, index),
    ] as TimedData<T>[]
  }

  const slice = (startMs: number, endMs: number): TimedData<T>[] => {
    return toArray().filter(
      (item) => item.timestamp >= startMs && item.timestamp < endMs
    )
  }

  const recent = (n: number): TimedData<T>[] => {
    return toArray().slice(-n)
  }

  const window = (ms: number): TimedData<T>[] => {
    const now = Date.now()
    return toArray().filter((item) => now - item.timestamp <= ms)
  }

  const clear = (): void => {
    buffer.fill(null)
    index = 0
    _isFull = false
  }

  const getTimeRange = (): { oldest: number | null; newest: number | null } => {
    const arr = toArray()
    if (arr.length === 0) return { oldest: null, newest: null }
    return {
      oldest: arr[0].timestamp,
      newest: arr[arr.length - 1].timestamp,
    }
  }

  return {
    get size() {
      return _isFull ? capacity : index
    },
    get isFull() {
      return _isFull
    },
    push,
    pushMany,
    toArray,
    slice,
    recent,
    window,
    clear,
    getTimeRange,
  }
}

// ═══════════════════════════════════════════════════════════
// 专用 Ring Buffer 数据类型
// ═══════════════════════════════════════════════════════════

/** 测厚 Ring Buffer 值（不含 timestamp，由 TimedData 包裹） */
export interface ThicknessRingValue {
  pulse: number
  ad: number
  source: 'adbox'
}

/** 上旋 Ring Buffer 值（不含 timestamp，由 TimedData 包裹） */
export interface RotationRingValue {
  forwardRotation: boolean
  reverseRotation: boolean
  motorFrequency: number
  heats: number[]
}

/** 风环 Ring Buffer 值（不含 timestamp，由 TimedData 包裹） */
export interface AirRingRingValue {
  channelHeats: number[]
  isAuto: boolean
  sigma: number
  corrR: number
}

/** 收卷辊 Ring Buffer 值（不含 timestamp，由 TimedData 包裹） */
export interface RollerRingValue {
  speed: number
  position: number
  direction: boolean
}
