import { existsSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import type { CalibrationWorkerSuccessResponse } from '../../../../apps/AirRingSys/electron/calibrationWorker'
import { createCalibrationWorkerClient } from '../../../../apps/AirRingSys/electron/calibrationWorkerClient'
import { loadTripSegments } from './upperRotationNativeFixtures'

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

describe.sequential('Rust shadow 实际 Worker 受控观测', () => {
  test('确定性采样、次数上限和 shutdown flush 生效', async () => {
    expect(existsSync(WORKER_PATH)).toBe(true)
    expect(existsSync(NATIVE_PATH)).toBe(true)
    const outputDir = await mkdtemp(join(tmpdir(), 'air-ring-shadow-worker-'))
    const outputPath = join(outputDir, 'shadow.ndjson')
    const client = createCalibrationWorkerClient({
      workerPath: pathToFileURL(WORKER_PATH),
      workerOptions: {
        env: {
          ...process.env,
          AIR_RING_RUST_SHADOW: '1',
          AIR_RING_RUST_SHADOW_THREADS: '4',
          AIR_RING_RUST_NATIVE_PATH: NATIVE_PATH,
          AIR_RING_RUST_SHADOW_EVERY_N: '2',
          AIR_RING_RUST_SHADOW_MAX_RUNS: '3',
          AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES: '3',
          AIR_RING_RUST_SHADOW_MAX_DELTA_DEG: '0.000000001',
          AIR_RING_RUST_SHADOW_LOG_PATH: outputPath,
        },
        stdout: true,
        stderr: true,
      },
      onWorkerCreated: (worker) => {
        worker.stdout?.resume()
        worker.stderr?.resume()
      },
    })
    const tripSegments = loadTripSegments('01')
    const responses: CalibrationWorkerSuccessResponse[] = []

    try {
      for (let index = 0; index < 7; index += 1) {
        responses.push(
          await client.run({
            tripSegments,
            options: { deltaRange: { min: 180, max: 360, step: 1 } },
          })
        )
      }
    } finally {
      await client.shutdown()
    }

    expect(client.getWorkerCreateCount()).toBe(1)
    expect(new Set(responses.map((response) => response.maxAngle)).size).toBe(1)
    expect(
      responses.map((response) => response.rustShadow !== undefined)
    ).toEqual([true, false, true, false, true, false, false])
    expect(
      responses
        .filter((response) => response.rustShadow)
        .every(
          (response) =>
            response.rustShadow?.status === 'success' &&
            response.rustShadow.threadLimit === 4 &&
            (response.rustShadow.absoluteAngleDeltaDeg ?? Infinity) <= 1e-9
        )
    ).toBe(true)

    const serialized = await readFile(outputPath, 'utf8')
    const records = serialized
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(records).toHaveLength(3)
    expect(records.at(-1)?.observation).toMatchObject({
      state: 'maxRunsReached',
      requestCount: 5,
      runCount: 3,
    })
    expect(serialized).not.toContain('measurements')
    expect(serialized).not.toContain('tripSegments')
    expect(serialized).not.toContain('samplesMs')
  }, 120_000)
})
