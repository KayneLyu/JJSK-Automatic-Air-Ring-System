import { Worker, type WorkerOptions } from 'node:worker_threads'
import type {
  BubbleWorkerMessageResponse,
  BubbleWorkerRequest,
  BubbleWorkerResponse,
  BubbleWorkerShutdownRequest,
} from './bubbleWorker'

const DEFAULT_TIMEOUT_MS = 30_000
const SHUTDOWN_TIMEOUT_MS = 5_000

type ReconstructionRequest = Omit<BubbleWorkerRequest, 'id'>

type PendingRequest = {
  id: number
  request: ReconstructionRequest
  resolve: (response: Extract<BubbleWorkerResponse, { ok: true }>) => void
  reject: (error: Error) => void
  timeout?: ReturnType<typeof setTimeout>
}

type ShutdownState = {
  worker: Worker
  id: number
  acknowledged: boolean
  timeout: ReturnType<typeof setTimeout>
  resolve: () => void
  reject: (error: Error) => void
}

export type BubbleWorkerClientOptions = {
  workerPath: URL
  workerOptions?: WorkerOptions
  timeoutMs?: number
  onInternalError?: (error: Error) => void
  onWorkerCreated?: (worker: Worker) => void
}

export type BubbleWorkerClient = {
  run: (
    request: ReconstructionRequest
  ) => Promise<Extract<BubbleWorkerResponse, { ok: true }>>
  shutdown: () => Promise<void>
  isBusy: () => boolean
  getQueueLength: () => number
  getWorkerCreateCount: () => number
}

const toError = (error: unknown, prefix: string): Error =>
  error instanceof Error
    ? new Error(`${prefix}: ${error.message}`, { cause: error })
    : new Error(`${prefix}: ${String(error)}`)

