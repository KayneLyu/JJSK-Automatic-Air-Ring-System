import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, gte, lt, desc, sql } from 'drizzle-orm'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'
import {
  querySweepPointsByRangeWithOrm,
  type SweepIndexedResult,
  type SweepSummaryResult,
} from './sweepHistory'
import migrationSql from './migrations/0000_glossy_bloodstrike.sql?raw'

export class SQLiteService {
  private db!: ReturnType<typeof drizzle<typeof schema>>
  private sqliteDb!: Database.Database
  private dbPath = ''
  private ready = false

  private batchBuffer: {
    thickness: (typeof schema.thicknessRaw.$inferInsert)[]
    rotation: (typeof schema.rotationRaw.$inferInsert)[]
    airRing: (typeof schema.airRingRaw.$inferInsert)[]
  }

  constructor() {
    this.batchBuffer = {
      thickness: [],
      rotation: [],
      airRing: [],
    }
  }

  init(dbDir: string): void {
    mkdirSync(dbDir, { recursive: true })
    this.dbPath = join(dbDir, 'jjsk.db')

    this.sqliteDb = new Database(this.dbPath)
    this.sqliteDb.exec('PRAGMA journal_mode=OFF')
    this.sqliteDb.exec('PRAGMA synchronous=OFF')
    this.sqliteDb.exec('PRAGMA cache_size=-400000')

    for (const chunk of migrationSql.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        try {
          this.sqliteDb.exec(trimmed)
        } catch {
          /* ok */
        }
      }
    }

