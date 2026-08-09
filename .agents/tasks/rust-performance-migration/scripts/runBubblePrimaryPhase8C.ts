import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import {
  compareBubbleProfiles,
  reconstructBubbleThickness,
  type MeasurementTriple,
} from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction'
import { generateTypicalBubble } from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction/simulation/bubbleSimulator'
import { simulateMeasurements } from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction/simulation/measurementSimulator'
import { createBubbleWorkerClient } from '../../../../apps/AirRingSys/electron/bubbleWorkerClient'

const repositoryRoot = resolve(import.meta.dirname, '../../../..')
const outputPath = resolve(
  import.meta.dirname,
  'outputs/phase-8c-bubble-primary.json'
)
const workerPath = resolve(
  repositoryRoot,
  'apps/AirRingSys/dist-electron/bubbleWorker.js'
)
const nativePath = resolve(
  repositoryRoot,
  'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
)
const request = {
  type: 'reconstruct' as const,
  membraneWidthMm: 300,
  options: {
    numBins: 48,
    lambda: 1e-4,
    mu: 0.0005,
    processDeformationFactor: 1.02,
  },
}

if (!existsSync(workerPath)) {
  throw new Error(`缺少构建后的 Bubble Worker: ${workerPath}`)
}
if (!existsSync(nativePath)) {
  throw new Error(`缺少 Native 模块: ${nativePath}`)
}

const percentile = (samples: number[], value: number): number => {
  const sorted = [...samples].sort((left, right) => left - right)
  return (
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ??
    0
  )
}

const summarize = (samples: number[]) => ({
  minMs: Math.min(...samples),
  medianMs: percentile(samples, 0.5),
  p95Ms: percentile(samples, 0.95),
  maxMs: Math.max(...samples),
  meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
})

const createMeasurements = (): MeasurementTriple[] => {
  const profile = generateTypicalBubble(50, 48)
  return simulateMeasurements(profile, {
    membraneWidthMm: 300,
    rotationSpeedDegPerSec: 10,
    scanPeriodSec: 5,
    numScanPoints: 120,
    transportDelaySec: 30,
    totalTimeSec: 50,
    processDeformationFactor: 1.02,
    measurementNoiseStdDev: 0.2,
  })
}

const createClient = (primaryEnabled: boolean) =>
  createBubbleWorkerClient({
    workerPath: pathToFileURL(workerPath),
    workerOptions: {
      stdout: true,
      stderr: true,
      env: {
        ...process.env,
        AIR_RING_BUBBLE_RUST_SHADOW: '0',
        AIR_RING_BUBBLE_RUST_PRIMARY: primaryEnabled ? '1' : '0',
        AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: primaryEnabled ? '0' : '1',
        AIR_RING_RUST_NATIVE_PATH: nativePath,
      },
    },
    onWorkerCreated(worker) {
      // Soak 仅消费结构化 response，丢弃逐请求 Worker 日志，避免管道背压。
      worker.stdout?.resume()
      worker.stderr?.resume()
    },
  })

const runTiming = async (
  triples: MeasurementTriple[],
  primaryEnabled: boolean,
  warmup: number,
  repeat: number,
  referenceProfile: number[]
) => {
  const client = createClient(primaryEnabled)
  const samples: number[] = []
  let primarySuccessCount = 0
  let fallbackCount = 0
  let maxProfileDelta = 0

  try {
    for (let index = 0; index < warmup + repeat; index += 1) {
      const startedAt = performance.now()
      const response = await client.run({ ...request, triples })
      const elapsedMs = performance.now() - startedAt
      const comparison = compareBubbleProfiles(
        referenceProfile,
        response.result.profile
      )
      maxProfileDelta = Math.max(maxProfileDelta, comparison.maxAbsProfileDelta)
      if (response.rustPrimary?.status === 'success') primarySuccessCount += 1
      if (response.rustPrimary?.status === 'fallback') fallbackCount += 1
      if (index >= warmup) samples.push(elapsedMs)
    }
  } finally {
    await client.shutdown()
  }

  return {
    timing: summarize(samples),
    measuredRequestCount: repeat,
    warmupRequestCount: warmup,
    primarySuccessCount,
    fallbackCount,
    maxProfileDelta,
    workerCreateCount: client.getWorkerCreateCount(),
  }
}

;(async () => {
  const triples = createMeasurements()
  const reference = reconstructBubbleThickness(triples, 300, request.options)
  const baseline = await runTiming(triples, false, 5, 30, reference.profile)

  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  const startRssBytes = process.memoryUsage().rss
  let peakRssBytes = startRssBytes
  const memorySampler = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
  }, 10)
  eventLoop.enable()
  let primary
  try {
    primary = await runTiming(triples, true, 5, 300, reference.profile)
  } finally {
    clearInterval(memorySampler)
    eventLoop.disable()
  }
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)

  if (
    primary.primarySuccessCount !== 305 ||
    primary.fallbackCount !== 0 ||
    primary.workerCreateCount !== 1 ||
    primary.maxProfileDelta > 1e-8
  ) {
    throw new Error(
      `Phase 8C primary soak 未通过: success=${primary.primarySuccessCount}, fallback=${primary.fallbackCount}, workers=${primary.workerCreateCount}, delta=${primary.maxProfileDelta}`
    )
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    configuration: {
      numBins: request.options.numBins,
      measurementCount: triples.length,
      warmupRequests: 5,
      baselineRequests: 30,
      primarySoakRequests: 300,
      shadowEnabled: false,
      primaryEnabled: true,
    },
    baseline,
    primary: {
      ...primary,
      medianSpeedup: baseline.timing.medianMs / primary.timing.medianMs,
      eventLoopP95Ms: eventLoop.percentile(95) / 1e6,
      startRssBytes,
      peakRssBytes,
      endRssBytes: process.memoryUsage().rss,
    },
    decision: 'pass',
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
})().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
