export interface MemorySnapshot {
  rssBytes: number
  heapUsedBytes: number
  externalBytes: number
  arrayBuffersBytes: number
  maxRssKb: number
}

export interface BenchmarkStatistics {
  samplesMs: number[]
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
  meanMs: number
  standardDeviationMs: number
}

export interface BenchmarkMeasurement<T> {
  result: T
  timing: BenchmarkStatistics
  memoryBefore: MemorySnapshot
  memoryAfter: MemorySnapshot
  memoryDelta: Omit<MemorySnapshot, 'maxRssKb'>
}

const round = (value: number): number => Math.round(value * 1000) / 1000

const percentile = (sorted: number[], ratio: number): number => {
  if (sorted.length === 0) return 0
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1
  )
  return sorted[Math.max(0, index)]
}

export const summarizeTimings = (samplesMs: number[]): BenchmarkStatistics => {
  const sorted = [...samplesMs].sort((a, b) => a - b)
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const variance =
    sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length

  return {
    samplesMs: samplesMs.map(round),
    minMs: round(sorted[0] ?? 0),
    medianMs: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted.at(-1) ?? 0),
    meanMs: round(mean),
    standardDeviationMs: round(Math.sqrt(variance)),
  }
}

export const captureMemory = (): MemorySnapshot => {
  const memory = process.memoryUsage()
  return {
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
    maxRssKb: process.resourceUsage().maxRSS,
  }
}

const memoryDelta = (
  before: MemorySnapshot,
  after: MemorySnapshot
): Omit<MemorySnapshot, 'maxRssKb'> => ({
  rssBytes: after.rssBytes - before.rssBytes,
  heapUsedBytes: after.heapUsedBytes - before.heapUsedBytes,
  externalBytes: after.externalBytes - before.externalBytes,
  arrayBuffersBytes: after.arrayBuffersBytes - before.arrayBuffersBytes,
})

export const measureSync = <T>(
  operation: () => T,
  warmup: number,
  repeat: number
): BenchmarkMeasurement<T> => {
  for (let index = 0; index < warmup; index += 1) operation()

  const memoryBefore = captureMemory()
  const samplesMs: number[] = []
  let result: T | undefined
  for (let index = 0; index < repeat; index += 1) {
    const startedAt = performance.now()
    result = operation()
    samplesMs.push(performance.now() - startedAt)
  }
  const memoryAfter = captureMemory()

  if (result === undefined) throw new Error('基准操作没有返回结果')
  return {
    result,
    timing: summarizeTimings(samplesMs),
    memoryBefore,
    memoryAfter,
    memoryDelta: memoryDelta(memoryBefore, memoryAfter),
  }
}

export const measureAsync = async <T>(
  operation: () => Promise<T>,
  warmup: number,
  repeat: number
): Promise<BenchmarkMeasurement<T>> => {
  for (let index = 0; index < warmup; index += 1) await operation()

  const memoryBefore = captureMemory()
  const samplesMs: number[] = []
  let result: T | undefined
  for (let index = 0; index < repeat; index += 1) {
    const startedAt = performance.now()
    result = await operation()
    samplesMs.push(performance.now() - startedAt)
  }
  const memoryAfter = captureMemory()

  if (result === undefined) throw new Error('基准操作没有返回结果')
  return {
    result,
    timing: summarizeTimings(samplesMs),
    memoryBefore,
    memoryAfter,
    memoryDelta: memoryDelta(memoryBefore, memoryAfter),
  }
}
