import { appendFile, mkdir } from 'node:fs/promises'
import { isAbsolute, dirname } from 'node:path'
import type { UpperRotationRustShadowTelemetry } from '../../../packages/AirRingServer/electron'

const DEFAULT_EVERY_N = 1
const DEFAULT_MAX_RUNS = 100
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3
const DEFAULT_MAX_DELTA_DEG = 1e-9

export const RUST_SHADOW_OBSERVATION_ENV = {
  everyN: 'AIR_RING_RUST_SHADOW_EVERY_N',
  maxRuns: 'AIR_RING_RUST_SHADOW_MAX_RUNS',
  maxConsecutiveFailures: 'AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES',
  maxDeltaDeg: 'AIR_RING_RUST_SHADOW_MAX_DELTA_DEG',
  logPath: 'AIR_RING_RUST_SHADOW_LOG_PATH',
} as const

export type RustShadowObservationPolicy = {
  everyN: number
  maxRuns: number
  maxConsecutiveFailures: number
  maxDeltaDeg: number
}

export type RustShadowObservationState =
  'active' | 'maxRunsReached' | 'circuitOpen'

export type RustShadowObservationSnapshot = RustShadowObservationPolicy & {
  state: RustShadowObservationState
  requestCount: number
  runCount: number
  consecutiveFailures: number
}

export type RustShadowObservationRecord = {
  schemaVersion: 1
  recordedAt: string
  processId: number
  observation: RustShadowObservationSnapshot
  telemetry: UpperRotationRustShadowTelemetry
}

export type RustShadowObservationConfiguration = {
  policy: RustShadowObservationPolicy
  logPath?: string
}

export type RustShadowObservationEnvironment = Readonly<
  Record<string, string | undefined>
>

export type RustShadowObservationController = {
  shouldRun: () => boolean
  record: (
    telemetry: UpperRotationRustShadowTelemetry
  ) => RustShadowObservationSnapshot
  snapshot: () => RustShadowObservationSnapshot
}

export type RustShadowTelemetryWriter = {
  write: (record: RustShadowObservationRecord) => void
  flush: () => Promise<void>
}

const resolveBoundedInteger = (
  raw: string | undefined,
  name: string,
  fallback: number,
  max: number
): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} 必须是 1–${max} 的整数`)
  }
  return parsed
}

const resolveMaxDeltaDeg = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_DELTA_DEG
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 360) {
    throw new Error(
      `${RUST_SHADOW_OBSERVATION_ENV.maxDeltaDeg} 必须是 0–360 的有限数值`
    )
  }
  return parsed
}

export const resolveRustShadowObservationConfiguration = (
  env: RustShadowObservationEnvironment = process.env
): RustShadowObservationConfiguration => {
  const rawLogPath = env[RUST_SHADOW_OBSERVATION_ENV.logPath]?.trim()
  if (rawLogPath && !isAbsolute(rawLogPath)) {
    throw new Error(`${RUST_SHADOW_OBSERVATION_ENV.logPath} 必须是绝对路径`)
  }

  return {
    policy: {
      everyN: resolveBoundedInteger(
        env[RUST_SHADOW_OBSERVATION_ENV.everyN],
        RUST_SHADOW_OBSERVATION_ENV.everyN,
        DEFAULT_EVERY_N,
        10_000
      ),
      maxRuns: resolveBoundedInteger(
        env[RUST_SHADOW_OBSERVATION_ENV.maxRuns],
        RUST_SHADOW_OBSERVATION_ENV.maxRuns,
        DEFAULT_MAX_RUNS,
        1_000_000
      ),
      maxConsecutiveFailures: resolveBoundedInteger(
        env[RUST_SHADOW_OBSERVATION_ENV.maxConsecutiveFailures],
        RUST_SHADOW_OBSERVATION_ENV.maxConsecutiveFailures,
        DEFAULT_MAX_CONSECUTIVE_FAILURES,
        100
      ),
      maxDeltaDeg: resolveMaxDeltaDeg(
        env[RUST_SHADOW_OBSERVATION_ENV.maxDeltaDeg]
      ),
    },
    ...(rawLogPath ? { logPath: rawLogPath } : {}),
  }
}

export const createRustShadowObservationController = (
  policy: RustShadowObservationPolicy
): RustShadowObservationController => {
  let state: RustShadowObservationState = 'active'
  let requestCount = 0
  let runCount = 0
  let consecutiveFailures = 0

  const snapshot = (): RustShadowObservationSnapshot => ({
    ...policy,
    state,
    requestCount,
    runCount,
    consecutiveFailures,
  })

  const shouldRun = (): boolean => {
    requestCount += 1
    if (state !== 'active') return false
    return (requestCount - 1) % policy.everyN === 0
  }

  const record = (
    telemetry: UpperRotationRustShadowTelemetry
  ): RustShadowObservationSnapshot => {
    runCount += 1
    const unhealthy =
      telemetry.status !== 'success' ||
      telemetry.absoluteAngleDeltaDeg === null ||
      telemetry.absoluteAngleDeltaDeg > policy.maxDeltaDeg
    consecutiveFailures = unhealthy ? consecutiveFailures + 1 : 0

    if (consecutiveFailures >= policy.maxConsecutiveFailures) {
      state = 'circuitOpen'
    } else if (runCount >= policy.maxRuns) {
      state = 'maxRunsReached'
    }
    return snapshot()
  }

  return { shouldRun, record, snapshot }
}

export const createRustShadowTelemetryWriter = (
  logPath: string | undefined,
  onError: (error: Error) => void = () => undefined
): RustShadowTelemetryWriter => {
  let pending = Promise.resolve()
  let directoryReady = false

  const write = (record: RustShadowObservationRecord) => {
    if (!logPath) return
    pending = pending
      .then(async () => {
        if (!directoryReady) {
          await mkdir(dirname(logPath), { recursive: true })
          directoryReady = true
        }
        await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8')
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)))
      })
  }

  return {
    write,
    flush: () => pending,
  }
}

export const createRustShadowObservationRecord = (
  telemetry: UpperRotationRustShadowTelemetry,
  observation: RustShadowObservationSnapshot
): RustShadowObservationRecord => ({
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  processId: process.pid,
  observation,
  telemetry,
})
