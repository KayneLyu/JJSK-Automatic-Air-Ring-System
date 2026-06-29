/**
 * 扫描趟查询层（基于 scan_pass 物化表）
 *
 * 替代原 sweepQueries.ts 的 6-CTE SQL 实时切分方案。
 * 所有扫描趟摘要查询直接走 scan_pass 表，O(log N) 索引查询替代 O(N) CTE。
 *
 * 扫描趟由 DataPipeline.scanPassDetector 在数据接收路径上实时写入，
 * 历史数据由 backfillScanPassesHistory() 一次性从 thickness_raw 回填。
 */
import { desc, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import {
  querySweepPointsByRangeWithOrm,
  type SweepIndexedResult,
  type SweepSummaryResult,
} from './sweepHistory'

/** scan_pass 表行类型（Drizzle 自动推导的 camelCase 列名） */
type ScanPassRow = typeof schema.scanPass.$inferSelect

const toSummary = (row: ScanPassRow): SweepSummaryResult => ({
  sweepId: `${row.scannerDirection === 1 ? 'forward' : 'backward'}-${row.startTs}-${row.endTs}`,
  direction: row.scannerDirection === 1 ? 'forward' : 'backward',
  startTs: row.startTs,
  endTs: row.endTs,
  pointCount: 0, // scan_pass 当前不存 totalCount，后续 migration 补充
})

/**
 * 从 scan_pass 表查询按模式的扫描趟数。
 */
export function querySweepCountByMode(
  db: ReturnType<typeof drizzle<typeof schema>>,
  mode: 'single' | 'round'
): number {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.scanPass)
    .where(sql`${schema.scanPass.status} = 'complete'`)
    .get()
  const total = rows?.count ?? 0
  return mode === 'single' ? total : Math.ceil(total / 2)
}

/**
 * 从 scan_pass 表查询按模式的扫描趟 ID 列表。
 */
export function querySweepIdsByMode(
  db: ReturnType<typeof drizzle<typeof schema>>,
  mode: 'single' | 'round'
): string[] {
  const rows = db
    .select({
      startTs: schema.scanPass.startTs,
      endTs: schema.scanPass.endTs,
      scannerDirection: schema.scanPass.scannerDirection,
    })
    .from(schema.scanPass)
    .where(sql`${schema.scanPass.status} = 'complete'`)
    .orderBy(schema.scanPass.startTs)
    .all()

  if (mode === 'single') {
    return rows.map(
      (r) => `${r.scannerDirection === 1 ? 'forward' : 'backward'}-${r.startTs}-${r.endTs}`
    )
  }

  const ids: string[] = []
  for (let i = 0; i < rows.length; i += 2) {
    const first = rows[i]
    const second = rows[i + 1]
    const fid = `${first.scannerDirection === 1 ? 'forward' : 'backward'}-${first.startTs}-${first.endTs}`
    if (second) {
      const sid = `${second.scannerDirection === 1 ? 'forward' : 'backward'}-${second.startTs}-${second.endTs}`
      ids.push(`${fid}|${sid}`)
    } else {
      ids.push(fid)
    }
  }
  return ids
}

/**
 * 从 scan_pass 表按索引查询扫描趟（含点数据）。
 *
 * 点数据仍从 thickness_raw 通过 sweepHistory 拉取。
 */
export function querySweepByIndex(
  db: ReturnType<typeof drizzle<typeof schema>>,
  mode: 'single' | 'round',
  index: number
): SweepIndexedResult | null {
  if (!Number.isInteger(index) || index < 0) return null

  const rows = db
    .select()
    .from(schema.scanPass)
    .where(sql`${schema.scanPass.status} = 'complete'`)
    .orderBy(schema.scanPass.startTs)
    .all()

  if (rows.length === 0) return null

  if (mode === 'single') {
    const row = rows[index]
    if (!row) return null
    return {
      id: `${row.scannerDirection === 1 ? 'forward' : 'backward'}-${row.startTs}-${row.endTs}`,
      mode,
      sweeps: [
        {
          direction: (row.scannerDirection === 1 ? 'forward' : 'backward') as 'forward' | 'backward',
          points: querySweepPointsByRangeWithOrm(db, row.startTs, row.endTs),
        },
      ],
    }
  }

  const start = index * 2
  const first = rows[start]
  if (!first) return null
  const second = rows[start + 1]
  const selected = second ? [first, second] : [first]
  return {
    id: second
      ? `${first.scannerDirection === 1 ? 'forward' : 'backward'}-${first.startTs}-${first.endTs}|${second.scannerDirection === 1 ? 'forward' : 'backward'}-${second.startTs}-${second.endTs}`
      : `${first.scannerDirection === 1 ? 'forward' : 'backward'}-${first.startTs}-${first.endTs}`,
    mode,
    sweeps: selected.map((s) => ({
      direction: (s.scannerDirection === 1 ? 'forward' : 'backward') as 'forward' | 'backward',
      points: querySweepPointsByRangeWithOrm(db, s.startTs, s.endTs),
    })),
  }
}

/**
 * 从 scan_pass 表查询最近 N 趟扫描摘要。
 */
export function queryLatestSweepSummaries(
  db: ReturnType<typeof drizzle<typeof schema>>,
  limit: number,
  beforeTs = 0
): SweepSummaryResult[] {
  const rows = db
    .select()
    .from(schema.scanPass)
    .where(
      beforeTs > 0
        ? sql`${schema.scanPass.status} = 'complete' AND ${schema.scanPass.startTs} < ${beforeTs}`
        : sql`${schema.scanPass.status} = 'complete'`
    )
    .orderBy(desc(schema.scanPass.startTs))
    .limit(limit)
    .all()

  return rows.map(toSummary).reverse()
}

/**
 * 从 scan_pass 表查询全部扫描趟摘要（按时间升序）。
 */
export function queryAllSweepSummaries(
  db: ReturnType<typeof drizzle<typeof schema>>
): SweepSummaryResult[] {
  const rows = db
    .select()
    .from(schema.scanPass)
    .where(sql`${schema.scanPass.status} = 'complete'`)
    .orderBy(schema.scanPass.startTs)
    .all()

  return rows.map(toSummary)
}
