/**
 * Worker 线程辅助工具
 *
 * 使用方式（需要在 Node.js 环境中编译 Worker 文件为 .js）：
 * ```bash
 * # 预编译 Worker（一次性）
 * npx tsc algorithms/bubbleThicknessWorker.ts --outDir algorithms/ \
 *   --module commonjs --target es2020 --esModuleInterop --skipLibCheck
 * ```
 *
 * 然后在代码中：
 * ```typescript
 * import { Worker } from 'node:worker_threads'
 * const worker = new Worker('algorithms/bubbleThicknessWorker.js')
 * worker.on('message', (response) => { ... })
 * worker.postMessage({ id: 1, triples, membraneWidthMm, options })
 * ```
 *
 * 注：生产环境中，vite-plugin-electron 会自动编译 .ts worker 文件。
 */
export { reconstructBubbleThickness } from './bubbleThicknessReconstruction'
export type {
  MeasurementTriple,
  BubbleReconstructionOptions,
  BubbleReconstructionResult,
} from './bubbleThicknessReconstruction'
export type {
  BubbleWorkerRequest,
  BubbleWorkerResponse,
} from './bubbleThicknessWorker'