    this.db = drizzle(this.sqliteDb, { schema })
    this.ready = true
  }

  private changes(): number {
    const row = this.sqliteDb.prepare('SELECT changes() as cnt').get() as
      | { cnt: number }
      | undefined
    return Number(row?.cnt ?? 0)
  }

  // ══ 批量缓冲写入 ══

  pushThickness(
    ts: number,
    pulse: number,
    ad: number,
    source: string,
    airAD = 0,
    gain = 1.0
  ): void {
    if (!this.ready) return
    this.batchBuffer.thickness.push({
      timestamp: ts,
      pulse,
      ad,
      source,
      airAD,
      gain,
    })
  }

  pushRotation(
    ts: number,
    forwardRotation: number,
    reverseRotation: number,
    motorFrequency: number,
    forwardDirChange: number,
    reverseDirChange: number,
    reset: number,
    heats: number[]
  ): void {
    if (!this.ready) return
    this.batchBuffer.rotation.push({
      timestamp: ts,
      forwardRotation,
      reverseRotation,
      motorFrequency,
      forwardDirChange,
      reverseDirChange,
      reset,
      heats: JSON.stringify(heats),
    })
  }

  pushAirRing(
    ts: number,
    channelHeats: number[],
    isAuto: number,
    sigma: number,
    corrR: number
  ): void {
    if (!this.ready) return
    this.batchBuffer.airRing.push({
      timestamp: ts,
      channelHeats: JSON.stringify(channelHeats),
      isAuto,
      sigma,
      corrR,
    })
  }

  flush() {
    const counts = {
      thickness: this.batchBuffer.thickness.length,
      rotation: this.batchBuffer.rotation.length,
      airRing: this.batchBuffer.airRing.length,
    }

    if (
      counts.thickness === 0 &&
      counts.rotation === 0 &&
      counts.airRing === 0
    ) {
      return counts
    }

    if (!this.ready) return counts

    this.sqliteDb.exec('BEGIN')
    try {
      if (counts.thickness > 0) {
        for (const item of this.batchBuffer.thickness) {
          this.db.insert(schema.thicknessRaw).values(item).run()
        }
      }
      if (counts.rotation > 0) {
        for (const item of this.batchBuffer.rotation) {
          this.db.insert(schema.rotationRaw).values(item).run()
        }
      }
      if (counts.airRing > 0) {
        for (const item of this.batchBuffer.airRing) {
          this.db.insert(schema.airRingRaw).values(item).run()
        }
      }
      this.sqliteDb.exec('COMMIT')
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }

    this.batchBuffer.thickness = []
    this.batchBuffer.rotation = []
    this.batchBuffer.airRing = []

    return counts
  }

  // ══ 查询 ══

  queryThicknessRaw(startMs: number, endMs: number): ThicknessRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.thicknessRaw)
      .where(
        and(
          gte(schema.thicknessRaw.timestamp, startMs),
          lt(schema.thicknessRaw.timestamp, endMs)
        )
      )
      .orderBy(schema.thicknessRaw.timestamp)
      .all() as ThicknessRawRow[]
  }

  countThicknessRawInRange(startMs: number, endMs: number): number {
    if (!this.ready) return 0
    const result = this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.thicknessRaw)
      .where(
        and(
          gte(schema.thicknessRaw.timestamp, startMs),
          lt(schema.thicknessRaw.timestamp, endMs)
        )
      )
      .get()
    return result?.count ?? 0
  }

  queryThicknessRawPage(
    startMs: number,
    endMs: number,
    limit: number,
    offset: number
  ): ThicknessRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.thicknessRaw)
      .where(
        and(
          gte(schema.thicknessRaw.timestamp, startMs),
          lt(schema.thicknessRaw.timestamp, endMs)
        )
      )
      .orderBy(schema.thicknessRaw.timestamp)
      .limit(limit)
      .offset(offset)
      .all() as ThicknessRawRow[]
  }

  countRotationRawInRange(startMs: number, endMs: number): number {
    if (!this.ready) return 0
    const result = this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.rotationRaw)
      .where(
        and(
          gte(schema.rotationRaw.timestamp, startMs),
          lt(schema.rotationRaw.timestamp, endMs)
        )
      )
      .get()
    return result?.count ?? 0
  }

  queryRotationRawPage(
    startMs: number,
    endMs: number,
    limit: number,
    offset: number
  ): RotationRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.rotationRaw)
      .where(
        and(
          gte(schema.rotationRaw.timestamp, startMs),
          lt(schema.rotationRaw.timestamp, endMs)
        )
      )
      .orderBy(schema.rotationRaw.timestamp)
      .limit(limit)
      .offset(offset)
      .all() as RotationRawRow[]
  }

  queryRotationRaw(startMs: number, endMs: number): RotationRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.rotationRaw)
      .where(
        and(
          gte(schema.rotationRaw.timestamp, startMs),
          lt(schema.rotationRaw.timestamp, endMs)
        )
      )
      .orderBy(schema.rotationRaw.timestamp)
      .all() as RotationRawRow[]
  }

  getLatestThicknessTimestamp(): number | null {
    if (!this.ready) return null
    const row = this.sqliteDb
      .prepare('SELECT MAX(timestamp) as ts FROM thickness_raw')
      .get() as { ts: number | null } | undefined
    return row?.ts ?? null
  }

  queryLatestThicknessRaw(limit: number): ThicknessRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.thicknessRaw)
      .orderBy(desc(schema.thicknessRaw.timestamp))
      .limit(limit)
      .all()
      .reverse() as ThicknessRawRow[]
  }

  queryLatestRotationRaw(limit: number): RotationRawRow[] {
    if (!this.ready) return []
    return this.db
      .select()
      .from(schema.rotationRaw)
      .orderBy(desc(schema.rotationRaw.timestamp))
      .limit(limit)
      .all()
      .reverse() as RotationRawRow[]
  }

  /**
   * 取最近 N 个方向变化事件（forwardDirChange / reverseDirChange 任一非 0）
   * 用于「最近 N 趟扫描」分页查询：每次需要 N+1 个事件才能拼出 N 趟完整扫描
   */
  queryLatestDirectionChanges(count: number, beforeTs = 0): RotationRawRow[] {
    if (!this.ready) return []
    const whereParts = ['(forwardDirChange > 0 OR reverseDirChange > 0)']
    const params: (number | string)[] = []
    if (beforeTs > 0) {
      whereParts.push('timestamp < ?')
      params.push(beforeTs)
    }
    params.push(count)
    return this.sqliteDb
      .prepare(
        `SELECT * FROM rotation_raw WHERE ${whereParts.join(' AND ')} ` +
          `ORDER BY timestamp DESC LIMIT ?`
      )
      .all(...params) as RotationRawRow[]
  }

  querySweepCountByMode(mode: 'single' | 'round'): number {
    if (!this.ready) return 0
    const summaries = this.#querySweepSummaryRowsSql()
    if (mode === 'single') return summaries.length
    return Math.ceil(summaries.length / 2)
  }

  querySweepIdsByMode(mode: 'single' | 'round'): string[] {
    if (!this.ready) return []
    const summaries = this.#querySweepSummaryRowsSql()
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

  querySweepByIndex(
    mode: 'single' | 'round',
    index: number
  ): SweepIndexedResult | null {
    if (!this.ready) return null
    if (!Number.isInteger(index) || index < 0) return null

    const summaries = this.#querySweepSummaryRowsSql()
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
              this.db,
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
        points: querySweepPointsByRangeWithOrm(this.db, s.startTs, s.endTs),
      })),
    }
  }

  queryLatestSweepSummaries(
    limit: number,
    maxPulse: number,
    beforeTs = 0
  ): SweepSummaryResult[] {
    if (!this.ready) return []
    const _ = maxPulse
    void _
    return this.#querySweepSummaryRowsSql(limit, beforeTs)
  }

  /**
   * 按时间区间查询单趟扫描的全部采样点
   *
   * 适用于已知 summary 范围、需要拉点数据做二次计算的场景
   * （如膜宽标定的寻边算法）。与 querySweepByIndex 不同，此方法
   * 不做 trip 切分计算，直接按时间戳范围拉点，性能与时间范围大小成正比。
   */
  querySweepPointsByTimeRange(
    startTs: number,
    endTs: number
  ): { pos: number; ad: number; ts: number }[] {
    if (!this.ready) return []
    return querySweepPointsByRangeWithOrm(this.db, startTs, endTs)
  }

  /**
   * 返回全部 trip summary（按时间正序）。
   *
   * 内部走全表 6-CTE trip 切分流水线，单次调用代价较高（O(N)）。
   * 调用方应避免在同一请求中重复调用 — 拿到结果后基于本地缓存自行切片。
   * 用于替代循环调用 querySweepByIndex 造成的 N×O(N) 重复扫描。
   */
  queryAllSweepSummaries(): SweepSummaryResult[] {
    if (!this.ready) return []
    return this.#querySweepSummaryRowsSql()
  }

  #querySweepSummaryRowsSql(limitRows = 0, beforeTs = 0): SweepSummaryResult[] {
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

    const rows = this.sqliteDb.prepare(query).all(...params) as {
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

  querySweepPointsByRange(
    startTs: number,
    endTs: number
  ): { pos: number; ad: number; ts: number }[] {
    if (!this.ready) return []
    return querySweepPointsByRangeWithOrm(this.db, startTs, endTs)
  }

  importSweep(
    pulses: number[],
    adValues: number[],
    airAD: number,
    gain: number,
    source: string
  ): number {
    if (!this.ready) return 0
    const ts = Date.now()

    let count = 0
    this.sqliteDb.exec('BEGIN')
    try {
      for (let i = 0; i < pulses.length; i++) {
        const pulse = pulses[i]
        const ad = adValues[i]
        if (pulse < 0 || ad <= 0) continue
        this.db
          .insert(schema.thicknessRaw)
          .values({ timestamp: ts + i, pulse, ad, source, airAD, gain })
          .run()
        count++
      }

      this.sqliteDb.exec('COMMIT')
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }

    return count > 0 ? 1 : 0
  }

  cleanup(beforeMs: number) {
    if (!this.ready) return { thickness: 0, rotation: 0, airRing: 0 }
    this.sqliteDb.exec('BEGIN')
    try {
      this.db
        .delete(schema.thicknessRaw)
        .where(lt(schema.thicknessRaw.timestamp, beforeMs))
        .run()
      const t = this.changes()

      this.db
        .delete(schema.rotationRaw)
        .where(lt(schema.rotationRaw.timestamp, beforeMs))
        .run()
      const r = this.changes()

      this.db
        .delete(schema.airRingRaw)
        .where(lt(schema.airRingRaw.timestamp, beforeMs))
        .run()
      const a = this.changes()

      this.sqliteDb.exec('COMMIT')
      return { thickness: t, rotation: r, airRing: a }
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }
  }

  queryFramesByTimeRange(
    startMs: number,
    endMs: number,
    limit: number,
    maxPulse: number
  ): FrameRow[] {
    if (!this.ready) return []

    const rows = this.db
      .select()
      .from(schema.thicknessRaw)
      .where(
        and(
          gte(schema.thicknessRaw.timestamp, startMs),
          lt(schema.thicknessRaw.timestamp, endMs)
        )
      )
      .orderBy(schema.thicknessRaw.timestamp)
      .all() as ThicknessRawRow[]

    if (rows.length < 3) return []

    // 全局压缩相邻相同 pulse（方向检测需要消去 d=0 的干扰）
    const compacted: ThicknessRawRow[] = [rows[0]]
    for (let i = 1; i < rows.length; i++) {
      const last = compacted[compacted.length - 1]
      if (last.pulse === rows[i].pulse) {
        last.ad = rows[i].ad
      } else {
        compacted.push(rows[i])
      }
    }

    const sweeps: {
      direction: 'forward' | 'backward'
      rows: ThicknessRawRow[]
    }[] = []
    let buf: ThicknessRawRow[] = []

    for (let i = 0; i < compacted.length; i++) {
      buf.push(compacted[i])
      if (buf.length < 3) continue
      const d0 = buf[buf.length - 1].pulse - buf[buf.length - 2].pulse
      const d1 = buf[buf.length - 2].pulse - buf[buf.length - 3].pulse
      if ((d1 < 0 && d0 > 0) || (d1 > 0 && d0 < 0)) {
        const sweepRows = buf.slice(0, -1)
        const dir =
          sweepRows[sweepRows.length - 1].pulse > sweepRows[0].pulse
            ? 'forward'
            : 'backward'
        sweeps.push({ direction: dir, rows: sweepRows })
        buf = buf.slice(-1)
      }
    }

    if (sweeps.length > 0) {
      const s = sweeps[0]
      const span = Math.abs(s.rows[s.rows.length - 1].pulse - s.rows[0].pulse)
      if (span < maxPulse * 0.85) sweeps.shift()
    }

    return sweeps.slice(0, limit).map((sweep, idx) => {
      const adValues = sweep.rows.map((r) => r.ad)
      const mean = adValues.reduce((a, b) => a + b, 0) / adValues.length
      const differences = adValues.map((v) => v - mean)
      const variance =
        differences.reduce((sum, d) => sum + d * d, 0) / adValues.length
      const sigma = Math.sqrt(variance) * 2
      const minVal = Math.min(...adValues)
      const maxVal = Math.max(...adValues)
      const sigmaPercent = mean !== 0 ? (sigma / mean) * 100 : 0
      const minPercent = mean !== 0 ? ((minVal - mean) / mean) * 100 : 0
      const maxPercent = mean !== 0 ? ((maxVal - mean) / mean) * 100 : 0

      const firstRow = sweep.rows[0]
      const lastRow = sweep.rows[sweep.rows.length - 1]

      return {
        frameId: idx + 1,
        startTime: new Date(firstRow.timestamp)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19),
        endTime: new Date(lastRow.timestamp)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19),
        startTimestamp: firstRow.timestamp,
        endTimestamp: lastRow.timestamp,
        speed: 0,
        width: 0,
        rotateSpeed: 0,
        sigmaVal: Number(sigma.toFixed(1)),
        sigmaPercent: Number(sigmaPercent.toFixed(1)),
        mean: Number(mean.toFixed(1)),
        minVal: Number(minVal.toFixed(1)),
        minPercent: Number(minPercent.toFixed(1)),
        maxVal: Number(maxVal.toFixed(1)),
        maxPercent: Number(maxPercent.toFixed(1)),
        IsBackw: sweep.direction === 'backward' ? 1 : 0,
        datalist: JSON.stringify(adValues),
        rawDatalist: JSON.stringify(adValues),
        source: firstRow.source,
        airAD: firstRow.airAD,
        gain: firstRow.gain,
      }
    })
  }

  close(): void {
    this.ready = false
    try {
      this.flush()
    } catch (err) {
      console.error('[SQLite] flush on close error:', err)
    }
    this.sqliteDb.close()
  }
}

// ══ 类型定义 ══

export interface RotationRawRow {
  id: number
  timestamp: number
  forwardRotation: number
  reverseRotation: number
  motorFrequency: number
  forwardDirChange: number
  reverseDirChange: number
  reset: number
  heats: string
}

export interface ThicknessRawRow {
  id: number
  timestamp: number
  pulse: number
  ad: number
  source: string
  airAD: number
  gain: number
}

export interface AirRingRawRow {
  id: number
  timestamp: number
  pct: number
  open: number
}

export interface FrameRow {
  frameId: number
  startTime: string
  endTime: string
  startTimestamp: number
  endTimestamp: number
  speed: number
  width: number
  rotateSpeed: number
  sigmaVal: number
  sigmaPercent: number
  mean: number
  minVal: number
  minPercent: number
  maxVal: number
  maxPercent: number
  IsBackw: number
  datalist: string
  rawDatalist: string
  source: string
  airAD: number
  gain: number
}

export { schema }
