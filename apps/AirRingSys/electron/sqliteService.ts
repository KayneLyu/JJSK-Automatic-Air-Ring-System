import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and, gte, lt, lte, desc, sql } from 'drizzle-orm'
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from './db/schema'
import { calcThicknessClient, buildSweepDataList } from './db/helpers'
import migrationSql from './db/migrations/0000_glossy_bloodstrike.sql?raw'

export class SQLiteService {
  private db!: ReturnType<typeof drizzle<typeof schema>>
  private sqliteDb!: Database.Database
  private dbPath = ''

  private batchBuffer: {
    thickness: (typeof schema.thicknessRaw.$inferInsert)[]
    rotation: (typeof schema.rotationRaw.$inferInsert)[]
    airRing: (typeof schema.airRingRaw.$inferInsert)[]
    frame: FrameBatchItem[]
  }

  constructor() {
    this.batchBuffer = {
      thickness: [],
      rotation: [],
      airRing: [],
      frame: [],
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
  }

  private lastInsertRowid(): number {
    const row = this.sqliteDb
      .prepare('SELECT last_insert_rowid() as id')
      .get() as { id: number } | undefined
    return Number(row?.id ?? 0)
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
    pos: number,
    ad: number,
    source: string,
    airAD = 0,
    gain = 1.0
  ): void {
    this.batchBuffer.thickness.push({
      timestamp: ts,
      pos,
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
    this.batchBuffer.airRing.push({
      timestamp: ts,
      channelHeats: JSON.stringify(channelHeats),
      isAuto,
      sigma,
      corrR,
    })
  }

  pushFrame(frame: FrameBatchItem): void {
    this.batchBuffer.frame.push(frame)
  }

  flush() {
    const counts = {
      thickness: this.batchBuffer.thickness.length,
      rotation: this.batchBuffer.rotation.length,
      airRing: this.batchBuffer.airRing.length,
      frame: this.batchBuffer.frame.length,
    }

    if (
      counts.thickness === 0 &&
      counts.rotation === 0 &&
      counts.airRing === 0 &&
      counts.frame === 0
    ) {
      return counts
    }

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
      if (counts.frame > 0) {
        for (const item of this.batchBuffer.frame) {
          this.db
            .insert(schema.frame)
            .values({ ...item, IsBackw: item.IsBackw ? 1 : 0 })
            .run()
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
    this.batchBuffer.frame = []

    return counts
  }

  // ══ 查询 ══

  queryThicknessRaw(startMs: number, endMs: number): ThicknessRawRow[] {
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

  queryFrames(limit = 100, offset = 0): FrameRow[] {
    return this.db
      .select()
      .from(schema.frame)
      .orderBy(desc(schema.frame.frameId))
      .limit(limit)
      .offset(offset)
      .all() as FrameRow[]
  }

  queryFramesByTime(startMs: number, endMs: number, limit = 100): FrameRow[] {
    return this.db
      .select()
      .from(schema.frame)
      .where(
        and(
          gte(schema.frame.startTimestamp, startMs),
          lt(schema.frame.endTimestamp, endMs)
        )
      )
      .orderBy(desc(schema.frame.frameId))
      .limit(limit)
      .all() as FrameRow[]
  }

  getLatestFrame(): FrameRow | undefined {
    const row = this.db
      .select()
      .from(schema.frame)
      .orderBy(desc(schema.frame.frameId))
      .limit(1)
      .get() as FrameRow | undefined
    return row
  }

  queryRotationRaw(startMs: number, endMs: number): RotationRawRow[] {
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

  queryLatestThicknessRaw(limit: number): ThicknessRawRow[] {
    return this.db
      .select()
      .from(schema.thicknessRaw)
      .orderBy(desc(schema.thicknessRaw.timestamp))
      .limit(limit)
      .all()
      .reverse() as ThicknessRawRow[]
  }

  queryLatestRotationRaw(limit: number): RotationRawRow[] {
    return this.db
      .select()
      .from(schema.rotationRaw)
      .orderBy(desc(schema.rotationRaw.timestamp))
      .limit(limit)
      .all()
      .reverse() as RotationRawRow[]
  }

  queryFramesByIdRange(startId: number, endId: number): FrameRow[] {
    return this.db
      .select()
      .from(schema.frame)
      .where(
        and(
          gte(schema.frame.frameId, startId),
          lte(schema.frame.frameId, endId)
        )
      )
      .orderBy(schema.frame.frameId)
      .all() as FrameRow[]
  }

  queryLatestFrames(count: number): FrameRow[] {
    return this.db
      .select()
      .from(schema.frame)
      .orderBy(desc(schema.frame.frameId))
      .limit(count)
      .all()
      .reverse() as FrameRow[]
  }

  getLatestThicknessTimestamp(): number | null {
    const row = this.sqliteDb
      .prepare('SELECT MAX(timestamp) as ts FROM thickness_raw')
      .get() as { ts: number | null } | undefined
    return row?.ts ?? null
  }

  importSweep(
    pulses: number[],
    adValues: number[],
    airAD: number,
    gain: number,
    source: string
  ): number {
    const ts = Date.now()
    const rawDatalist = buildSweepDataList(pulses, adValues)
    const thickness = rawDatalist.map((ad) =>
      calcThicknessClient(ad, airAD, gain)
    )
    const validValues = thickness.filter((v) => v > 0)

    if (validValues.length < 100) return 0

    const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length
    const variance =
      validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length
    const sigmaVal = Math.sqrt(variance) * 2
    const sigmaPercent = mean > 0 ? (sigmaVal / mean) * 100 : 0
    const minVal = Math.min(...validValues)
    const maxVal = Math.max(...validValues)

    let frameId = 0

    this.sqliteDb.exec('BEGIN')
    try {
      for (let i = 0; i < pulses.length; i++) {
        const pulse = pulses[i]
        const ad = adValues[i]
        if (pulse < 0 || pulse > 6999 || ad <= 0) continue
        this.db
          .insert(schema.thicknessRaw)
          .values({ timestamp: ts + i, pos: pulse, ad, source, airAD, gain })
          .run()
      }

      const now = new Date(ts)
      const tpl = (n: number) => String(n).padStart(2, '0')
      const timeStr = `${now.getFullYear()}-${tpl(now.getMonth() + 1)}-${tpl(now.getDate())} ${tpl(now.getHours())}:${tpl(now.getMinutes())}:${tpl(now.getSeconds())}`

      this.db
        .insert(schema.frame)
        .values({
          startTime: timeStr,
          endTime: timeStr,
          startTimestamp: ts,
          endTimestamp: ts,
          speed: 0,
          width: 0,
          rotateSpeed: 0,
          sigmaVal: Math.round(sigmaVal * 100) / 100,
          sigmaPercent: Math.round(sigmaPercent * 100) / 100,
          mean: Math.round(mean * 100) / 100,
          minVal,
          minPercent:
            mean > 0 ? Math.round((1 - minVal / mean) * 10000) / 100 : 0,
          maxVal,
          maxPercent:
            mean > 0 ? Math.round((maxVal / mean - 1) * 10000) / 100 : 0,
          IsBackw: 0,
          source,
          airAD,
          gain,
        })
        .run()

      frameId = this.lastInsertRowid()

      this.sqliteDb.exec('COMMIT')
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }

    return frameId
  }

  cleanup(beforeMs: number) {
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

      this.db
        .delete(schema.frame)
        .where(lt(schema.frame.startTimestamp, beforeMs))
        .run()
      const f = this.changes()

      this.sqliteDb.exec('COMMIT')
      return { thickness: t, rotation: r, airRing: a, frame: f }
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }
  }

  close(): void {
    try {
      this.flush()
    } catch (err) {
      console.error('[SQLite] flush on close error:', err)
    }
    this.sqliteDb.close()
  }
}

// ══ 类型定义 ══

export interface FrameBatchItem {
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
  IsBackw: boolean
  source: string
  airAD: number
  gain: number
  datalist?: number[]
  rawDatalist?: number[]
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
  pos: number
  ad: number
  source: string
  airAD: number
  gain: number
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
  source: string
  airAD: number
  gain: number
}
