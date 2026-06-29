/**
 * 历史数据一次性回填
 *
 * 首次启动时运行 6-CTE SQL，从 thickness_raw 切分全部历史扫描趟，
 * 批量写入 scan_pass 物化表。仅当 scan_pass 为空时执行（幂等）。
 *
 * 回填完成后所有扫描趟查询将直接走 scan_pass 表，不再需要 6-CTE。
 */
import type Database from 'better-sqlite3'

/** 扫描趟切分 6-CTE — 用于历史数据一次性回填，回填完成后不再使用 */
const BACKFILL_CTE = `
WITH source AS (
  SELECT id, timestamp AS ts, pulse AS pos FROM thickness_raw ORDER BY timestamp ASC, id ASC
),
dedup AS (
  SELECT id, ts, pos FROM (
    SELECT id, ts, pos, LAG(pos) OVER (ORDER BY ts, id) AS prev_pos FROM source
  ) t WHERE prev_pos IS NULL OR pos <> prev_pos
),
dir_calc AS (
  SELECT id, ts, pos,
    CASE
      WHEN LAG(pos) OVER (ORDER BY ts, id) IS NULL THEN NULL
      WHEN pos > LAG(pos) OVER (ORDER BY ts, id) THEN 1
      WHEN pos < LAG(pos) OVER (ORDER BY ts, id) THEN -1
      ELSE NULL
    END AS dir
  FROM dedup
),
trip_seed AS (
  SELECT id, ts, pos, dir, LAG(dir) OVER (ORDER BY ts, id) AS prev_dir FROM dir_calc
),
trip_rows AS (
  SELECT id, ts, pos, dir,
    SUM(CASE WHEN dir IS NOT NULL AND prev_dir IS NOT NULL AND dir <> prev_dir THEN 1 ELSE 0 END)
      OVER (ORDER BY ts, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) + 1 AS trip_id
  FROM trip_seed WHERE dir IS NOT NULL
),
trip_stats AS (
  SELECT trip_id,
    CASE WHEN MIN(dir) >= 0 THEN 1 ELSE 0 END AS scanner_direction,
    MIN(ts) AS start_ts,
    MAX(ts) AS end_ts,
    COUNT(*) AS point_count,
    MAX(trip_id) OVER () AS max_trip_id
  FROM trip_rows GROUP BY trip_id
)
SELECT scanner_direction, start_ts, end_ts
FROM trip_stats
WHERE point_count >= 3 AND trip_id < max_trip_id
ORDER BY start_ts ASC
`

/**
 * 首次启动回填：从 thickness_raw 切分历史扫描趟写入 scan_pass。
 *
 * - 幂等：仅当 scan_pass 表为空时执行
 * - 历史数据 pulse_min/max/valid_ratio 填 0
 * - 回填后自动关联已有 rotation_trip
 *
 * @returns 回填的扫描趟数
 */
export function backfillScanPassesHistory(sqliteDb: Database.Database): number {
  const existing = sqliteDb
    .prepare('SELECT COUNT(*) as cnt FROM scan_pass')
    .get() as { cnt: number } | undefined
  if ((existing?.cnt ?? 0) > 0) {
    console.log('[Backfill] scan_pass 已有数据，跳过历史回填')
    return 0
  }

  console.log('[Backfill] 开始回填历史扫描趟数据到 scan_pass...')
  const startTime = performance.now()

  const rows = sqliteDb.prepare(BACKFILL_CTE).all() as {
    scanner_direction: number
    start_ts: number
    end_ts: number
  }[]

  if (rows.length === 0) {
    console.log('[Backfill] 无历史扫描趟数据可回填')
    return 0
  }

  const now = Date.now()
  const insert = sqliteDb.prepare(
    `INSERT INTO scan_pass (scanner_direction, start_ts, end_ts, pulse_min, pulse_max, valid_ratio, status, created_at)
     VALUES (?, ?, ?, 0, 0, 0, 'complete', ?)`
  )

  sqliteDb.exec('BEGIN')
  try {
    for (const row of rows) {
      insert.run(row.scanner_direction, row.start_ts, row.end_ts, now)
    }
    sqliteDb.exec('COMMIT')
  } catch (e) {
    sqliteDb.exec('ROLLBACK')
    throw e
  }

  // 关联已有 rotation_trip — 使用单条 correlated UPDATE 替代 N 条逐行 UPDATE
  const rotationTrips = sqliteDb
    .prepare('SELECT id FROM rotation_trip LIMIT 1')
    .all() as { id: number }[]
  if (rotationTrips.length > 0) {
    sqliteDb.exec(`
      UPDATE scan_pass SET rotation_trip_id = (
        SELECT rt.id FROM rotation_trip rt
        WHERE scan_pass.start_ts >= rt.start_ts AND scan_pass.end_ts <= rt.end_ts
        ORDER BY rt.start_ts ASC LIMIT 1
      )
      WHERE rotation_trip_id IS NULL
    `)
  }

  const elapsed = performance.now() - startTime
  console.log(
    `[Backfill] 完成：${rows.length} 个扫描趟，耗时 ${(elapsed / 1000).toFixed(1)}s`
  )
  return rows.length
}
