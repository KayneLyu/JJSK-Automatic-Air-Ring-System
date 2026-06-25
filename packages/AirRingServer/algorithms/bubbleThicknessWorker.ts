/**
 * 膜泡原始厚度重建 Worker 线程
 *
 * 运行在独立的 Node.js worker_threads 线程中，
 * 接收 MeasurementTriple[] + membraneWidth + options，
 * 执行 CPU 密集型的 reconstructBubbleThickness，并将结果 postMessage 回主线程。
 *
 * 与 calibrationWorker.ts 的设计模式一致：
 * - 主进程不会因为 10s 量级的 CPU 计算而被阻塞
 * - 适用于 ADBox 1ms 高频推送下的实时膜泡剖面重建
 */
import { parentPort } from 'node:worker_threads'
import {
  reconstructBubbleThickness,
  type MeasurementTriple,
  type BubbleReconstructionOptions,
  type BubbleReconstructionResult,
} from './bubbleReconstruction'

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
  throw new Error('bubbleThicknessWorker must be run as a worker_threads Worker')
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