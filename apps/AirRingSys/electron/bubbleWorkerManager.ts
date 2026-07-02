/**
 * 膜泡重建 Worker 管理器
 *
 * 在独立的 Worker 线程中执行 reconstructBubbleThickness，
 * 避免阻塞 UtilityProcess 的消息循环。
 *
 * 使用模式：
 *   const result = await runBubbleReconstructionInWorker(triples, membraneWidthMm, options)
 *
 * 实现细节：
 * - 每次请求创建一个新 Worker（类似 calibrationBridge 的 run-once 模式）
 * - 互斥锁：同一时刻只允许一个 Worker 运行（后续请求排队等待）
 * - 超时保护：30 秒后自动终止 Worker 并 reject
 */
import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  MeasurementTriple,
  BubbleReconstructionOptions,
  BubbleReconstructionResult,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import type { BubbleWorkerRequest, BubbleWorkerResponse } from './bubbleWorker'

const moduleDirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = pathToFileURL(join(moduleDirname, 'bubbleWorker.js'))

const WORKER_TIMEOUT_MS = 30_000

// ── 互斥锁 + 排队 ──
let isBusy = false
let nextId = 0
const pendingQueue: Array<{
  resolve: (result: BubbleReconstructionResult) => void
  reject: (err: Error) => void
  req: Omit<BubbleWorkerRequest, 'id'>
}> = []

const processNext = () => {
  if (isBusy || pendingQueue.length === 0) return
  isBusy = true

  const { resolve, reject, req } = pendingQueue.shift()!
  const id = ++nextId
  let settled = false

  let worker: Worker
  try {
    worker = new Worker(WORKER_PATH)
  } catch (err) {
    isBusy = false
    reject(new Error(`Worker 创建失败: ${err}`))
    processNext()
    return
  }

  const timeout = setTimeout(() => {
    if (settled) return
    settled = true
    worker.terminate().catch(() => {})
    reject(new Error('膜泡重建超时 (30s)'))
    isBusy = false
    processNext()
  }, WORKER_TIMEOUT_MS)

  worker.on('message', (res: BubbleWorkerResponse) => {
    if (settled) return
    if (res.id !== id) return
    settled = true
    clearTimeout(timeout)

    if (res.ok) {
      resolve(res.result)
    } else {
      reject(new Error(`膜泡重建失败: ${res.error}`))
    }

    worker.terminate().catch(() => {})
    isBusy = false
    processNext()
  })

  worker.on('error', (err) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    reject(new Error(`Worker 运行错误: ${err.message}`))
    worker.terminate().catch(() => {})
    isBusy = false
    processNext()
  })

  worker.on('exit', (code) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    reject(new Error(`Worker 异常退出 (code=${code})`))
    isBusy = false
    processNext()
  })

  worker.postMessage({ ...req, id } satisfies BubbleWorkerRequest)
}

/**
 * 在独立 Worker 线程中执行膜泡厚度重建。
 *
 * @param triples           测量三元组
 * @param membraneWidthMm   膜宽 (mm)
 * @param options           重建选项
 * @returns 重建结果（异步）
 */
export const runBubbleReconstructionInWorker = (
  triples: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): Promise<BubbleReconstructionResult> => {
  return new Promise((resolve, reject) => {
    pendingQueue.push({
      resolve,
      reject,
      req: { triples, membraneWidthMm, options },
    })
    processNext()
  })
}

/**
 * 检查当前是否有 Worker 在运行中
 */
export const isBubbleWorkerBusy = (): boolean => isBusy

/**
 * 获取排队中的请求数
 */
export const getBubbleWorkerQueueLength = (): number => pendingQueue.length
