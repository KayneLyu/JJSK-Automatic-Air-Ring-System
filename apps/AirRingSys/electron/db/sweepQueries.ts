/**
 * 测厚仪扫描趟 6-CTE SQL 查询层
 *
 * 核心查询 `querySweepSummaryRowsSql` 运行 6 个 CTE 的窗口函数管道，
 * 从 thickness_raw 按 pulse 方向变化切分出每次扫描趟的起止时间与方向。
 *
 * 方向判定：pulse 递增 → forward，递减 → backward。
 * 所有函数接收原生 sqliteDb 作为参数，与 SQLiteService 解耦。
 */
import type Database from 'better-sqlite3'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import {
  querySweepPointsByRangeWithOrm,
  type SweepIndexedResult,
  type SweepSummaryResult,
} from './sweepHistory'

/**
 * 6-CTE 扫描趟切分查询。
 *
 * 管道：source → ordered → dedup → dir_calc → trip_seed → trip_rows → trip_stats
 *
 * 1. source: 按时间范围取原始数据
 * 2. ordered: 按时间升序排列
 * 3. dedup: 去除相邻同 pulse 行（消除暂停时的冗余帧）
 * 4. dir_calc: 计算每步的 pulse 变化方向（1 = 递增, -1 = 递减）
 * 5. trip_seed: 关联前一步方向
 * 6. trip_rows: 方向翻转时递增 trip_id，标识扫描趟边界
 * 7. trip_stats: 聚合每趟的起止时间、方向、点数
 *
 * @param sqliteDb  原生 better-sqlite3 实例
 * @param limitRows 可选：限制返回的扫描趟数
 * @param beforeTs  可选：仅返回该时间戳之前的扫描趟
 */
export function querySweepSummaryRowsSql(
  sqliteDb: Database.Database,
  limitRows = 0,
  beforeTs = 0
): SweepSummaryResult[] {
  const hasLimit = limitRows > 0
  const whereTs = beforeTs > 0 ? 'WHERE timestamp < ?' : ''
  const limitClause = hasLimit ? 'LIMIT ?' : ''
  const query = `
WITH source AS (
  SELECT id, timestamp AS ts, pulse AS pos
  FROM thickness_raw
  ${whereTs}
  ORDER BY timestamp DESC, id DESC
  ${limitClause}
),
ordered AS (
  SELECT id, ts, pos
  FROM source
  ORDER BY ts ASC, id ASC
),
dedup AS (
  SELECT id, ts, pos
  FROM (
    SELECT
      id,
      ts,
      pos,
      LAG(pos) OVER (ORDER BY ts, id) AS prev_pos
    FROM ordered
  ) t
  WHERE prev_pos IS NULL OR pos <> prev_pos
),
dir_calc AS (
  SELECT
    id,
    ts,
    pos,
    CASE
      WHEN LAG(pos) OVER (ORDER BY ts, id) IS NULL THEN NULL
      WHEN pos > LAG(pos) OVER (ORDER BY ts, id) THEN 1
      WHEN pos < LAG(pos) OVER (ORDER BY ts, id) THEN -1
      ELSE NULL
    END AS dir
  FROM dedup
),
trip_seed AS (
  SELECT
    id,
    ts,
    pos,
    dir,
    LAG(dir) OVER (ORDER BY ts, id) AS prev_dir
  FROM dir_calc
),
trip_rows AS (
  SELECT
    id,
    ts,
    pos,
    dir,
    SUM(
      CASE
        WHEN dir IS NOT NULL AND prev_dir IS NOT NULL AND dir <> prev_dir THEN 1
        ELSE 0
      END
    ) OVER (ORDER BY ts, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) + 1 AS trip_id
  FROM trip_seed
  WHERE dir IS NOT NULL
),
trip_stats AS (
  SELECT
    trip_id,
    CASE WHEN MIN(dir) >= 0 THEN 'forward' ELSE 'backward' END AS direction,
    MIN(ts) AS start_ts,
    MAX(ts) AS end_ts,
    COUNT(*) AS point_count,
    MAX(trip_id) OVER () AS max_trip_id
  FROM trip_rows
  GROUP BY trip_id
)
SELECT
  direction AS direction,
  start_ts AS startTs,
  end_ts AS endTs,
  point_count AS pointCount
FROM trip_stats
WHERE point_count >= 3 AND trip_id < max_trip_id
ORDER BY trip_id DESC
`

  const params: number[] = []
  if (beforeTs > 0) params.push(beforeTs)
  if (hasLimit) params.push(limitRows)

  const rows = sqliteDb.prepare(query).all(...params) as {
    direction: 'forward' | 'backward'
    startTs: number
    endTs: number
    pointCount: number
  }[]

  return rows.map((row) => ({
    sweepId: `${row.direction}-${row.startTs}-${row.endTs}`,
    direction: row.direction,
    startTs: row.startTs,
    endTs: row.endTs,
    pointCount: row.pointCount,
  }))
}

