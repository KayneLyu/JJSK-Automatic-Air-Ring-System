/**
 * 历史标定 Worker 管理器
 *
 * 在独立 Worker 线程中执行 calibration-feed-historical 的完整流程。
 * Worker 拥有自己的只读 SQLite WAL 连接，不阻塞 utilityProcess 主线程。
 */
import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  HistoricalCalibrationRequest,
  HistoricalCalibrationWorkerProgress,
  HistoricalCalibrationWorkerResponse,
} from './historicalCalibrationWorker'
import type { CalibrationConfig, Scalar } from '@jjsk/air-ring-server/electron'
import type { IHistoricalCalibrationProgress } from '@/types/ipc'

const moduleDirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = pathToFileURL(join(moduleDirname, 'historicalCalibrationWorker.js'))

const WORKER_TIMEOUT_MS = 180_000 // 含数据加载 + 最长 120 秒角度 Worker

// ── 互斥锁 ──
let isBusy = false
let nextId = 0

export function isHistoricalCalibrationBusy(): boolean {
  return isBusy
}

export function runHistoricalCalibrationInWorker(params: {
  dbPath: string
  startMs: number
  endMs: number
  manualTractionSpeed?: number
  disturbanceTs?: number
  angleOnly?: boolean
  config: CalibrationConfig
  standardized: Scalar
  onProgress?: (progress: IHistoricalCalibrationProgress) => void
}): Promise<
  | {
      success: true
      manualTractionSpeed?: number
      disturbanceTs: number
      result: unknown
    }
  | { success: false; disturbanceTs: number; error: string }
> {
  return new Promise((resolve, reject) => {
    if (isBusy) {
      reject(new Error('历史标定 Worker 正在运行中'))
      return
    }
    isBusy = true

    const id = ++nextId
    let settled = false

    let worker: Worker
    try {
      worker = new Worker(WORKER_PATH)
    } catch (err) {
      isBusy = false
      reject(new Error(`历史标定 Worker 创建失败: ${err}`))
      return
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate().catch(() => {})
      isBusy = false
      reject(new Error('历史标定超时 (180s)'))
    }, WORKER_TIMEOUT_MS)

    worker.on('message', (msg: HistoricalCalibrationWorkerProgress | HistoricalCalibrationWorkerResponse) => {
      if (settled) return
      if (msg.id !== id) return

      if (msg.type === 'progress') {
        params.onProgress?.({
          processed: msg.processed,
          total: msg.total,
        })
        return
      }

      // 最终结果
      settled = true
      clearTimeout(timeout)
      isBusy = false
      worker.terminate().catch(() => {})

      if (msg.ok) {
        resolve({
          success: true,
          manualTractionSpeed: msg.manualTractionSpeed,
          disturbanceTs: msg.disturbanceTs,
          result: msg.result,
        })
      } else {
        resolve({
          success: false,
          disturbanceTs: msg.disturbanceTs,
          error: msg.error,
        })
      }
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      isBusy = false
      worker.terminate().catch(() => {})
      reject(new Error(`历史标定 Worker 错误: ${err.message}`))
    })

    worker.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      isBusy = false
      reject(new Error(`历史标定 Worker 异常退出 (code=${code})`))
    })

    worker.postMessage({
      id,
      dbPath: params.dbPath,
      startMs: params.startMs,
      endMs: params.endMs,
      manualTractionSpeed: params.manualTractionSpeed,
      disturbanceTs: params.disturbanceTs,
      angleOnly: params.angleOnly,
      config: params.config,
      standardized: params.standardized,
    } satisfies HistoricalCalibrationRequest)
  })
}
