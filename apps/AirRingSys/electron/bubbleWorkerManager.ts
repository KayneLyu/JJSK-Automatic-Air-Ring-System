/**
 * 膜泡重建 Worker 管理器
 *
 * 惰性创建并复用一个 Worker；请求按 FIFO 串行执行。正常响应不终止
 * Worker，只有超时、发送失败或异常退出时才强制回收。
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  BubbleReconstructionOptions,
  BubbleReconstructionResult,
  MeasurementTriple,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'
import { createBubbleWorkerClient } from './bubbleWorkerClient'

const moduleDirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = pathToFileURL(join(moduleDirname, 'bubbleWorker.js'))

const client = createBubbleWorkerClient({
  workerPath: WORKER_PATH,
  onInternalError: (error) => {
    console.warn(`[BubbleWorkerManager] ${error.message}`)
  },
})

export const runBubbleReconstructionInWorker = async (
  triples: MeasurementTriple[],
  membraneWidthMm: number,
  options?: BubbleReconstructionOptions
): Promise<BubbleReconstructionResult> => {
  const response = await client.run({
    type: 'reconstruct',
    triples,
    membraneWidthMm,
    options,
  })
  return response.result
}

export const shutdownBubbleWorker = (): Promise<void> => client.shutdown()

export const isBubbleWorkerBusy = (): boolean => client.isBusy()

export const getBubbleWorkerQueueLength = (): number => client.getQueueLength()

export const getBubbleWorkerCreateCount = (): number =>
  client.getWorkerCreateCount()
