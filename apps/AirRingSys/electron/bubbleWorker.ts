/**
 * 膜泡重建 Worker 线程
 *
 * 运行在独立的 Node.js worker_threads 线程中，
 * 接收 MeasurementTriple[] + membraneWidthMm + options，
 * 执行 CPU 密集型的 reconstructBubbleThickness，并将结果 postMessage 回主线程。
 *
 * 这样 UtilityProcess 的事件循环不会被数百毫秒的矩阵求解阻塞，
 * 保证 ADBox 高频推送的持续接收和 SQLite 写入不会掉帧。
 */
import { parentPort } from 'node:worker_threads'
import {
  reconstructBubbleThickness,
  type MeasurementTriple,
  type BubbleReconstructionOptions,
  type BubbleReconstructionResult,
} from '@jjsk/air-ring-server/algorithms/bubbleReconstruction'

export type BubbleWorkerRequest = {
  id: number
  triples: MeasurementTriple[]
  membraneWidthMm: number
  options?: BubbleReconstructionOptions
}

export type BubbleWorkerResponse =
  | { id: number; ok: true; result: BubbleReconstructionResult }
  | { id: number; ok: false; error: string }

if (!parentPort) {
  throw new Error('bubbleWorker must be run as a worker_threads Worker')
}

parentPort.on('message', (req: BubbleWorkerRequest) => {
  try {
    const result = reconstructBubbleThickness(
      req.triples,
      req.membraneWidthMm,
      req.options
    )
    const response: BubbleWorkerResponse = {
      id: req.id,
      ok: true,
      result,
    }
    parentPort!.postMessage(response)
  } catch (err) {
    const response: BubbleWorkerResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
    parentPort!.postMessage(response)
  }
})
