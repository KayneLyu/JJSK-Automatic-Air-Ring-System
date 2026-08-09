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
import { collectUniformSample } from './db/uniformSampling'
import type Database from 'better-sqlite3'

const MAX_POINTS_PER_SWEEP = 2000

type ThicknessRow = { timestamp: number; pulse: number; ad: number }

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
      sourceRowCount: number
      rows: ThicknessRow[]
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
        sourceRowCount: number
        rows: ThicknessRow[]
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
  sqliteDb: Database.Database,
  startMs: number,
  endMs: number
): SweepMeta[] {
  // 历史库可能缺少后续 migration 添加的非必要列。这里仅查询切趟所需的
  // 稳定列，避免 Drizzle select(*) 因旧 schema 列缺失而拒绝只读回放。
  const rotationColumns = new Set(
    (
      sqliteDb.pragma("table_info('rotation_raw')") as Array<{
        name: string
      }>
    ).map((column) => column.name)
  )
  const forwardColumn = rotationColumns.has('forwardDirChange')
    ? 'forwardDirChange'
    : rotationColumns.has('forward_dir_change')
      ? 'forward_dir_change'
      : null
  const reverseColumn = rotationColumns.has('reverseDirChange')
    ? 'reverseDirChange'
    : rotationColumns.has('reverse_dir_change')
      ? 'reverse_dir_change'
      : null
  if (!forwardColumn || !reverseColumn) {
    throw new Error('rotation_raw 缺少方向变化列')
  }

  const rotRows = sqliteDb
    .prepare(
      `SELECT timestamp,
              "${forwardColumn}" AS forwardDirChange,
              "${reverseColumn}" AS reverseDirChange
         FROM rotation_raw
        WHERE timestamp >= ? AND timestamp < ?
          AND ("${forwardColumn}" > 0 OR "${reverseColumn}" > 0)
        ORDER BY timestamp`
    )
    .all(startMs, endMs) as Array<{
    timestamp: number
    forwardDirChange: number
    reverseDirChange: number
  }>
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

function querySampledThicknessRows(
  sqliteDb: Database.Database,
  sweep: SweepMeta
): { sourceRowCount: number; rows: ThicknessRow[] } {
  return sqliteDb.transaction(() => {
    const countRow = sqliteDb
      .prepare(
        `SELECT COUNT(*) AS count
           FROM thickness_raw
          WHERE timestamp >= ? AND timestamp < ?`
      )
      .get(sweep.startTs, sweep.endTs) as { count: number }
    const sourceRowCount = Number(countRow.count)
    if (!Number.isSafeInteger(sourceRowCount) || sourceRowCount < 0) {
      throw new Error(`扫描趟数据数量无效: ${String(countRow.count)}`)
    }
    if (sourceRowCount < 100) return { sourceRowCount, rows: [] }

    const orderedRows = sqliteDb
      .prepare(
        `SELECT timestamp, pulse, ad
           FROM thickness_raw
          WHERE timestamp >= ? AND timestamp < ?
          ORDER BY timestamp`
      )
      .iterate(sweep.startTs, sweep.endTs) as Iterable<ThicknessRow>
    return {
      sourceRowCount,
      rows: collectUniformSample(
        orderedRows,
        sourceRowCount,
        MAX_POINTS_PER_SWEEP
      ),
    }
  })()
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

        const sweeps = findSweepsFromHistoryRaw(ro.sqliteDb, startMs, endMs)
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

        const sampled = querySampledThicknessRows(ro.sqliteDb, sweep)
        if (sampled.sourceRowCount < 100) {
          parentPort!.postMessage({
            id,
            type: 'get-profile',
            ok: false,
            error: `扫描趟数据不足 (rows=${sampled.sourceRowCount})`,
          } satisfies BubbleQueryResponse)
          return
        }

        parentPort!.postMessage({
          id,
          type: 'get-profile',
          ok: true,
          sweep,
          sourceRowCount: sampled.sourceRowCount,
          rows: sampled.rows,
        } satisfies BubbleQueryResponse)
      } else {
        // get-sweeps
        const { startMs, endMs, limit } = msg as Extract<
          BubbleQueryRequest,
          { type: 'get-sweeps' }
        >

        const allSweeps = findSweepsFromHistoryRaw(ro.sqliteDb, startMs, endMs)
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
          sourceRowCount: number
          rows: ThicknessRow[]
        }> = []

        for (const sweep of limited) {
          const sampled = querySampledThicknessRows(ro.sqliteDb, sweep)
          if (sampled.sourceRowCount < 100) continue
          result.push({
            sweep,
            sourceRowCount: sampled.sourceRowCount,
            rows: sampled.rows,
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
