/**
 * 上旋角度算法 Worker 线程
 *
 * 运行在独立的 Node.js worker_threads 线程中，
 * 接收 tripSegments + options，执行 CPU 密集型的
 * estimateThetaMaxWithPhaseCorrection，并将结果 postMessage 回主线程。
 *
 * 这样主进程事件循环不会被 10s 量级的算法阻塞，ADBox 1ms 推送可持续正常接收。
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parentPort } from 'node:worker_threads'
import {
  createRustShadowObservationController,
  createRustShadowObservationRecord,
  createRustShadowTelemetryWriter,
  resolveRustShadowObservationConfiguration,
  type RustShadowObservationSnapshot,
} from './calibrationRustShadowObservation'
import {
  createUpperRotationRustShadowFailure,
  createUpperRotationNativeSearchBackend,
  estimateThetaMaxWithPhaseCorrectionDetailed,
  runUpperRotationRustShadow,
  type TripSegment,
  type UpperRotationNativeBinding,
  type UpperRotationObjectiveMode,
  type UpperRotationRustShadowTelemetry,
} from '../../../packages/AirRingServer/electron'

const RUST_SHADOW_FLAG = 'AIR_RING_RUST_SHADOW'
const RUST_PRIMARY_FLAG = 'AIR_RING_RUST_PRIMARY'
const RUST_PRIMARY_DISABLE_FLAG = 'AIR_RING_RUST_PRIMARY_DISABLE'
const RUST_SHADOW_THREADS = 'AIR_RING_RUST_SHADOW_THREADS'
const RUST_PRIMARY_THREADS = 'AIR_RING_RUST_PRIMARY_THREADS'
const RUST_NATIVE_PATH = 'AIR_RING_RUST_NATIVE_PATH'
const NATIVE_FILE_NAME = 'air-ring-native.win32-x64-msvc.node'
const MAX_RUST_THREADS = 32
const DEFAULT_RUST_THREADS = Math.max(1, Math.min(4, availableParallelism()))
const moduleDirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export type CalibrationWorkerRequest = {
  id: number
  tripSegments: TripSegment[]
  options: {
    deltaRange: { min: number; max: number; step: number }
    objectiveMode?: UpperRotationObjectiveMode
  }
}

export type CalibrationWorkerResponse =
  | {
      id: number
      ok: true
      maxAngle: number
      rustShadow?: UpperRotationRustShadowTelemetry
      rustPrimary?: UpperRotationRustPrimaryTelemetry
    }
  | { id: number; ok: false; error: string }

export type CalibrationWorkerSuccessResponse = Extract<
  CalibrationWorkerResponse,
  { ok: true }
>

export type CalibrationWorkerShutdownRequest = {
  id: number
  type: 'shutdown'
}

export type CalibrationWorkerShutdownResponse = {
  id: number
  type: 'shutdown'
  ok: true
}

export type CalibrationWorkerMessage =
  CalibrationWorkerRequest | CalibrationWorkerShutdownRequest

export type CalibrationWorkerMessageResponse =
  CalibrationWorkerResponse | CalibrationWorkerShutdownResponse

const isCalibrationWorkerShutdownRequest = (
  request: CalibrationWorkerMessage
): request is CalibrationWorkerShutdownRequest =>
  'type' in request && request.type === 'shutdown'

export type CalibrationWorkerRuntime = {
  rustShadowEnabled: boolean
  rustPrimaryEnabled?: boolean
  threadLimit: number
  configurationError?: string
  loadNativeBinding: () => UpperRotationNativeBinding
  shouldRunRustShadow?: () => boolean
  recordRustShadowTelemetry?: (
    telemetry: UpperRotationRustShadowTelemetry
  ) => RustShadowObservationSnapshot
  logTelemetry: (
    telemetry: UpperRotationRustShadowTelemetry,
    observation?: RustShadowObservationSnapshot
  ) => void
  flushTelemetry?: () => Promise<void>
}

export type UpperRotationRustPrimaryTelemetry = {
  schemaVersion: 1
  status: 'success' | 'fallback'
  finalThetaDeg: number | null
  elapsedMs: number
  threadLimit: number
  error: string | null
}

const resolveRustThreadLimit = (
  raw: string | undefined,
  variableName: string
): number => {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RUST_THREADS
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_RUST_THREADS) {
    throw new Error(`${variableName} 必须是 1–32 的整数`)
  }
  return parsed
}

export const resolveRustShadowThreadLimit = (raw: string | undefined): number =>
  resolveRustThreadLimit(raw, RUST_SHADOW_THREADS)

export const resolveRustPrimaryThreadLimit = (
  raw: string | undefined
): number => resolveRustThreadLimit(raw, RUST_PRIMARY_THREADS)

export const resolveRustPrimaryEnabled = (
  environment: NodeJS.ProcessEnv
): boolean =>
  environment[RUST_PRIMARY_FLAG] === '1' &&
  environment[RUST_PRIMARY_DISABLE_FLAG] !== '1'

const resolveNativeCandidates = () => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath
  return [
    process.env[RUST_NATIVE_PATH],
    resourcesPath ? join(resourcesPath, 'native', NATIVE_FILE_NAME) : undefined,
    join(moduleDirname, '../../../packages/AirRingNative', NATIVE_FILE_NAME),
  ].filter((candidate): candidate is string => Boolean(candidate))
}

export const loadUpperRotationNativeBinding =
  (): UpperRotationNativeBinding => {
    const errors: string[] = []
    for (const candidate of resolveNativeCandidates()) {
      if (!existsSync(candidate)) {
        errors.push(`${candidate}: 文件不存在`)
        continue
      }
      try {
        const binding = require(
          candidate
        ) as Partial<UpperRotationNativeBinding>
        if (
          typeof binding.configureThreadPool !== 'function' ||
          typeof binding.evaluateDirect !== 'function' ||
          typeof binding.evaluateExpanded !== 'function' ||
          typeof binding.searchBestDirect !== 'function' ||
          typeof binding.searchBestExpanded !== 'function'
        ) {
          throw new Error('Native binding 缺少阶段 2 所需导出')
        }
        return binding as UpperRotationNativeBinding
      } catch (error) {
        errors.push(
          `${candidate}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    throw new Error(`无法加载 Rust Native binding: ${errors.join(' | ')}`)
  }

const createDefaultRuntime = (): CalibrationWorkerRuntime => {
  const rustShadowEnabled = process.env[RUST_SHADOW_FLAG] === '1'
  const rustPrimaryEnabled = resolveRustPrimaryEnabled(process.env)
  let threadLimit = DEFAULT_RUST_THREADS
  let configurationError: string | undefined
  let observationConfiguration = resolveRustShadowObservationConfiguration({})
  if (rustShadowEnabled || rustPrimaryEnabled) {
    try {
      threadLimit = rustPrimaryEnabled
        ? resolveRustPrimaryThreadLimit(process.env[RUST_PRIMARY_THREADS])
        : resolveRustShadowThreadLimit(process.env[RUST_SHADOW_THREADS])
    } catch (error) {
      configurationError =
        error instanceof Error ? error.message : String(error)
    }
  }
  if (rustShadowEnabled) {
    try {
      observationConfiguration = resolveRustShadowObservationConfiguration(
        process.env
      )
    } catch (error) {
      configurationError =
        error instanceof Error ? error.message : String(error)
    }
  }
  const observation = createRustShadowObservationController(
    observationConfiguration.policy
  )
  const telemetryWriter = createRustShadowTelemetryWriter(
    observationConfiguration.logPath,
    (error) => {
      console.warn(
        `[CalibrationWorker][RustShadow] telemetry 写入失败: ${error.message}`
      )
    }
  )

  return {
    rustShadowEnabled,
    rustPrimaryEnabled,
    threadLimit,
    ...(configurationError ? { configurationError } : {}),
    loadNativeBinding: loadUpperRotationNativeBinding,
    shouldRunRustShadow: observation.shouldRun,
    recordRustShadowTelemetry: observation.record,
    logTelemetry: (telemetry, observationSnapshot) => {
      const record = observationSnapshot
        ? createRustShadowObservationRecord(telemetry, observationSnapshot)
        : undefined
      const message = `[CalibrationWorker][RustShadow] ${JSON.stringify(record ?? telemetry)}`
      if (telemetry.status === 'success') {
        console.info(message)
      } else {
        console.warn(message)
      }
      if (record) {
        telemetryWriter.write(record)
      }
    },
    flushTelemetry: telemetryWriter.flush,
  }
}

export const handleCalibrationWorkerRequest = (
  req: CalibrationWorkerRequest,
  runtime: CalibrationWorkerRuntime = createDefaultRuntime()
): CalibrationWorkerResponse => {
  try {
    let rustPrimary: UpperRotationRustPrimaryTelemetry | undefined
    let estimate: ReturnType<typeof estimateThetaMaxWithPhaseCorrectionDetailed>
    if (runtime.rustPrimaryEnabled) {
      const startedAt = performance.now()
      try {
        if (runtime.configurationError) {
          throw new Error(runtime.configurationError)
        }
        const searchBackend = createUpperRotationNativeSearchBackend(
          runtime.loadNativeBinding(),
          runtime.threadLimit
        )
        const nativeEstimate = estimateThetaMaxWithPhaseCorrectionDetailed(
          req.tripSegments,
          { ...req.options, searchBackend }
        )
        const { min, max } = req.options.deltaRange
        if (
          nativeEstimate.thetaMaxDeg === null ||
          !Number.isFinite(nativeEstimate.thetaMaxDeg) ||
          nativeEstimate.thetaMaxDeg < min ||
          nativeEstimate.thetaMaxDeg > max ||
          (nativeEstimate.diagnostics.objectiveUsed !== 'direct' &&
            nativeEstimate.diagnostics.objectiveUsed !== 'expanded')
        ) {
          throw new Error(
            `Native 主路径未返回有效扫描估算（原因=${nativeEstimate.diagnostics.rejectReason ?? nativeEstimate.diagnostics.objectiveUsed ?? 'unknown'}）`
          )
        }
        estimate = nativeEstimate
        rustPrimary = {
          schemaVersion: 1,
          status: 'success',
          finalThetaDeg: nativeEstimate.thetaMaxDeg,
          elapsedMs: performance.now() - startedAt,
          threadLimit: runtime.threadLimit,
          error: null,
        }
        console.info(
          `[CalibrationWorker][RustPrimary] ${JSON.stringify(rustPrimary)}`
        )
      } catch (error) {
        estimate = estimateThetaMaxWithPhaseCorrectionDetailed(
          req.tripSegments,
          req.options
        )
        rustPrimary = {
          schemaVersion: 1,
          status: 'fallback',
          finalThetaDeg: estimate.thetaMaxDeg,
          elapsedMs: performance.now() - startedAt,
          threadLimit: runtime.threadLimit,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            500
          ),
        }
        console.warn(
          `[CalibrationWorker][RustPrimary] ${JSON.stringify(rustPrimary)}`
        )
      }
    } else {
      estimate = estimateThetaMaxWithPhaseCorrectionDetailed(
        req.tripSegments,
        req.options
      )
    }
    let rustShadow: UpperRotationRustShadowTelemetry | undefined
    if (
      runtime.rustShadowEnabled &&
      !runtime.rustPrimaryEnabled &&
      (runtime.shouldRunRustShadow?.() ?? true)
    ) {
      if (runtime.configurationError) {
        rustShadow = createUpperRotationRustShadowFailure(
          estimate,
          runtime.threadLimit,
          'executionError',
          runtime.configurationError
        )
      } else {
        try {
          rustShadow = runUpperRotationRustShadow(
            req.tripSegments,
            estimate,
            runtime.loadNativeBinding(),
            {
              threadLimit: runtime.threadLimit,
              estimateOptions: req.options,
            }
          )
        } catch (error) {
          rustShadow = createUpperRotationRustShadowFailure(
            estimate,
            runtime.threadLimit,
            'loadError',
            error
          )
        }
      }
      const observation = runtime.recordRustShadowTelemetry?.(rustShadow)
      runtime.logTelemetry(rustShadow, observation)
    }

    const response: CalibrationWorkerResponse =
      estimate.thetaMaxDeg != null
        ? {
            id: req.id,
            ok: true,
            maxAngle: estimate.thetaMaxDeg,
            ...(rustShadow ? { rustShadow } : {}),
            ...(rustPrimary ? { rustPrimary } : {}),
          }
        : {
            id: req.id,
            ok: false,
            error: `角度估算被拒绝（原因=${estimate.diagnostics.rejectReason ?? 'signalInsufficient'}，完整行程=${estimate.diagnostics.completeSegments}，过滤后行程=${estimate.diagnostics.filteredSegments}，有效测点=${estimate.diagnostics.totalPoints}）`,
          }
    return response
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

const workerParentPort = parentPort
const workerRuntime = workerParentPort ? createDefaultRuntime() : undefined
workerParentPort?.on('message', async (req: CalibrationWorkerMessage) => {
  if (isCalibrationWorkerShutdownRequest(req)) {
    await workerRuntime?.flushTelemetry?.()
    workerParentPort.postMessage({
      id: req.id,
      type: 'shutdown',
      ok: true,
    } satisfies CalibrationWorkerShutdownResponse)
    workerParentPort.close()
    return
  }
  workerParentPort.postMessage(
    handleCalibrationWorkerRequest(req, workerRuntime)
  )
})
