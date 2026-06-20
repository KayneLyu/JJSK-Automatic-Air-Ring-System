import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, gte, lt, desc, sql } from 'drizzle-orm'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from './db/schema'
import migrationSql from './db/migrations/0000_glossy_bloodstrike.sql?raw'

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

  init(): void {
    const dbDir = join(app.getPath('userData'), 'db')
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

  queryLatestSweeps(
    limit: number,
    maxPulse: number,
    beforeTs = 0
  ): SweepResult[] {
    if (!this.ready) return []
    const raw = (
      this.db
        .select({
          pos: schema.thicknessRaw.pulse,
          ad: schema.thicknessRaw.ad,
          ts: schema.thicknessRaw.timestamp,
        })
        .from(schema.thicknessRaw)
        .where(beforeTs > 0 ? lt(schema.thicknessRaw.timestamp, beforeTs) : undefined)
        .orderBy(desc(schema.thicknessRaw.timestamp))
        .limit(limit)
        .all() as { pos: number; ad: number; ts: number }[]
    ).reverse()

    return this.#groupSweeps(raw, maxPulse, beforeTs > 0)
  }

  queryLatestSweepsCount(mode: 'single' | 'round', maxPulse: number): number {
    if (!this.ready) return 0
    const raw = (
      this.db
        .select({
          pos: schema.thicknessRaw.pulse,
          ad: schema.thicknessRaw.ad,
          ts: schema.thicknessRaw.timestamp,
        })
        .from(schema.thicknessRaw)
        .orderBy(desc(schema.thicknessRaw.timestamp))
        .limit(1000000)
        .all() as { pos: number; ad: number; ts: number }[]
    ).reverse()

    const sweeps = this.#groupSweeps(raw, maxPulse)
    if (mode === 'single') return sweeps.length
    return Math.ceil(sweeps.length / 2)
  }

  #groupSweeps(
    rows: { pos: number; ad: number; ts: number }[],
    maxPulse: number,
    keepFirst = false
  ): SweepResult[] {
    if (rows.length < 3) return []

    // 全局压缩相邻相同 pulse：AD 取平均值，时间戳取最后一条
    const compacted: { pos: number; ad: number; ts: number }[] = [
      { pos: rows[0].pos, ad: rows[0].ad, ts: rows[0].ts },
    ]
    let count = 1
    for (let i = 1; i < rows.length; i++) {
      const last = compacted[compacted.length - 1]
      if (last.pos === rows[i].pos) {
        last.ad = (last.ad * count + rows[i].ad) / (count + 1)
        last.ts = rows[i].ts
        count++
      } else {
        compacted.push({ pos: rows[i].pos, ad: rows[i].ad, ts: rows[i].ts })
        count = 1
      }
    }

    const sweeps: SweepResult[] = []
    let buf: { pos: number; ad: number; ts: number }[] = []

    for (let i = 0; i < compacted.length; i++) {
      buf.push(compacted[i])
      if (buf.length < 3) continue
      const d0 = buf[buf.length - 1].pos - buf[buf.length - 2].pos
      const d1 = buf[buf.length - 2].pos - buf[buf.length - 3].pos
      if ((d1 < 0 && d0 > 0) || (d1 > 0 && d0 < 0)) {
        const pts = buf.slice(0, -1)
        const dir =
          pts[pts.length - 1].pos > pts[0].pos ? 'forward' : 'backward'
        sweeps.push({ direction: dir, points: pts })
        buf = buf.slice(-1)
      }
    }

    if (!keepFirst && sweeps.length > 0) {
      const s = sweeps[0]
      const span = Math.abs(s.points[s.points.length - 1].pos - s.points[0].pos)
      if (span < maxPulse * 0.85) sweeps.shift()
    }

    return sweeps
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

export interface SweepResult {
  direction: 'forward' | 'backward'
  points: { pos: number; ad: number; ts: number }[]
}

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
