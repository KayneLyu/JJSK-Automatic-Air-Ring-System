import { mkdirSync, writeFileSync } from 'node:fs'
import { availableParallelism, cpus } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { describe, test } from 'vitest'
import type { CalibrationWorkerSuccessResponse } from '../../../../apps/AirRingSys/electron/calibrationWorker'
import { createCalibrationWorkerClient } from '../../../../apps/AirRingSys/electron/calibrationWorkerClient'
import type { UpperRotationRustShadowTelemetry } from '../upperRotation/upperRotation.nativeShadow'
import { estimateThetaMaxWithPhaseCorrectionDetailed } from '../upperRotation/upperRotation.estimate'
import {
  loadTripSegments,
  type DatasetName,
} from './upperRotationNativeFixtures'
import { captureMemory, summarizeTimings } from './performanceStats'

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const WORKER_PATH = resolve(
  REPOSITORY_ROOT,
  'apps/AirRingSys/dist-electron/calibrationWorker.js'
)
const NATIVE_PATH = resolve(
  REPOSITORY_ROOT,
  'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
)
const OUTPUT_DIR = resolve(
  REPOSITORY_ROOT,
  '.agents/tasks/rust-performance-migration/scripts/outputs'
)
const DATASETS: DatasetName[] = ['01', '02', '03', '04', '05']
const THREAD_LIMIT = 4

const readPositiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} 必须是正整数，当前值: ${raw}`)
  }
  return parsed
}

const SOAK_CYCLES = readPositiveInteger('RUST_SHADOW_SOAK_CYCLES', 3)
const REQUEST_TIMEOUT_MS = readPositiveInteger(
  'RUST_SHADOW_SOAK_TIMEOUT_MS',
  120_000
)
const rawScenarioFilter =
  process.env.RUST_SHADOW_SOAK_SCENARIOS ?? 'disabled-serial'
const SCENARIO_FILTER = new Set(
  (rawScenarioFilter === 'all' ? '' : rawScenarioFilter)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)
const outputVariant =
  process.env.RUST_SHADOW_SOAK_OUTPUT_VARIANT ??
  (SCENARIO_FILTER.size === 1 ? [...SCENARIO_FILTER][0] : 'combined-process')
if (!/^[a-z0-9-]+$/i.test(outputVariant)) {
  throw new Error('RUST_SHADOW_SOAK_OUTPUT_VARIANT 只能包含字母、数字和连字符')
}
const OUTPUT_PATH = resolve(
  OUTPUT_DIR,
  `native-shadow-soak.${outputVariant}.json`
)

type SoakCase = {
  dataset: DatasetName
  tripSegments: ReturnType<typeof loadTripSegments>
}

type WorkerMeasurement = {
  dataset: DatasetName
  elapsedMs: number
  response: CalibrationWorkerSuccessResponse
}

type ScenarioDefinition = {
  name: string
  shadowEnabled: boolean
  primaryEnabled: boolean
  concurrency: number
}

type TimingSummary = Omit<ReturnType<typeof summarizeTimings>, 'samplesMs'>

type ScenarioReport = {
  name: string
  shadowEnabled: boolean
  primaryEnabled: boolean
  concurrency: number
  workerCreateCount: number
  warmupRequestCount: number
  requestCount: number
  successfulRequests: number
  failedRequests: number
  productionMismatchCount: number
  nativeMismatchCount: number
  primaryMismatchCount: number
  primaryFailureCount: number
  telemetryFailureCount: number
  threadLimitMismatchCount: number
  telemetryStatusCounts: Record<string, number>
  wallElapsedMs: number
  throughputPerSecond: number
  requestLatency: TimingSummary
  nativeLatency: TimingSummary | null
  shadowTotalLatency: TimingSummary | null
  primaryLatency: TimingSummary | null
  cpu: {
    userMs: number
    systemMs: number
    coreEquivalent: number
  }
  memory: {
    rssStartBytes: number
    rssEndBytes: number
    rssPeakBytes: number
    rssDeltaBytes: number
  }
  eventLoop: {
    p95Ms: number
    maxMs: number
  }
}

const runWorkerRequest = (
  soakCase: SoakCase,
  client: ReturnType<typeof createCalibrationWorkerClient>
): Promise<WorkerMeasurement> => {
  const startedAt = performance.now()
  return client
    .run({
      tripSegments: soakCase.tripSegments,
      options: { deltaRange: { min: 180, max: 360, step: 1 } },
    })
    .then((response) => {
      return {
        dataset: soakCase.dataset,
        elapsedMs: performance.now() - startedAt,
        response,
      }
    })
}

const runWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> => {
  const results = Array.from({ length: items.length }, () => undefined as R)
  let cursor = 0
  const runner = async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await operation(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () =>
      runner()
    )
  )
  return results
}

const round = (value: number): number => Math.round(value * 1_000) / 1_000

const summarizeAggregates = (samplesMs: number[]): TimingSummary => {
  const { samplesMs: _samplesMs, ...summary } = summarizeTimings(samplesMs)
  return summary
}

const runScenario = async (
  definition: ScenarioDefinition,
  cases: readonly SoakCase[],
  productionAngles: Map<DatasetName, number>
): Promise<ScenarioReport> => {
  const clientErrors: string[] = []
  const client = createCalibrationWorkerClient({
    workerPath: pathToFileURL(WORKER_PATH),
    timeoutMs: REQUEST_TIMEOUT_MS,
    workerOptions: {
      env: {
        ...process.env,
        AIR_RING_RUST_SHADOW: definition.shadowEnabled ? '1' : '0',
        AIR_RING_RUST_PRIMARY: definition.primaryEnabled ? '1' : '0',
        AIR_RING_RUST_SHADOW_THREADS: String(THREAD_LIMIT),
        AIR_RING_RUST_PRIMARY_THREADS: String(THREAD_LIMIT),
        AIR_RING_RUST_NATIVE_PATH: NATIVE_PATH,
        AIR_RING_RUST_SHADOW_MAX_RUNS: String(Math.max(100, cases.length + 1)),
      },
      stdout: true,
      stderr: true,
    },
    onInternalError: (error) => {
      if (clientErrors.length < 10) clientErrors.push(error.message)
    },
    onWorkerCreated: (worker) => {
      worker.stdout?.resume()
      worker.stderr?.resume()
    },
  })
  const warmupRequestCount =
    definition.primaryEnabled ||
    (definition.shadowEnabled && definition.concurrency > 1)
      ? 1
      : 0
  if (warmupRequestCount > 0) {
    await runWorkerRequest(cases[0], client)
  }
  const memoryBefore = captureMemory()
  let rssPeakBytes = memoryBefore.rssBytes
  const rssSampler = setInterval(() => {
    rssPeakBytes = Math.max(rssPeakBytes, process.memoryUsage().rss)
  }, 10)
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
  const cpuBefore = process.cpuUsage()
  const wallStartedAt = performance.now()

  let measurements: WorkerMeasurement[]
  try {
    measurements = await runWithConcurrency(
      cases,
      definition.concurrency,
      (soakCase) => runWorkerRequest(soakCase, client)
    )
  } finally {
    clearInterval(rssSampler)
    eventLoop.disable()
    await client.shutdown()
  }

  if (clientErrors.length > 0) {
    throw new Error(`Calibration Worker 客户端错误: ${clientErrors.join('; ')}`)
  }

  const wallElapsedMs = performance.now() - wallStartedAt
  const cpuDelta = process.cpuUsage(cpuBefore)
  const memoryAfter = captureMemory()
  rssPeakBytes = Math.max(rssPeakBytes, memoryAfter.rssBytes)
  const telemetryStatusCounts: Record<string, number> = {}
  const nativeSamples: number[] = []
  const shadowTotalSamples: number[] = []
  const primarySamples: number[] = []
  let successfulRequests = 0
  let productionMismatchCount = 0
  let nativeMismatchCount = 0
  let primaryMismatchCount = 0
  let primaryFailureCount = 0
  let telemetryFailureCount = 0
  let threadLimitMismatchCount = 0

  for (const measurement of measurements) {
    if (!measurement.response.ok) continue
    successfulRequests += 1
    const expected = productionAngles.get(measurement.dataset)
    if (expected === undefined) {
      productionAngles.set(measurement.dataset, measurement.response.maxAngle)
    } else if (Math.abs(measurement.response.maxAngle - expected) > 1e-9) {
      productionMismatchCount += 1
    }

    const primary = measurement.response.rustPrimary
    if (definition.primaryEnabled) {
      if (!primary || primary.status !== 'success') {
        primaryFailureCount += 1
      } else {
        primarySamples.push(primary.elapsedMs)
        if (primary.threadLimit !== THREAD_LIMIT) {
          threadLimitMismatchCount += 1
        }
        if (
          expected === undefined ||
          Math.abs(measurement.response.maxAngle - expected) > 1e-9 ||
          primary.finalThetaDeg === null ||
          Math.abs(primary.finalThetaDeg - measurement.response.maxAngle) > 1e-9
        ) {
          primaryMismatchCount += 1
        }
      }
    } else if (primary !== undefined) {
      primaryFailureCount += 1
    }

    const telemetry: UpperRotationRustShadowTelemetry | undefined =
      measurement.response.rustShadow
    if (!definition.shadowEnabled) {
      if (telemetry !== undefined) telemetryFailureCount += 1
      continue
    }
    if (!telemetry) {
      telemetryFailureCount += 1
      continue
    }
    telemetryStatusCounts[telemetry.status] =
      (telemetryStatusCounts[telemetry.status] ?? 0) + 1
    if (telemetry.status !== 'success') telemetryFailureCount += 1
    if (
      telemetry.absoluteAngleDeltaDeg === null ||
      telemetry.absoluteAngleDeltaDeg > 1e-9
    ) {
      nativeMismatchCount += 1
    }
    if (telemetry.threadLimit !== THREAD_LIMIT) {
      threadLimitMismatchCount += 1
    }
    nativeSamples.push(telemetry.nativeElapsedMs)
    shadowTotalSamples.push(telemetry.totalElapsedMs)
  }

  const cpuTotalMs = (cpuDelta.user + cpuDelta.system) / 1_000
  return {
    name: definition.name,
    shadowEnabled: definition.shadowEnabled,
    primaryEnabled: definition.primaryEnabled,
    concurrency: definition.concurrency,
    workerCreateCount: client.getWorkerCreateCount(),
    warmupRequestCount,
    requestCount: measurements.length,
    successfulRequests,
    failedRequests: measurements.length - successfulRequests,
    productionMismatchCount,
    nativeMismatchCount,
    primaryMismatchCount,
    primaryFailureCount,
    telemetryFailureCount,
    threadLimitMismatchCount,
    telemetryStatusCounts,
    wallElapsedMs: round(wallElapsedMs),
    throughputPerSecond: round(measurements.length / (wallElapsedMs / 1_000)),
    requestLatency: summarizeAggregates(
      measurements.map((measurement) => measurement.elapsedMs)
    ),
    nativeLatency:
      nativeSamples.length > 0 ? summarizeAggregates(nativeSamples) : null,
    shadowTotalLatency:
      shadowTotalSamples.length > 0
        ? summarizeAggregates(shadowTotalSamples)
        : null,
    primaryLatency:
      primarySamples.length > 0 ? summarizeAggregates(primarySamples) : null,
    cpu: {
      userMs: round(cpuDelta.user / 1_000),
      systemMs: round(cpuDelta.system / 1_000),
      coreEquivalent: round(cpuTotalMs / wallElapsedMs),
    },
    memory: {
      rssStartBytes: memoryBefore.rssBytes,
      rssEndBytes: memoryAfter.rssBytes,
      rssPeakBytes,
      rssDeltaBytes: memoryAfter.rssBytes - memoryBefore.rssBytes,
    },
    eventLoop: {
      p95Ms: round(eventLoop.percentile(95) / 1_000_000),
      maxMs: round(eventLoop.max / 1_000_000),
    },
  }
}

export const runNativeShadowSoak = async () => {
  const cases: SoakCase[] = []
  const loaded = new Map(
    DATASETS.map((dataset) => [dataset, loadTripSegments(dataset)] as const)
  )
  for (let cycle = 0; cycle < SOAK_CYCLES; cycle += 1) {
    for (const dataset of DATASETS) {
      cases.push({ dataset, tripSegments: loaded.get(dataset) ?? [] })
    }
  }

  const allDefinitions: ScenarioDefinition[] = [
    {
      name: 'disabled-serial',
      shadowEnabled: false,
      primaryEnabled: false,
      concurrency: 1,
    },
    {
      name: 'primary-serial',
      shadowEnabled: false,
      primaryEnabled: true,
      concurrency: 1,
    },
    {
      name: 'shadow-concurrency-4',
      shadowEnabled: true,
      primaryEnabled: false,
      concurrency: 4,
    },
    {
      name: 'shadow-serial',
      shadowEnabled: true,
      primaryEnabled: false,
      concurrency: 1,
    },
    {
      name: 'shadow-concurrency-2',
      shadowEnabled: true,
      primaryEnabled: false,
      concurrency: 2,
    },
  ]
  const definitions = allDefinitions.filter(
    (definition) =>
      SCENARIO_FILTER.size === 0 || SCENARIO_FILTER.has(definition.name)
  )
  if (definitions.length === 0) {
    throw new Error('RUST_SHADOW_SOAK_SCENARIOS 未匹配任何场景')
  }
  const productionAngles = new Map<DatasetName, number>()
  for (const dataset of DATASETS) {
    const estimate = estimateThetaMaxWithPhaseCorrectionDetailed(
      loaded.get(dataset) ?? [],
      { deltaRange: { min: 180, max: 360, step: 1 } }
    )
    if (estimate.thetaMaxDeg === null) {
      throw new Error(`DS${dataset} TypeScript 基线未返回角度`)
    }
    productionAngles.set(dataset, estimate.thetaMaxDeg)
  }
  const scenarios: ScenarioReport[] = []
  for (const definition of definitions) {
    console.log(`[Stage3Soak] 开始场景: ${definition.name}`)
    const scenario = await runScenario(definition, cases, productionAngles)
    scenarios.push(scenario)
    console.log(
      `[Stage3Soak] 完成场景: ${definition.name}, requests=${scenario.requestCount}, p95=${scenario.requestLatency.p95Ms}ms`
    )
  }

  const baselineScenario = scenarios.find(
    (scenario) => scenario.name === 'disabled-serial'
  )
  const primaryScenario = scenarios.find(
    (scenario) => scenario.name === 'primary-serial'
  )
  const primaryMedianSpeedup =
    baselineScenario && primaryScenario
      ? round(
          baselineScenario.requestLatency.medianMs /
            primaryScenario.requestLatency.medianMs
        )
      : null

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    configuration: {
      cycles: SOAK_CYCLES,
      datasets: DATASETS,
      requestCountPerScenario: cases.length,
      threadLimit: THREAD_LIMIT,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      maxConcurrency: Math.max(
        ...definitions.map((definition) => definition.concurrency)
      ),
      workerTopology: 'persistent-single-worker-fifo',
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpuModel: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      availableParallelism: availableParallelism(),
    },
    productionAngles: Object.fromEntries(productionAngles),
    scenarios,
    primaryMedianSpeedup,
    gates: {
      allRequestsSucceeded: scenarios.every(
        (scenario) => scenario.failedRequests === 0
      ),
      productionOutputStable: scenarios.every(
        (scenario) => scenario.productionMismatchCount === 0
      ),
      nativeThetaEquivalent: scenarios
        .filter((scenario) => scenario.shadowEnabled)
        .every((scenario) => scenario.nativeMismatchCount === 0),
      primaryThetaEquivalent: scenarios
        .filter((scenario) => scenario.primaryEnabled)
        .every((scenario) => scenario.primaryMismatchCount === 0),
      primaryTelemetrySuccessful: scenarios.every(
        (scenario) => scenario.primaryFailureCount === 0
      ),
      primaryMedianAtLeastTwoTimes:
        primaryMedianSpeedup === null || primaryMedianSpeedup >= 2,
      telemetrySuccessful: scenarios.every(
        (scenario) => scenario.telemetryFailureCount === 0
      ),
      threadLimitStable: scenarios.every(
        (scenario) => scenario.threadLimitMismatchCount === 0
      ),
      singleWorkerReused: scenarios.every(
        (scenario) => scenario.workerCreateCount === 1
      ),
      eventLoopP95Under100Ms: scenarios.every(
        (scenario) => scenario.eventLoop.p95Ms < 100
      ),
    },
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`
  if (serialized.includes('measurements') || serialized.includes('samplesMs')) {
    throw new Error('阶段 4 报告不得包含原始 measurements 或 samplesMs')
  }
  const failedGates = Object.entries(report.gates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  if (failedGates.length > 0) {
    throw new Error(`阶段 3 场景门槛失败: ${failedGates.join(', ')}`)
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, serialized, 'utf8')
  console.log(`阶段 3 Worker 影子耐久报告已写入: ${OUTPUT_PATH}`)
  return report
}

if (process.env.VITEST) {
  describe.sequential('Rust 影子实际 Worker 离线耐久与并发预算', () => {
    test(
      '运行选择的实际 Worker 场景',
      async () => {
        await runNativeShadowSoak()
      },
      10 * 60_000
    )
  })
} else {
  void runNativeShadowSoak().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
