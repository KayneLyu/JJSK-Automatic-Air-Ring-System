/**
 * Phase 8B 历史膜泡重建观测入口。
 *
 * 仅接受显式历史数据库和标定参数，通过生产链
 * bubbleQueryWorker -> buildProfileAsync -> persistent bubbleWorker 执行。
 * 标准输出只包含逐趟摘要，不输出原始测厚数据或 profile 数组。
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { buildProfileAsync } from './db/sweepProfileBuilder'
import { downsampleUniform } from './db/sweepHelpers'
import { queryBubbleSweepsData } from './bubbleQueryManager'
import {
  getBubbleWorkerCreateCount,
  shutdownBubbleWorker,
} from './bubbleWorkerManager'

const OUTPUT_PREFIX = '[BubbleHistorical]'
const MAX_POINTS_PER_SWEEP = 2000

type HistoricalBubbleConfig = {
  databasePath: string
  startMs: number
  endMs: number
  sweepLimit: number
  membraneWidthMm: number
  thetaMaxDeg: number
  mmPerPulse: number
  airAD: number
  gain: number
  transportDelayMs: number
  numBins: number
  processDeformationFactor: number
  repeatCount: number
}

const parseFiniteNumber = (name: string, raw: string | undefined): number => {
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} 必须是有限数值`)
  return value
}

const parsePositiveNumber = (name: string, raw: string | undefined): number => {
  const value = parseFiniteNumber(name, raw)
  if (value <= 0) throw new Error(`${name} 必须大于 0`)
  return value
}

const parsePositiveInteger = (
  name: string,
  raw: string | undefined
): number => {
  const value = parsePositiveNumber(name, raw)
  if (!Number.isSafeInteger(value)) throw new Error(`${name} 必须是正整数`)
  return value
}

const parseConfig = (args: string[]): HistoricalBubbleConfig => {
  if (args.length !== 12 && args.length !== 13) {
    throw new Error(
      '用法: historicalBubbleObservation.js <db> <startMs> <endMs> <sweepLimit> <membraneWidthMm> <thetaMaxDeg> <mmPerPulse> <airAD> <gain> <transportDelayMs> <numBins> <processDeformationFactor> [repeatCount]'
    )
  }

  const databasePath = args[0]
  if (!isAbsolute(databasePath)) throw new Error('数据库路径必须是绝对路径')
  if (!existsSync(databasePath))
    throw new Error(`历史数据库不存在: ${databasePath}`)

  const startMs = parsePositiveInteger('startMs', args[1])
  const endMs = parsePositiveInteger('endMs', args[2])
  if (endMs <= startMs) throw new Error('endMs 必须大于 startMs')

  const numBins = parsePositiveInteger('numBins', args[10])
  if (numBins < 8 || numBins > 720) {
    throw new Error('numBins 必须位于 8..720')
  }

  const repeatCount = args[12]
    ? parsePositiveInteger('repeatCount', args[12])
    : 1
  if (repeatCount > 200) throw new Error('repeatCount 必须位于 1..200')

  return {
    databasePath,
    startMs,
    endMs,
    sweepLimit: parsePositiveInteger('sweepLimit', args[3]),
    membraneWidthMm: parsePositiveNumber('membraneWidthMm', args[4]),
    thetaMaxDeg: parsePositiveNumber('thetaMaxDeg', args[5]),
    mmPerPulse: parsePositiveNumber('mmPerPulse', args[6]),
    airAD: parsePositiveNumber('airAD', args[7]),
    gain: parsePositiveNumber('gain', args[8]),
    transportDelayMs: parsePositiveNumber('transportDelayMs', args[9]),
    numBins,
    processDeformationFactor: parsePositiveNumber(
      'processDeformationFactor',
      args[11]
    ),
    repeatCount,
  }
}

const emit = (value: object): void => {
  console.log(`${OUTPUT_PREFIX} ${JSON.stringify(value)}`)
}

const hashProfile = (profile: number[]): string => {
  const values = Float64Array.from(profile)
  return createHash('sha256')
    .update(Buffer.from(values.buffer, values.byteOffset, values.byteLength))
    .digest('hex')
}

const linearSlope = (values: number[]): number => {
  if (values.length < 2) return 0
  const meanIndex = (values.length - 1) / 2
  const meanValue =
    values.reduce((sum, value) => sum + value, 0) / values.length
  let covariance = 0
  let variance = 0
  for (let index = 0; index < values.length; index += 1) {
    const indexDelta = index - meanIndex
    covariance += indexDelta * (values[index] - meanValue)
    variance += indexDelta * indexDelta
  }
  return variance > 0 ? covariance / variance : 0
}

const main = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2))
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  const startRssBytes = process.memoryUsage().rss
  let peakRssBytes = startRssBytes
  const memorySampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
  }, 10)
  eventLoop.enable()
  let sweeps: Awaited<ReturnType<typeof queryBubbleSweepsData>> = []
  let queryElapsedMs = 0
  let validProfileCount = 0
  let nullProfileCount = 0
  let failedProfileCount = 0
  let profileHashDriftCount = 0
  const uniqueProfileHashes = new Set<string>()
  const referenceHashBySweep = new Map<number, string>()
  const repeatRssBytes: number[] = []
  let replayStartRssBytes = startRssBytes

  try {
    const queriedAt = performance.now()
    sweeps = await queryBubbleSweepsData(
      config.databasePath,
      config.startMs,
      config.endMs,
      config.sweepLimit
    )
    queryElapsedMs = performance.now() - queriedAt
    replayStartRssBytes = process.memoryUsage().rss

    for (
      let repeatIndex = 0;
      repeatIndex < config.repeatCount;
      repeatIndex += 1
    ) {
      for (let index = 0; index < sweeps.length; index += 1) {
        const item = sweeps[index]
        const rows =
          item.rows.length > MAX_POINTS_PER_SWEEP
            ? downsampleUniform(item.rows, MAX_POINTS_PER_SWEEP)
            : item.rows
        const startedAt = performance.now()

        try {
          const result = await buildProfileAsync(
            rows,
            item.sweep,
            config.membraneWidthMm,
            config.thetaMaxDeg,
            config.mmPerPulse,
            config.airAD,
            config.gain,
            config.numBins,
            config.processDeformationFactor,
            config.transportDelayMs
          )
          const elapsedMs = performance.now() - startedAt
          const profileHash = result ? hashProfile(result.profile) : null
          if (result && profileHash) {
            validProfileCount += 1
            uniqueProfileHashes.add(profileHash)
            const referenceHash = referenceHashBySweep.get(index)
            if (referenceHash && referenceHash !== profileHash) {
              profileHashDriftCount += 1
            } else if (!referenceHash) {
              referenceHashBySweep.set(index, profileHash)
            }
          } else {
            nullProfileCount += 1
          }
          emit({
            schemaVersion: 1,
            type: 'sweep',
            repeatIndex,
            index,
            status: result ? 'success' : 'rejected',
            direction: item.sweep.direction,
            durationMs: item.sweep.durationMs,
            sourceRowCount: item.sourceRowCount,
            sampledRowCount: rows.length,
            measurementCount: result?.numMeasurements ?? 0,
            numBins: result?.numBins ?? config.numBins,
            profileHash,
            elapsedMs,
          })
        } catch (error) {
          failedProfileCount += 1
          emit({
            schemaVersion: 1,
            type: 'sweep',
            repeatIndex,
            index,
            status: 'failed',
            direction: item.sweep.direction,
            durationMs: item.sweep.durationMs,
            sourceRowCount: item.sourceRowCount,
            sampledRowCount: rows.length,
            elapsedMs: performance.now() - startedAt,
            error:
              error instanceof Error
                ? error.message.slice(0, 300)
                : String(error).slice(0, 300),
          })
        }
      }
      repeatRssBytes.push(process.memoryUsage().rss)
    }
  } finally {
    await shutdownBubbleWorker()
    clearInterval(memorySampler)
    eventLoop.disable()
  }

  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)

  emit({
    schemaVersion: 1,
    type: 'summary',
    queriedSweepCount: sweeps.length,
    repeatCount: config.repeatCount,
    attemptedSweepCount: sweeps.length * config.repeatCount,
    validProfileCount,
    nullProfileCount,
    failedProfileCount,
    uniqueSuccessfulProfileHashCount: uniqueProfileHashes.size,
    profileHashDriftCount,
    queryElapsedMs,
    bubbleWorkerCreateCount: getBubbleWorkerCreateCount(),
    eventLoopP95Ms: eventLoop.percentile(95) / 1e6,
    startRssBytes,
    replayStartRssBytes,
    firstRepeatRssBytes: repeatRssBytes[0] ?? replayStartRssBytes,
    lastRepeatRssBytes:
      repeatRssBytes[repeatRssBytes.length - 1] ?? replayStartRssBytes,
    repeatRssSlopeBytesPerPass: linearSlope(repeatRssBytes),
    peakRssBytes,
    endRssBytes: process.memoryUsage().rss,
  })
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
})
