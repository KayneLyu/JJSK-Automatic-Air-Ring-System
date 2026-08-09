import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, freemem, hostname, platform, release, totalmem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { describe, expect, test } from 'vitest'
import { mockRoller } from '@jjsk/simulation'
import type { TripSegment } from '../../types'
import { buildTripSegment } from '../buildTripSegment'
import { reconstructBubbleThickness } from '../bubbleReconstruction'
import { generateBubbleProfile } from '../bubbleReconstruction/simulation/bubbleSimulator'
import { simulateMeasurements } from '../bubbleReconstruction/simulation/measurementSimulator'
import type {
  BubbleSimulatorParams,
  MeasurementSimulatorParams,
} from '../bubbleReconstruction/types'
import { estimateThetaMaxWithPhaseCorrectionDetailed } from '../upperRotation/upperRotation'
import { measureAsync, measureSync } from './performanceStats'

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const OUTPUT_DIR = resolve(
  REPOSITORY_ROOT,
  '.agents/tasks/rust-performance-migration/scripts/outputs'
)
const OUTPUT_PATH = resolve(OUTPUT_DIR, 'performance-baseline.json')
const UPPER_ROTATION_DATA_DIR = resolve(
  REPOSITORY_ROOT,
  'packages/AirRingServer/algorithms/upperRotation/data'
)

const readPositiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} 必须是非负整数，当前值: ${raw}`)
  }
  return parsed
}

const WARMUP = readPositiveInteger('PERF_WARMUP', 1)
const REPEAT = Math.max(1, readPositiveInteger('PERF_REPEAT', 3))
const IPC_SAMPLE_COUNT = Math.max(
  1,
  readPositiveInteger('PERF_IPC_SAMPLE_COUNT', 100_000)
)

type DatasetName = '01' | '02' | '03' | '04' | '05'

type ThicknessRow = {
  HorizontalPulse: number
  ProbeValue: number
  timestamp: number
} | null

type RotationRow = {
  ForwardRotation: boolean
  ReverseRotation: boolean
  timestamp: number
} | null

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T

const loadDataset = (dataset: DatasetName) => {
  const datasetDir = resolve(UPPER_ROTATION_DATA_DIR, dataset)
  const thickness = readJson<ThicknessRow[]>(
    resolve(datasetDir, 'thickness.json')
  )
  const rotation = readJson<RotationRow[]>(resolve(datasetDir, 'upper.json'))
  const info = readJson<{ angle: number }>(resolve(datasetDir, 'info.json'))

  return { thickness, rotation, expectedThetaDeg: info.angle }
}

const buildSegments = (
  thickness: ThicknessRow[],
  rotation: RotationRow[]
): TripSegment[] => {
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next } = buildTripSegment()
  let segments: TripSegment[] = []
  for (let index = 0; index < rotation.length; index += 1) {
    const rotationValue = rotation[index]
    const thicknessValue = thickness[index]
    if (rotationValue && thicknessValue) {
      segments = next({
        airRing: rotationValue,
        thickness: { ...rollerNext(), ...thicknessValue },
      })
    }
  }
  return segments
}

const computeRmse = (actual: number[], expected: number[]): number => {
  let squaredError = 0
  for (let index = 0; index < expected.length; index += 1) {
    squaredError += (actual[index] - expected[index]) ** 2
  }
  return Math.sqrt(squaredError / expected.length)
}

const runWorkerRoundTrip = async (
  payload: unknown,
  transferList: ArrayBuffer[] = []
): Promise<number> => {
  const worker = new Worker(
    `const { parentPort } = require('node:worker_threads');
     parentPort.once('message', (value) => {
       const count = Array.isArray(value) ? value.length : value.timestamps.length;
       parentPort.postMessage(count);
     });`,
    { eval: true }
  )

  return new Promise((resolvePromise, reject) => {
    worker.once('message', (count: number) => {
      void worker.terminate()
      resolvePromise(count)
    })
    worker.once('error', reject)
    worker.postMessage(payload, transferList)
  })
}

const createObjectIpcPayload = () =>
  Array.from({ length: IPC_SAMPLE_COUNT }, (_, index) => ({
    timestamp: index,
    pulse: index % 7000,
    thickness: 40 + (index % 100) / 10,
  }))

const createTypedIpcPayload = () => {
  const timestamps = new Float64Array(IPC_SAMPLE_COUNT)
  const pulses = new Int32Array(IPC_SAMPLE_COUNT)
  const thickness = new Float64Array(IPC_SAMPLE_COUNT)
  for (let index = 0; index < IPC_SAMPLE_COUNT; index += 1) {
    timestamps[index] = index
    pulses[index] = index % 7000
    thickness[index] = 40 + (index % 100) / 10
  }
  return { timestamps, pulses, thickness }
}

const getGitRevision = (): string | null => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

describe('Rust 迁移阶段 0 性能基线', () => {
  test(
    '记录生产算法与跨线程数据传输基线',
    async () => {
      const upperRotationResults = []
      for (const dataset of ['01', '02', '03', '04', '05'] as const) {
        const loaded = loadDataset(dataset)
        const segmentBuild = measureSync(
          () => buildSegments(loaded.thickness, loaded.rotation),
          WARMUP,
          REPEAT
        )
        const pointCount = segmentBuild.result.reduce(
          (sum, segment) => sum + segment.measurements.length,
          0
        )
        const estimate = measureSync(
          () =>
            estimateThetaMaxWithPhaseCorrectionDetailed(segmentBuild.result),
          WARMUP,
          REPEAT
        )
        const errorDeg = Math.abs(
          loaded.expectedThetaDeg - (estimate.result.thetaMaxDeg ?? 0)
        )

        expect(estimate.result.thetaMaxDeg).not.toBeNull()
        upperRotationResults.push({
          dataset,
          inputRows: loaded.rotation.length,
          segmentCount: segmentBuild.result.length,
          pointCount,
          expectedThetaDeg: loaded.expectedThetaDeg,
          actualThetaDeg: estimate.result.thetaMaxDeg,
          errorDeg,
          withinFiveDegreeTolerance: errorDeg < 5,
          segmentBuild: {
            timing: segmentBuild.timing,
            memoryDelta: segmentBuild.memoryDelta,
          },
          estimate: {
            timing: estimate.timing,
            memoryDelta: estimate.memoryDelta,
            diagnostics: estimate.result.diagnostics,
          },
        })
      }

      const bubbleParams: BubbleSimulatorParams = {
        baseThickness: 50,
        lowFreqAmplitude: 5,
        lowFreqHarmonics: 2,
        highFreqAmplitude: 1.5,
        highFreqHarmonics: 12,
        noiseStdDev: 0.3,
        seed: 42,
      }
      const measurementParams: MeasurementSimulatorParams = {
        membraneWidthMm: 300,
        rotationSpeedDegPerSec: 10,
        scanPeriodSec: 5,
        numScanPoints: 200,
        transportDelaySec: 30,
        totalTimeSec: 72,
        processDeformationFactor: 1.02,
        measurementNoiseStdDev: 0.3,
      }
      const expectedProfile = generateBubbleProfile(bubbleParams, 360)
      const measurements = simulateMeasurements(
        expectedProfile,
        measurementParams
      )
      const bubbleResults = []
      for (const solverMode of ['batch', 'rls'] as const) {
        const reconstruction = measureSync(
          () =>
            reconstructBubbleThickness(
              measurements,
              measurementParams.membraneWidthMm,
              {
                numBins: 360,
                solverMode,
                lambda: 1e-4,
                mu: 0.1,
                forgettingFactor: 0.995,
                smoothMu: 0.1,
                processDeformationFactor:
                  measurementParams.processDeformationFactor,
              }
            ),
          WARMUP,
          REPEAT
        )
        const rmse = computeRmse(reconstruction.result.profile, expectedProfile)
        expect(Number.isFinite(rmse)).toBe(true)
        expect(reconstruction.result.profile.every(Number.isFinite)).toBe(true)
        bubbleResults.push({
          solverMode,
          measurementCount: measurements.length,
          numBins: 360,
          rmse,
          timing: reconstruction.timing,
          memoryDelta: reconstruction.memoryDelta,
        })
      }

      const objectIpc = await measureAsync(
        async () => {
          const payload = createObjectIpcPayload()
          return runWorkerRoundTrip(payload)
        },
        WARMUP,
        REPEAT
      )
      const typedTransferIpc = await measureAsync(
        async () => {
          const payload = createTypedIpcPayload()
          return runWorkerRoundTrip(payload, [
            payload.timestamps.buffer,
            payload.pulses.buffer,
            payload.thickness.buffer,
          ])
        },
        WARMUP,
        REPEAT
      )
      expect(objectIpc.result).toBe(IPC_SAMPLE_COUNT)
      expect(typedTransferIpc.result).toBe(IPC_SAMPLE_COUNT)

      const cpuList = cpus()
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        gitRevision: getGitRevision(),
        configuration: {
          warmup: WARMUP,
          repeat: REPEAT,
          ipcSampleCount: IPC_SAMPLE_COUNT,
          garbageCollectionExposed: typeof global.gc === 'function',
        },
        environment: {
          hostname: hostname(),
          platform: platform(),
          osRelease: release(),
          architecture: process.arch,
          node: process.version,
          v8: process.versions.v8,
          vitestPool: 'forks',
          cpuModel: cpuList[0]?.model ?? 'unknown',
          logicalCpuCount: cpuList.length,
          totalMemoryBytes: totalmem(),
          freeMemoryBytesAtReport: freemem(),
        },
        upperRotation: upperRotationResults,
        correctness: {
          upperRotationAllWithinFiveDegrees: upperRotationResults.every(
            (result) => result.withinFiveDegreeTolerance
          ),
          failingUpperRotationDatasets: upperRotationResults
            .filter((result) => !result.withinFiveDegreeTolerance)
            .map((result) => result.dataset),
        },
        bubbleReconstruction: bubbleResults,
        workerThreadIpc: {
          sampleCount: IPC_SAMPLE_COUNT,
          objectStructuredClone: {
            timing: objectIpc.timing,
            memoryDelta: objectIpc.memoryDelta,
          },
          typedArrayTransfer: {
            timing: typedTransferIpc.timing,
            memoryDelta: typedTransferIpc.memoryDelta,
          },
        },
      }

      mkdirSync(OUTPUT_DIR, { recursive: true })
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      console.log(`阶段 0 性能基线已写入: ${OUTPUT_PATH}`)
      if (!report.correctness.upperRotationAllWithinFiveDegrees) {
        console.warn(
          `上旋精度基线未达标: ${report.correctness.failingUpperRotationDatasets.join(', ')}`
        )
      }
    },
    10 * 60_000
  )
})
