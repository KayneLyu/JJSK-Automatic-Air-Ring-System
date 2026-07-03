/**
 * 膜泡重建 SQL 查询 Worker 管理器
 *
 * 将重型 SQL 查询（findSweepsFromHistory + queryThicknessRaw）
 * 卸载到独立 Worker 线程，不阻塞 utilityProcess 实时数据接收。
 */
import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { BubbleQueryRequest, BubbleQueryResponse, SweepMeta } from './bubbleQueryWorker'

const moduleDirname = dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = pathToFileURL(join(moduleDirname, 'bubbleQueryWorker.js'))

const WORKER_TIMEOUT_MS = 30_000

let nextId = 0

/**
 * 查询最长一趟扫描的原始数据（供 getBubbleProfileAsync 使用）。
 *
 * Worker 拥有只读 WAL SQLite 连接，SQL 查询不阻塞主 utilityProcess 线程。
 */
export function queryBubbleProfileData(dbPath: string, startMs: number, endMs: number): Promise<{
  sweep: SweepMeta
  rows: Array<{ timestamp: number; pulse: number; ad: number }>
}> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    let settled = false

    let worker: Worker
    try {
      worker = new Worker(WORKER_PATH)
    } catch (err) {
      reject(new Error(`BubbleQuery Worker 创建失败: ${err}`))
      return
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate().catch(() => {})
      reject(new Error('BubbleQuery 超时 (30s)'))
    }, WORKER_TIMEOUT_MS)

    worker.on('message', (res: BubbleQueryResponse) => {
      if (settled) return
      if (res.id !== id) return
      if (!res.ok) {
        settled = true
        clearTimeout(timeout)
        worker.terminate().catch(() => {})
        reject(new Error(res.error))
        return
      }
      // 此 Worker 只发 get-profile 请求，result 必然是 get-profile variant
      if (res.type !== 'get-profile') return
      settled = true
      clearTimeout(timeout)
      worker.terminate().catch(() => {})
      resolve(res)
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker.terminate().catch(() => {})
      reject(new Error(`BubbleQuery Worker 错误: ${err.message}`))
    })

    worker.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`BubbleQuery Worker 异常退出 (code=${code})`))
    })

    worker.postMessage({
      id,
      type: 'get-profile',
      dbPath,
      startMs,
      endMs,
    } satisfies BubbleQueryRequest)
  })
}

/**
 * 查询多趟扫描的原始数据（供 getBubbleSweeps 使用）。
 */
export function queryBubbleSweepsData(
  dbPath: string,
  startMs: number,
  endMs: number,
  limit?: number
): Promise<
  Array<{
    sweep: SweepMeta
    rows: Array<{ timestamp: number; pulse: number; ad: number }>
  }>
> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    let settled = false

    let worker: Worker
    try {
      worker = new Worker(WORKER_PATH)
    } catch (err) {
      reject(new Error(`BubbleQuery Worker 创建失败: ${err}`))
      return
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate().catch(() => {})
      reject(new Error('BubbleQuery 超时 (30s)'))
    }, WORKER_TIMEOUT_MS)

    worker.on('message', (res: BubbleQueryResponse) => {
      if (settled) return
      if (res.id !== id) return
      if (!res.ok) {
        settled = true
        clearTimeout(timeout)
        worker.terminate().catch(() => {})
        reject(new Error(res.error))
        return
      }
      if (res.type !== 'get-sweeps') return
      settled = true
      clearTimeout(timeout)
      worker.terminate().catch(() => {})
      resolve(res.sweeps)
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      worker.terminate().catch(() => {})
      reject(new Error(`BubbleQuery Worker 错误: ${err.message}`))
    })

    worker.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`BubbleQuery Worker 异常退出 (code=${code})`))
    })

    worker.postMessage({
      id,
      type: 'get-sweeps',
      dbPath,
      startMs,
      endMs,
      limit,
    } satisfies BubbleQueryRequest)
  })
}