export const createBubbleWorkerClient = (
  options: BubbleWorkerClientOptions
): BubbleWorkerClient => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Bubble Worker timeoutMs 必须是正数')
  }

  const queue: PendingRequest[] = []
  let worker: Worker | null = null
  let activeRequest: PendingRequest | null = null
  let shutdownState: ShutdownState | null = null
  let retiringWorker: Promise<void> | null = null
  let nextId = 0
  let workerCreateCount = 0

  const reportInternalError = (error: Error) => options.onInternalError?.(error)

  const settleActiveRequest = (
    outcome:
      | { response: Extract<BubbleWorkerResponse, { ok: true }> }
      | { error: Error }
  ) => {
    const request = activeRequest
    if (!request) return
    activeRequest = null
    if (request.timeout) clearTimeout(request.timeout)
    if ('response' in outcome) request.resolve(outcome.response)
    else request.reject(outcome.error)
  }

  const dispatchNext = () => {
    if (
      activeRequest ||
      shutdownState ||
      retiringWorker ||
      queue.length === 0
    ) {
      return
    }

    const request = queue.shift()
    if (!request) return

    let currentWorker: Worker
    try {
      currentWorker = ensureWorker()
    } catch (error) {
      request.reject(toError(error, '膜泡重建 Worker 创建失败'))
      queueMicrotask(dispatchNext)
      return
    }

    activeRequest = request
    currentWorker.ref()
    request.timeout = setTimeout(() => {
      if (activeRequest?.id !== request.id || worker !== currentWorker) return
      worker = null
      settleActiveRequest({
        error: new Error(`膜泡重建超时 (${timeoutMs}ms)`),
      })
      retiringWorker = currentWorker
        .terminate()
        .catch((error: unknown) => {
          reportInternalError(toError(error, '终止超时膜泡 Worker 失败'))
        })
        .then(() => undefined)
        .finally(() => {
          retiringWorker = null
          dispatchNext()
        })
    }, timeoutMs)

    try {
      currentWorker.postMessage({
        ...request.request,
        id: request.id,
      } satisfies BubbleWorkerRequest)
    } catch (error) {
      worker = null
      settleActiveRequest({ error: toError(error, '发送膜泡重建请求失败') })
      retiringWorker = currentWorker
        .terminate()
        .catch((terminateError: unknown) => {
          reportInternalError(toError(terminateError, '回收膜泡 Worker 失败'))
        })
        .then(() => undefined)
        .finally(() => {
          retiringWorker = null
          dispatchNext()
        })
    }
  }

  const handleMessage = (
    source: Worker,
    response: BubbleWorkerMessageResponse
  ) => {
    if (source !== worker) return
    if (response.type === 'shutdown') {
      if (
        shutdownState?.worker === source &&
        shutdownState.id === response.id
      ) {
        shutdownState.acknowledged = true
      }
      return
    }
    if (!activeRequest || response.id !== activeRequest.id) return

    source.unref()
    if (response.ok) settleActiveRequest({ response })
    else settleActiveRequest({ error: new Error(response.error) })
    dispatchNext()
  }

  const handleWorkerFailure = (source: Worker, error: Error) => {
    if (source !== worker) return
    worker = null
    if (shutdownState?.worker === source) {
      const state = shutdownState
      shutdownState = null
      clearTimeout(state.timeout)
      state.reject(error)
    }
    if (activeRequest) settleActiveRequest({ error })
    reportInternalError(error)
    retiringWorker = source
      .terminate()
      .catch((terminateError: unknown) => {
        reportInternalError(toError(terminateError, '回收异常膜泡 Worker 失败'))
      })
      .then(() => undefined)
      .finally(() => {
        retiringWorker = null
        dispatchNext()
      })
  }

  const handleWorkerExit = (source: Worker, code: number) => {
    if (source !== worker) return
    worker = null
    if (shutdownState?.worker === source) {
      const state = shutdownState
      shutdownState = null
      clearTimeout(state.timeout)
      if (code === 0 && state.acknowledged) state.resolve()
      else {
        state.reject(
          new Error(
            `膜泡 Worker 关闭失败 (code=${code}, ack=${state.acknowledged})`
          )
        )
      }
      dispatchNext()
      return
    }

    const error = new Error(`膜泡重建 Worker 异常退出 (code=${code})`)
    if (activeRequest) settleActiveRequest({ error })
    if (code !== 0) reportInternalError(error)
    dispatchNext()
  }

  const ensureWorker = (): Worker => {
    if (worker) return worker
    const created = new Worker(options.workerPath, options.workerOptions)
    worker = created
    workerCreateCount += 1
    created.on('message', (response: BubbleWorkerMessageResponse) => {
      handleMessage(created, response)
    })
    created.on('error', (error) => {
      handleWorkerFailure(created, toError(error, '膜泡重建 Worker 错误'))
    })
    created.on('exit', (code) => handleWorkerExit(created, code))
    created.unref()
    options.onWorkerCreated?.(created)
    return created
  }

  const run: BubbleWorkerClient['run'] = (request) =>
    new Promise((resolve, reject) => {
      queue.push({ id: ++nextId, request, resolve, reject })
      dispatchNext()
    })

  const shutdown = (): Promise<void> => {
    if (activeRequest || queue.length > 0 || retiringWorker) {
      return Promise.reject(
        new Error('膜泡 Worker 仍有活动或排队请求，不能关闭')
      )
    }
    if (shutdownState) {
      return Promise.reject(new Error('膜泡 Worker 已在关闭中'))
    }
    if (!worker) return Promise.resolve()

    const currentWorker = worker
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (shutdownState?.worker !== currentWorker) return
        shutdownState = null
        worker = null
        void currentWorker.terminate().finally(() => {
          reject(new Error('膜泡 Worker 优雅关闭超时'))
          dispatchNext()
        })
      }, SHUTDOWN_TIMEOUT_MS)
      shutdownState = {
        worker: currentWorker,
        id,
        acknowledged: false,
        timeout,
        resolve,
        reject,
      }
      currentWorker.ref()
      try {
        currentWorker.postMessage({
          id,
          type: 'shutdown',
        } satisfies BubbleWorkerShutdownRequest)
      } catch (error) {
        clearTimeout(timeout)
        shutdownState = null
        worker = null
        void currentWorker.terminate().finally(() => {
          reject(toError(error, '发送膜泡 Worker 关闭请求失败'))
          dispatchNext()
        })
      }
    })
  }

  return {
    run,
    shutdown,
    isBusy: () => activeRequest !== null || queue.length > 0,
    getQueueLength: () => queue.length,
    getWorkerCreateCount: () => workerCreateCount,
  }
}
