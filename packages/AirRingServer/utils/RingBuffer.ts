export interface TimedData<T> {
  timestamp: number // ms
  value: T
}

export const RingBuffer = <T>(capacity: number) => {
  const state: {
    buffer: Array<TimedData<T> | null>
    capacity: number
    index: number
    isFull: boolean
  } = {
    index: 0,
    isFull: false,
    capacity,
    buffer: new Array(capacity).fill(null),
  }
  /** 写入新数据（覆盖旧数据） */
  const push = (value: T, timestamp: number = Date.now()) => {
    state.buffer[state.index] = { value, timestamp }
    state.index = (state.index + 1) % state.capacity
    if (state.index === 0) state.isFull = true
  }

  /** 获取当前有效长度 */
  const size = state.isFull ? state.capacity : state.index

  /** 以时间顺序返回所有数据（最新在最后） */
  const toArray = (): TimedData<T>[] => {
    if (!state.isFull)
      return state.buffer.slice(0, state.index) as TimedData<T>[]
    return [
      ...state.buffer.slice(state.index),
      ...state.buffer.slice(0, state.index),
    ] as TimedData<T>[]
  }

  /** 获取最近 N 条数据 */
  const recent = (n: number): TimedData<T>[] => {
    const data = toArray()
    return data.slice(-n)
  }

  /** 按时间窗口获取最近数据 */
  const window = (ms: number): TimedData<T>[] => {
    const now = Date.now()
    return toArray().filter((item) => item && now - item.timestamp <= ms)
  }

  return {
    size,
    push,
    toArray,
    recent,
    window,
  }
}