/**
 * 按模式统计扫描趟数。
 *
 * @param mode single = 单趟计数，round = 往返配对计数
 */
export function querySweepCountByMode(
  sqliteDb: Database.Database,
  mode: 'single' | 'round'
): number {
  const summaries = querySweepSummaryRowsSql(sqliteDb)
  if (mode === 'single') return summaries.length
  return Math.ceil(summaries.length / 2)
}

/**
 * 按模式返回全部扫描趟的 ID 列表。
 *
 * @param mode single = 每趟一个 ID，round = 正反两趟配对为一个 ID
 */
export function querySweepIdsByMode(
  sqliteDb: Database.Database,
  mode: 'single' | 'round'
): string[] {
  const summaries = querySweepSummaryRowsSql(sqliteDb)
  if (mode === 'single') {
    return summaries.map((s) => s.sweepId)
  }

  const ids: string[] = []
  for (let i = 0; i < summaries.length; i += 2) {
    const first = summaries[i]
    const second = summaries[i + 1]
    ids.push(second ? `${first.sweepId}|${second.sweepId}` : first.sweepId)
  }
  return ids
}

/**
 * 按索引查询扫描趟，返回含点数据的完整结果。
 *
 * @param db      Drizzle 实例
 * @param sqliteDb 原生 better-sqlite3 实例
 * @param mode    single = 单趟，round = 正反配对
 * @param index   0-based 索引
 * @returns 含完整点数据的扫描趟，索引越界或无数据返回 null
 */
export function querySweepByIndex(
  db: ReturnType<typeof drizzle<typeof schema>>,
  sqliteDb: Database.Database,
  mode: 'single' | 'round',
  index: number
): SweepIndexedResult | null {
  if (!Number.isInteger(index) || index < 0) return null

  const summaries = querySweepSummaryRowsSql(sqliteDb)
  if (summaries.length === 0) return null

  if (mode === 'single') {
    const summary = summaries[index]
    if (!summary) return null
    return {
      id: summary.sweepId,
      mode,
      sweeps: [
        {
          direction: summary.direction,
          points: querySweepPointsByRangeWithOrm(
            db,
            summary.startTs,
            summary.endTs
          ),
        },
      ],
    }
  }

  const start = index * 2
  const first = summaries[start]
  if (!first) return null
  const second = summaries[start + 1]
  const selected = second ? [first, second] : [first]
  return {
    id: second ? `${first.sweepId}|${second.sweepId}` : first.sweepId,
    mode,
    sweeps: selected.map((s) => ({
      direction: s.direction,
      points: querySweepPointsByRangeWithOrm(db, s.startTs, s.endTs),
    })),
  }
}

/**
 * 查询最近 N 趟扫描的摘要信息（不含点数据）。
 *
 * @param sqliteDb  原生 better-sqlite3 实例
 * @param limit     返回的扫描趟数
 * @param _maxPulse 最大脉冲值（保留参数，当前未使用）
 * @param beforeTs  可选：仅返回该时间戳之前的扫描趟
 */
export function queryLatestSweepSummaries(
  sqliteDb: Database.Database,
  limit: number,
  _maxPulse: number,
  beforeTs = 0
): SweepSummaryResult[] {
  void _maxPulse
  return querySweepSummaryRowsSql(sqliteDb, limit, beforeTs)
}

/**
 * 按时间区间查询一趟扫描的全部采样点（去冗余）。
 *
 * @param db      Drizzle 实例
 * @param startTs 起始时间戳 (ms)
 * @param endTs   结束时间戳 (ms)
 */
export function querySweepPointsByTimeRange(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startTs: number,
  endTs: number
): { pos: number; ad: number; ts: number }[] {
  return querySweepPointsByRangeWithOrm(db, startTs, endTs)
}

/**
 * 返回全部扫描趟摘要（按时间降序）。
 *
 * ⚠️ 单次调用复杂度 O(N)，调用方应缓存结果避免重复扫描。
 */
export function queryAllSweepSummaries(
  sqliteDb: Database.Database
): SweepSummaryResult[] {
  return querySweepSummaryRowsSql(sqliteDb)
}
