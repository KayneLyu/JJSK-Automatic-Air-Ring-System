/**
 * 膜泡重建 SQL 查询 Worker
 *
 * 在独立 Worker 线程中执行重型 SQL 查询（findSweepsFromHistory + queryThicknessRaw），
 * 不阻塞 utilityProcess 主线程的实时数据接收。
 *
 * 支持两种查询模式：
 *   - get-profile:  单趟查询（最长一趟），返回 raw rows + sweep metadata
 *   - get-sweeps:   多趟查询，返回每趟的 raw rows + sweep metadata
 */
import { parentPort } from 'node:worker_threads'
import { createReadOnlyConnection } from './db/service'
import { queryThicknessRaw, queryRotationRaw } from './db/rawQueries'
import type { ThicknessRawRow } from '@/types/ipc'
import type { RotationRawRow } from './db/types'

// ═══════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════

export type SweepMeta = {
  startTs: number
  endTs: number
  direction: 'forward' | 'reverse'
  durationMs: number
}

export type BubbleQueryRequest =
  | {
      id: number
      type: 'get-profile'
      dbPath: string
      startMs: number
      endMs: number
    }
  | {
      id: number
      type: 'get-sweeps'
      dbPath: string
      startMs: number
      endMs: number
      limit?: number
    }

export type BubbleQueryResponse =
  | {
      id: number
      type: 'get-profile'
      ok: true
      sweep: SweepMeta
      rows: Array<{ timestamp: number; pulse: number; ad: number }>
    }
  | {
      id: number
      type: 'get-profile'
      ok: false
      error: string
    }
  | {
      id: number
      type: 'get-sweeps'
      ok: true
      sweeps: Array<{
        sweep: SweepMeta
        rows: Array<{ timestamp: number; pulse: number; ad: number }>
      }>
    }
  | {
      id: number
      type: 'get-sweeps'
      ok: false
      error: string
    }

// ═══════════════════════════════════════════════════════════════
// findSweepsFromHistory 的同构实现（不依赖 SQLiteService）
// ═══════════════════════════════════════════════════════════════

function findSweepsFromHistoryRaw(
  db: ReturnType<typeof createReadOnlyConnection>['db'],
  startMs: number,
  endMs: number
): SweepMeta[] {
  const rotRows = queryRotationRaw(db, startMs, endMs) as RotationRawRow[]
  if (!rotRows || rotRows.length === 0) return []

  const changes: { ts: number; direction: 'forward' | 'reverse' }[] = []
  for (const r of rotRows) {
    if (r.forwardDirChange) {
      changes.push({ ts: r.timestamp, direction: 'forward' })
    } else if (r.reverseDirChange) {
      changes.push({ ts: r.timestamp, direction: 'reverse' })
    }
  }
  if (changes.length === 0) return []

  const MIN_SWEEP_MS = 30_000
  const sweeps: SweepMeta[] = []

  for (let i = 0; i < changes.length - 1; i += 1) {
    const start = changes[i]
    const end = changes[i + 1]
    if (end.ts - start.ts < MIN_SWEEP_MS) continue
    sweeps.push({
      startTs: start.ts,
      endTs: end.ts,
      direction: start.direction,
      durationMs: end.ts - start.ts,
    })
  }

  const last = changes[changes.length - 1]
  if (endMs - last.ts >= MIN_SWEEP_MS) {
    sweeps.push({
      startTs: last.ts,
      endTs: endMs,
      direction: last.direction,
      durationMs: endMs - last.ts,
    })
  }

  return sweeps
}

// ═══════════════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════════════

if (!parentPort) {
  throw new Error('bubbleQueryWorker must be run as a worker_threads Worker')
}

parentPort.on('message', (msg: BubbleQueryRequest) => {
  const { id, type, dbPath } = msg

  try {
    const ro = createReadOnlyConnection(dbPath)

    try {
      if (type === 'get-profile') {
        const { startMs, endMs } = msg

        const sweeps = findSweepsFromHistoryRaw(ro.db, startMs, endMs)
        if (sweeps.length === 0) {
          parentPort!.postMessage({
            id,
            type: 'get-profile',
            ok: false,
            error: '未找到有效的上旋旋转趟',
          } satisfies BubbleQueryResponse)
          return
        }

        const sweep = sweeps.reduce((a, b) =>
          b.durationMs > a.durationMs ? b : a
        )

        const allRows = queryThicknessRaw(ro.db, sweep.startTs, sweep.endTs) as ThicknessRawRow[]
        if (allRows.length < 100) {
          parentPort!.postMessage({
            id,
            type: 'get-profile',
            ok: false,
            error: `扫描趟数据不足 (rows=${allRows.length})`,
          } satisfies BubbleQueryResponse)
          return
        }

        parentPort!.postMessage({
          id,
          type: 'get-profile',
          ok: true,
          sweep,
          rows: allRows.map((r) => ({ timestamp: r.timestamp, pulse: r.pulse, ad: r.ad })),
        } satisfies BubbleQueryResponse)
      } else {
        // get-sweeps
        const { startMs, endMs, limit } = msg as Extract<BubbleQueryRequest, { type: 'get-sweeps' }>

        const allSweeps = findSweepsFromHistoryRaw(ro.db, startMs, endMs)
        if (allSweeps.length === 0) {
          parentPort!.postMessage({
            id,
            type: 'get-sweeps',
            ok: true,
            sweeps: [],
          } satisfies BubbleQueryResponse)
          return
        }

        const limited = limit ? allSweeps.slice(-limit) : allSweeps

        const result: Array<{
          sweep: SweepMeta
          rows: Array<{ timestamp: number; pulse: number; ad: number }>
        }> = []

        for (const sweep of limited) {
          const allRows = queryThicknessRaw(ro.db, sweep.startTs, sweep.endTs) as ThicknessRawRow[]
          if (allRows.length < 100) continue
          result.push({
            sweep,
            rows: allRows.map((r) => ({ timestamp: r.timestamp, pulse: r.pulse, ad: r.ad })),
          })
        }

        parentPort!.postMessage({
          id,
          type: 'get-sweeps',
          ok: true,
          sweeps: result,
        } satisfies BubbleQueryResponse)
      }
    } finally {
      ro.close()
    }
  } catch (err) {
    parentPort!.postMessage({
      id,
      type,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies BubbleQueryResponse)
  }
})
