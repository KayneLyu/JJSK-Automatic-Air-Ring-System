import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  createRustShadowObservationController,
  createRustShadowObservationRecord,
  createRustShadowTelemetryWriter,
  resolveRustShadowObservationConfiguration,
  type RustShadowObservationPolicy,
} from '../../../../apps/AirRingSys/electron/calibrationRustShadowObservation'
import type { UpperRotationRustShadowTelemetry } from '../upperRotation/upperRotation.nativeShadow'

const policy: RustShadowObservationPolicy = {
  everyN: 2,
  maxRuns: 3,
  maxConsecutiveFailures: 3,
  maxDeltaDeg: 1e-9,
}

const makeTelemetry = (
  overrides: Partial<UpperRotationRustShadowTelemetry> = {}
): UpperRotationRustShadowTelemetry => ({
  schemaVersion: 1,
  status: 'success',
  objectiveUsed: 'direct',
  productionThetaDeg: 240,
  productionBaseThetaDeg: 240,
  nativeThetaDeg: 240,
  angleDeltaDeg: 0,
  absoluteAngleDeltaDeg: 0,
  nativeLoss: 1,
  evaluations: 181,
  segmentCount: 2,
  pointCount: 4_000,
  threadLimit: 4,
  nativeElapsedMs: 10,
  totalElapsedMs: 12,
  error: null,
  ...overrides,
})

describe.sequential('Rust shadow 受控观测', () => {
  test('解析默认值、自定义值和严格边界', () => {
    const logPath = resolve('shadow.ndjson')
    expect(resolveRustShadowObservationConfiguration({})).toEqual({
      policy: {
        everyN: 1,
        maxRuns: 100,
        maxConsecutiveFailures: 3,
        maxDeltaDeg: 1e-9,
      },
    })
    expect(
      resolveRustShadowObservationConfiguration({
        AIR_RING_RUST_SHADOW_EVERY_N: '5',
        AIR_RING_RUST_SHADOW_MAX_RUNS: '20',
        AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES: '4',
        AIR_RING_RUST_SHADOW_MAX_DELTA_DEG: '0.01',
        AIR_RING_RUST_SHADOW_LOG_PATH: logPath,
      })
    ).toEqual({
      policy: {
        everyN: 5,
        maxRuns: 20,
        maxConsecutiveFailures: 4,
        maxDeltaDeg: 0.01,
      },
      logPath,
    })

    expect(() =>
      resolveRustShadowObservationConfiguration({
        AIR_RING_RUST_SHADOW_EVERY_N: '0',
      })
    ).toThrow(/1–10000/)
    expect(() =>
      resolveRustShadowObservationConfiguration({
        AIR_RING_RUST_SHADOW_MAX_DELTA_DEG: 'Infinity',
      })
    ).toThrow(/0–360/)
    expect(() =>
      resolveRustShadowObservationConfiguration({
        AIR_RING_RUST_SHADOW_LOG_PATH: 'relative.ndjson',
      })
    ).toThrow(/绝对路径/)
  })

  test('从首个请求开始确定性采样，并在达到次数上限后停止', () => {
    const controller = createRustShadowObservationController(policy)

    expect(controller.shouldRun()).toBe(true)
    controller.record(makeTelemetry())
    expect(controller.shouldRun()).toBe(false)
    expect(controller.shouldRun()).toBe(true)
    controller.record(makeTelemetry())
    expect(controller.shouldRun()).toBe(false)
    expect(controller.shouldRun()).toBe(true)
    expect(controller.record(makeTelemetry()).state).toBe('maxRunsReached')
    expect(controller.shouldRun()).toBe(false)
    expect(controller.snapshot()).toMatchObject({
      requestCount: 6,
      runCount: 3,
      state: 'maxRunsReached',
    })
  })

  test('成功会重置连续异常，连续失败或超差达到阈值后熔断', () => {
    const controller = createRustShadowObservationController({
      ...policy,
      everyN: 1,
      maxRuns: 20,
    })
    const failure = makeTelemetry({
      status: 'loadError',
      absoluteAngleDeltaDeg: null,
      error: 'binding missing',
    })
    const overDelta = makeTelemetry({
      angleDeltaDeg: 0.1,
      absoluteAngleDeltaDeg: 0.1,
    })

    controller.shouldRun()
    controller.record(failure)
    controller.shouldRun()
    expect(controller.record(failure).consecutiveFailures).toBe(2)
    controller.shouldRun()
    expect(controller.record(makeTelemetry()).consecutiveFailures).toBe(0)
    controller.shouldRun()
    controller.record(overDelta)
    controller.shouldRun()
    controller.record(overDelta)
    controller.shouldRun()
    expect(controller.record(overDelta)).toMatchObject({
      state: 'circuitOpen',
      consecutiveFailures: 3,
    })
    expect(controller.shouldRun()).toBe(false)
  })

  test('NDJSON 按序写入且写入失败与调用方隔离', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'air-ring-shadow-unit-'))
    const outputPath = join(outputDir, 'shadow.ndjson')
    const writer = createRustShadowTelemetryWriter(outputPath)
    const controller = createRustShadowObservationController({
      ...policy,
      everyN: 1,
    })

    controller.shouldRun()
    const first = makeTelemetry()
    writer.write(
      createRustShadowObservationRecord(first, controller.record(first))
    )
    controller.shouldRun()
    const second = makeTelemetry({ nativeElapsedMs: 11 })
    writer.write(
      createRustShadowObservationRecord(second, controller.record(second))
    )
    await writer.flush()

    const lines = (await readFile(outputPath, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(
      lines.map((line) => JSON.parse(line).telemetry.nativeElapsedMs)
    ).toEqual([10, 11])

    const onError = vi.fn()
    const failingWriter = createRustShadowTelemetryWriter(outputDir, onError)
    failingWriter.write(
      createRustShadowObservationRecord(first, controller.snapshot())
    )
    await expect(failingWriter.flush()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledOnce()
  })
})
