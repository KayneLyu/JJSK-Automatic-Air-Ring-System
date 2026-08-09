import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { solveBubbleBatch } from '../../../../packages/AirRingNative'
import {
  buildSparseSystem,
  compareBubbleProfiles,
  reconstructBubbleThickness,
  reconstructBubbleThicknessWithBatchSolver,
  solveBatch,
  solveBubbleBatchWithNative,
  type BubbleNativeBinding,
  type MeasurementTriple,
} from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction'
import { generateTypicalBubble } from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction/simulation/bubbleSimulator'
import { simulateMeasurements } from '../../../../packages/AirRingServer/algorithms/bubbleReconstruction/simulation/measurementSimulator'
import { createBubbleWorkerClient } from '../../../../apps/AirRingSys/electron/bubbleWorkerClient'

const repositoryRoot = resolve(import.meta.dirname, '../../../..')
const outputPath = resolve(
  import.meta.dirname,
  'outputs/phase-8-bubble-native.json'
)
const workerPath = resolve(
  repositoryRoot,
  'apps/AirRingSys/dist-electron/bubbleWorker.js'
)
const nativePath = resolve(
  repositoryRoot,
  'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
)

if (!existsSync(workerPath)) {
  throw new Error(`缺少构建后的 Bubble Worker: ${workerPath}`)
}
if (!existsSync(nativePath)) {
  throw new Error(`缺少 Native 模块: ${nativePath}`)
}

const binding: BubbleNativeBinding = { solveBubbleBatch }

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

const measureSync = <T>(run: () => T, warmup: number, repeat: number) => {
  let result = run()
  for (let index = 1; index < warmup; index += 1) result = run()
  const samples: number[] = []
  for (let index = 0; index < repeat; index += 1) {
    const startedAt = performance.now()
    result = run()
    samples.push(performance.now() - startedAt)
  }
  return { result, samples, timing: summarize(samples) }
}

const createMeasurements = (numBins: number): MeasurementTriple[] => {
  const profile = generateTypicalBubble(50, numBins)
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

;(async () => {
  const solverResults = [48, 96, 180, 360].map((numBins) => {
    const measurements = createMeasurements(numBins)
    const sparse = buildSparseSystem(measurements, 300, numBins, 1.02)
    const ts = measureSync(() => solveBatch(sparse, 1e-4, 0.0005), 3, 20)
    const rust = measureSync(
      () => solveBubbleBatchWithNative(binding, sparse, 1e-4, 0.0005),
      3,
      20
    )
    const tsEndToEnd = measureSync(
      () =>
        reconstructBubbleThickness(measurements, 300, {
          numBins,
          lambda: 1e-4,
          mu: 0.0005,
          processDeformationFactor: 1.02,
        }),
      2,
      10
    )
    const rustEndToEnd = measureSync(
      () =>
        reconstructBubbleThicknessWithBatchSolver(
          measurements,
          300,
          {
            numBins,
            lambda: 1e-4,
            mu: 0.0005,
            processDeformationFactor: 1.02,
          },
          (system, lambda, mu) =>
            solveBubbleBatchWithNative(binding, system, lambda, mu)
        ),
      2,
      10
    )
    const comparison = compareBubbleProfiles(ts.result, rust.result)
    const finalComparison = compareBubbleProfiles(
      tsEndToEnd.result.profile,
      rustEndToEnd.result.profile
    )
    if (
      comparison.maxAbsProfileDelta > 1e-8 ||
      finalComparison.maxAbsProfileDelta > 1e-8
    ) {
      throw new Error(`${numBins} bins Rust/TypeScript 数值差异超过门槛`)
    }
    return {
      numBins,
      measurementCount: measurements.length,
      solver: {
        typescript: ts.timing,
        rust: rust.timing,
        medianSpeedup: ts.timing.medianMs / rust.timing.medianMs,
        comparison,
      },
      endToEnd: {
        typescript: tsEndToEnd.timing,
        rust: rustEndToEnd.timing,
        medianSpeedup:
          tsEndToEnd.timing.medianMs / rustEndToEnd.timing.medianMs,
        comparison: finalComparison,
      },
    }
  })

  const soakMeasurements = createMeasurements(48)
  const client = createBubbleWorkerClient({
    workerPath: pathToFileURL(workerPath),
    workerOptions: {
      env: {
        ...process.env,
        AIR_RING_BUBBLE_RUST_SHADOW: '1',
        AIR_RING_BUBBLE_RUST_PRIMARY: '0',
        AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: '1',
        AIR_RING_RUST_NATIVE_PATH: nativePath,
      },
    },
  })
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
  const requestLatencies: number[] = []
  let successCount = 0
  let shadowSuccessCount = 0
  let maxProfileDelta = 0
  let peakRssBytes = process.memoryUsage().rss
  const startRssBytes = peakRssBytes

  try {
    for (let index = 0; index < 300; index += 1) {
      const startedAt = performance.now()
      const response = await client.run({
        type: 'reconstruct',
        triples: soakMeasurements,
        membraneWidthMm: 300,
        options: {
          numBins: 48,
          lambda: 1e-4,
          mu: 0.0005,
          processDeformationFactor: 1.02,
        },
      })
      requestLatencies.push(performance.now() - startedAt)
      successCount += 1
      if (response.rustShadow?.status === 'success') {
        shadowSuccessCount += 1
        maxProfileDelta = Math.max(
          maxProfileDelta,
          response.rustShadow.maxAbsProfileDelta ?? 0
        )
      }
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
    }
  } finally {
    await client.shutdown()
    eventLoop.disable()
  }

  if (
    successCount !== 300 ||
    shadowSuccessCount !== 300 ||
    client.getWorkerCreateCount() !== 1 ||
    maxProfileDelta > 1e-8
  ) {
    throw new Error(
      `Worker soak 未通过: success=${successCount}, shadow=${shadowSuccessCount}, workers=${client.getWorkerCreateCount()}, delta=${maxProfileDelta}`
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
      solverWarmup: 3,
      solverRepeat: 20,
      endToEndWarmup: 2,
      endToEndRepeat: 10,
      soakRequests: 300,
      shadowEnabled: true,
    },
    solverResults,
    workerSoak: {
      successCount,
      shadowSuccessCount,
      workerCreateCount: client.getWorkerCreateCount(),
      maxProfileDelta,
      requestTiming: summarize(requestLatencies),
      eventLoopP95Ms: eventLoop.percentile(95) / 1e6,
      startRssBytes,
      peakRssBytes,
      endRssBytes: process.memoryUsage().rss,
    },
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
})().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
