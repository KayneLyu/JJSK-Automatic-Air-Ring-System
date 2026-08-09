/**
 * 膜泡重建 Worker 线程
 *
 * 使用持久 Worker 串行执行重建。Rust Batch shadow/primary 默认关闭；primary
 * 失败时在同一请求内完整重跑 TypeScript。RLS 始终使用 TypeScript。
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parentPort } from 'node:worker_threads'
import {
  compareBubbleProfiles,
  createBubbleRustShadowFailure,
  reconstructBubbleThickness,
  reconstructBubbleThicknessWithBatchSolver,
  solveBatch,
  solveBubbleBatchWithNative,
  type BubbleNativeBinding,
  type BubbleReconstructionOptions,
  type BubbleReconstructionResult,
  type BubbleRustPrimaryTelemetry,
  type BubbleRustShadowTelemetry,
  type MeasurementTriple,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'

const BUBBLE_RUST_SHADOW_FLAG = 'AIR_RING_BUBBLE_RUST_SHADOW'
const BUBBLE_RUST_PRIMARY_FLAG = 'AIR_RING_BUBBLE_RUST_PRIMARY'
const BUBBLE_RUST_PRIMARY_DISABLE_FLAG = 'AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE'
const RUST_NATIVE_PATH = 'AIR_RING_RUST_NATIVE_PATH'
const NATIVE_FILE_NAME = 'air-ring-native.win32-x64-msvc.node'
const moduleDirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

export type BubbleWorkerRequest = {
  id: number
  type: 'reconstruct'
  triples: MeasurementTriple[]
  membraneWidthMm: number
  options?: BubbleReconstructionOptions
}

export type BubbleWorkerShutdownRequest = {
  id: number
  type: 'shutdown'
}

export type BubbleWorkerMessage =
  BubbleWorkerRequest | BubbleWorkerShutdownRequest

export type BubbleWorkerResponse =
  | {
      id: number
      type: 'reconstruct'
      ok: true
      result: BubbleReconstructionResult
      rustPrimary?: BubbleRustPrimaryTelemetry
      rustShadow?: BubbleRustShadowTelemetry
    }
  | { id: number; type: 'reconstruct'; ok: false; error: string }

export type BubbleWorkerShutdownResponse = {
  id: number
  type: 'shutdown'
  ok: true
}

export type BubbleWorkerMessageResponse =
  BubbleWorkerResponse | BubbleWorkerShutdownResponse

export type BubbleWorkerRuntime = {
  rustShadowEnabled: boolean
  rustPrimaryEnabled?: boolean
  loadNativeBinding: () => BubbleNativeBinding
  logTelemetry: (telemetry: BubbleRustShadowTelemetry) => void
  logPrimaryTelemetry?: (telemetry: BubbleRustPrimaryTelemetry) => void
}

export const resolveBubbleRustPrimaryEnabled = (
  environment: NodeJS.ProcessEnv
): boolean =>
  environment[BUBBLE_RUST_PRIMARY_FLAG] === '1' &&
  environment[BUBBLE_RUST_PRIMARY_DISABLE_FLAG] !== '1'

const resolveNativeCandidates = () => {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
    .resourcesPath
  return [
    process.env[RUST_NATIVE_PATH],
    resourcesPath ? join(resourcesPath, 'native', NATIVE_FILE_NAME) : undefined,
    join(moduleDirname, '../../../packages/AirRingNative', NATIVE_FILE_NAME),
  ].filter((candidate): candidate is string => Boolean(candidate))
}

export const loadBubbleNativeBinding = (): BubbleNativeBinding => {
  const errors: string[] = []
  for (const candidate of resolveNativeCandidates()) {
    if (!existsSync(candidate)) {
      errors.push(`${candidate}: 文件不存在`)
      continue
    }
    try {
      const binding = require(candidate) as Partial<BubbleNativeBinding>
      if (typeof binding.solveBubbleBatch !== 'function') {
        throw new Error('Native binding 缺少 solveBubbleBatch 导出')
      }
      return binding as BubbleNativeBinding
    } catch (error) {
      errors.push(
        `${candidate}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  throw new Error(`无法加载膜泡 Rust Native binding: ${errors.join(' | ')}`)
}

const createDefaultRuntime = (): BubbleWorkerRuntime => {
  let cachedBinding: BubbleNativeBinding | undefined
  const rustPrimaryEnabled = resolveBubbleRustPrimaryEnabled(process.env)
  return {
    rustShadowEnabled:
      !rustPrimaryEnabled && process.env[BUBBLE_RUST_SHADOW_FLAG] === '1',
    rustPrimaryEnabled,
    loadNativeBinding: () => {
      cachedBinding ??= loadBubbleNativeBinding()
      return cachedBinding
    },
    logTelemetry: (telemetry) => {
      const message = `[BubbleWorker][RustShadow] ${JSON.stringify(telemetry)}`
      if (telemetry.status === 'success') console.info(message)
      else console.warn(message)
    },
    logPrimaryTelemetry: (telemetry) => {
      const message = `[BubbleWorker][RustPrimary] ${JSON.stringify(telemetry)}`
      if (telemetry.status === 'success') console.info(message)
      else console.warn(message)
    },
  }
}

const isBatchRequest = (request: BubbleWorkerRequest): boolean =>
  (request.options?.solverMode ?? 'batch') === 'batch'

export const handleBubbleWorkerRequest = (
  request: BubbleWorkerRequest,
  runtime: BubbleWorkerRuntime = createDefaultRuntime()
): BubbleWorkerResponse => {
  try {
    if (runtime.rustPrimaryEnabled && isBatchRequest(request)) {
      const primaryStartedAt = performance.now()
      let rustSolveMs = 0
      try {
        const binding = runtime.loadNativeBinding()
        const rustTotalStartedAt = performance.now()
        const result = reconstructBubbleThicknessWithBatchSolver(
          request.triples,
          request.membraneWidthMm,
          request.options,
          (sparse, lambda, mu) => {
            const startedAt = performance.now()
            try {
              return solveBubbleBatchWithNative(binding, sparse, lambda, mu)
            } finally {
              rustSolveMs += performance.now() - startedAt
            }
          }
        )
        const rustPrimary: BubbleRustPrimaryTelemetry = {
          schemaVersion: 1,
          status: 'success',
          numBins: result.numBins,
          measurementCount: result.numMeasurements,
          rustSolveMs,
          rustTotalMs: performance.now() - rustTotalStartedAt,
          fallbackTsTotalMs: null,
          totalPrimaryMs: performance.now() - primaryStartedAt,
          error: null,
        }
        runtime.logPrimaryTelemetry?.(rustPrimary)
        return {
          id: request.id,
          type: 'reconstruct',
          ok: true,
          result,
          rustPrimary,
        }
      } catch (error) {
        const fallbackStartedAt = performance.now()
        const result = reconstructBubbleThickness(
          request.triples,
          request.membraneWidthMm,
          request.options
        )
        const rustPrimary: BubbleRustPrimaryTelemetry = {
          schemaVersion: 1,
          status: 'fallback',
          numBins: result.numBins,
          measurementCount: result.numMeasurements,
          rustSolveMs: null,
          rustTotalMs: null,
          fallbackTsTotalMs: performance.now() - fallbackStartedAt,
          totalPrimaryMs: performance.now() - primaryStartedAt,
          error: (error instanceof Error ? error.message : String(error)).slice(
            0,
            500
          ),
        }
        runtime.logPrimaryTelemetry?.(rustPrimary)
        return {
          id: request.id,
          type: 'reconstruct',
          ok: true,
          result,
          rustPrimary,
        }
      }
    }

    if (!runtime.rustShadowEnabled || !isBatchRequest(request)) {
      return {
        id: request.id,
        type: 'reconstruct',
        ok: true,
        result: reconstructBubbleThickness(
          request.triples,
          request.membraneWidthMm,
          request.options
        ),
      }
    }

    let tsSolveMs = 0
    const tsTotalStartedAt = performance.now()
    const result = reconstructBubbleThicknessWithBatchSolver(
      request.triples,
      request.membraneWidthMm,
      request.options,
      (sparse, lambda, mu) => {
        const startedAt = performance.now()
        try {
          return solveBatch(sparse, lambda, mu)
        } finally {
          tsSolveMs += performance.now() - startedAt
        }
      }
    )
    const tsTotalMs = performance.now() - tsTotalStartedAt

    const shadowStartedAt = performance.now()
    let binding: BubbleNativeBinding
    try {
      binding = runtime.loadNativeBinding()
    } catch (error) {
      const rustShadow = createBubbleRustShadowFailure({
        status: 'loadError',
        numBins: result.numBins,
        measurementCount: result.numMeasurements,
        tsSolveMs,
        tsTotalMs,
        totalShadowMs: performance.now() - shadowStartedAt,
        error,
      })
      runtime.logTelemetry(rustShadow)
      return {
        id: request.id,
        type: 'reconstruct',
        ok: true,
        result,
        rustShadow,
      }
    }

    let rustSolveMs = 0
    try {
      const rustTotalStartedAt = performance.now()
      const rustResult = reconstructBubbleThicknessWithBatchSolver(
        request.triples,
        request.membraneWidthMm,
        request.options,
        (sparse, lambda, mu) => {
          const startedAt = performance.now()
          try {
            return solveBubbleBatchWithNative(binding, sparse, lambda, mu)
          } finally {
            rustSolveMs += performance.now() - startedAt
          }
        }
      )
      const rustTotalMs = performance.now() - rustTotalStartedAt
      const comparison = compareBubbleProfiles(
        result.profile,
        rustResult.profile
      )
      const rustShadow: BubbleRustShadowTelemetry = {
        schemaVersion: 1,
        status: 'success',
        numBins: result.numBins,
        measurementCount: result.numMeasurements,
        tsSolveMs,
        rustSolveMs,
        tsTotalMs,
        rustTotalMs,
        totalShadowMs: performance.now() - shadowStartedAt,
        ...comparison,
        error: null,
      }
      runtime.logTelemetry(rustShadow)
      return {
        id: request.id,
        type: 'reconstruct',
        ok: true,
        result,
        rustShadow,
      }
    } catch (error) {
      const rustShadow = createBubbleRustShadowFailure({
        status: 'executionError',
        numBins: result.numBins,
        measurementCount: result.numMeasurements,
        tsSolveMs,
        tsTotalMs,
        totalShadowMs: performance.now() - shadowStartedAt,
        error,
      })
      runtime.logTelemetry(rustShadow)
      return {
        id: request.id,
        type: 'reconstruct',
        ok: true,
        result,
        rustShadow,
      }
    }
  } catch (error) {
    return {
      id: request.id,
      type: 'reconstruct',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const workerParentPort = parentPort
const workerRuntime = workerParentPort ? createDefaultRuntime() : undefined
workerParentPort?.on('message', (request: BubbleWorkerMessage) => {
  if (request.type === 'shutdown') {
    workerParentPort.postMessage({
      id: request.id,
      type: 'shutdown',
      ok: true,
    } satisfies BubbleWorkerShutdownResponse)
    workerParentPort.close()
    return
  }
  workerParentPort.postMessage(
    handleBubbleWorkerRequest(request, workerRuntime)
  )
})
