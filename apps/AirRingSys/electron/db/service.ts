/**
 * SQLite 数据服务 — 吹膜机数据管线的持久化层
 *
 * 职责：
 * - 初始化 SQLite 数据库 + Drizzle ORM + 自动迁移
 * - 批量缓冲写入（500ms flush 间隔）thickness_raw / rotation_raw / airRing_raw
 * - 原始数据查询委托给 rawQueries、扫描趟查询委托给 scanPassQueries
 * - 双趟模型写入：scan_pass（约 30s/趟）、rotation_trip（约 6-8min/趟）
 * - 首次启动自动回填历史 scan_pass 数据（6-CTE → scan_pass 一次性迁移）
 *
 * 运行在 Electron utilityProcess 中，不阻塞 UI 线程。
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import * as schema from './schema'
import {
  querySweepPointsByRangeWithOrm,
  type SweepIndexedResult,
  type SweepSummaryResult,
} from './sweepHistory'
import {
  querySweepCountByMode,
  querySweepIdsByMode,
  querySweepByIndex,
  queryLatestSweepSummaries,
  queryAllSweepSummaries,
} from './scanPassQueries'
import { importSweep, cleanup, queryFramesByTimeRange } from './sweepExport'
import { backfillScanPassesHistory } from './backfillHistory'
import {
  queryThicknessRaw,
  countThicknessRawInRange,
  queryThicknessRawPage,
  countRotationRawInRange,
  queryRotationRawPage,
  queryRotationRaw,
  getLatestThicknessTimestamp,
  queryLatestThicknessRaw,
  queryLatestRotationRaw,
  queryLatestDirectionChanges,
} from './rawQueries'
import migrationSql from './migrations/0000_glossy_bloodstrike.sql?raw'
import migrationSqlV1 from './migrations/0001_double_trip_model.sql?raw'
import { FrameRow, RotationRawRow, ThicknessRawRow } from './types'

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
    this.batchBuffer = { thickness: [], rotation: [], airRing: [] }
  }

  // ══ 生命周期 ══

  /**
   * 初始化数据库：
   * 1. 创建目录 + 打开 SQLite
   * 2. 执行 v0 + v1 迁移（IF NOT EXISTS，幂等）
   * 3. 首次启动时从 thickness_raw 回填历史 scan_pass 数据（setImmediate 异步）
   */
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
        try { this.sqliteDb.exec(trimmed) } catch (e) { console.error('[SQLite] v0 migration error:', e) }
      }
    }

    for (const chunk of migrationSqlV1.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        try { this.sqliteDb.exec(trimmed) } catch (e) { console.error('[SQLite] v1 migration error:', e) }
      }
    }

    this.db = drizzle(this.sqliteDb, { schema })
    this.ready = true

    // 首次启动：回填历史 scan_pass — 异步执行，不阻塞 init 完成
    // 6-CTE 在大数据库上可能耗时 20+ 秒，会撑爆主进程 15s init 超时窗口。
    // 推迟到下一个事件循环 tick 执行：init() 立即返回，worker 可立即发 Phase 2 ready
    // 清掉主进程 15s 定时器；回填在后台跑完后写入 scan_pass。
    // backfillScanPassesHistory 自身幂等（scan_pass 非空时立即返回 0）。
    setImmediate(() => {
      try {
        backfillScanPassesHistory(this.sqliteDb)
      } catch (e) {
        console.error('[Backfill] 历史回填失败:', e)
      }
    })
  }

  /** 关闭数据库：先 flush 缓冲区，再关闭连接 */
  close(): void {
    this.ready = false
    try { this.flush() } catch (err) { console.error('[SQLite] flush on close error:', err) }
    this.sqliteDb.close()
  }

  /** 获取最近一次 INSERT 的 rowid */
  private getLastInsertId(): number {
    const row = this.sqliteDb.prepare('SELECT last_insert_rowid() as id').get() as
      | { id: number }
      | undefined
    return row?.id ?? 0
  }

  // ══ 批量缓冲写入 ══

  /** 向写缓冲区追加一条测厚原始数据 */
  pushThickness(ts: number, pulse: number, ad: number, source: string, airAD = 0, gain = 1.0): void {
    if (!this.ready) return
    this.batchBuffer.thickness.push({ timestamp: ts, pulse, ad, source, airAD, gain })
  }

  /** 向写缓冲区追加一条上旋原始数据 */
  pushRotation(
    ts: number, forwardRotation: number, reverseRotation: number, motorFrequency: number,
    forwardDirChange: number, reverseDirChange: number, reset: number, heats: number[]
  ): void {
    if (!this.ready) return
    this.batchBuffer.rotation.push({
      timestamp: ts, forwardRotation, reverseRotation, motorFrequency,
      forwardDirChange, reverseDirChange, reset, heats: JSON.stringify(heats),
    })
  }

  /** 向写缓冲区追加一条风环原始数据 */
  pushAirRing(ts: number, channelHeats: number[], isAuto: number, sigma: number, corrR: number): void {
    if (!this.ready) return
    this.batchBuffer.airRing.push({
      timestamp: ts, channelHeats: JSON.stringify(channelHeats), isAuto, sigma, corrR,
    })
  }

  /**
   * 将写缓冲区批量刷入 SQLite（事务提交）。
   * 由 DataPipeline 的 500ms 定时器触发。
   */
  flush() {
    const counts = {
      thickness: this.batchBuffer.thickness.length,
      rotation: this.batchBuffer.rotation.length,
      airRing: this.batchBuffer.airRing.length,
    }
    if (counts.thickness === 0 && counts.rotation === 0 && counts.airRing === 0) return counts
    if (!this.ready) return counts

    this.sqliteDb.exec('BEGIN')
    try {
      for (const item of this.batchBuffer.thickness) this.db.insert(schema.thicknessRaw).values(item).run()
      for (const item of this.batchBuffer.rotation) this.db.insert(schema.rotationRaw).values(item).run()
      for (const item of this.batchBuffer.airRing) this.db.insert(schema.airRingRaw).values(item).run()
      this.sqliteDb.exec('COMMIT')
    } catch (e) {
      this.sqliteDb.exec('ROLLBACK')
      throw e
    }

    this.batchBuffer = { thickness: [], rotation: [], airRing: [] }
    return counts
  }

  // ══ 原始数据查询（委托 rawQueries） ══

  queryThicknessRaw(startMs: number, endMs: number): ThicknessRawRow[] {
    return this.ready ? queryThicknessRaw(this.db, startMs, endMs) : []
  }
  countThicknessRawInRange(startMs: number, endMs: number): number {
    return this.ready ? countThicknessRawInRange(this.db, startMs, endMs) : 0
  }
  queryThicknessRawPage(startMs: number, endMs: number, limit: number, offset: number): ThicknessRawRow[] {
    return this.ready ? queryThicknessRawPage(this.db, startMs, endMs, limit, offset) : []
  }
  countRotationRawInRange(startMs: number, endMs: number): number {
    return this.ready ? countRotationRawInRange(this.db, startMs, endMs) : 0
  }
  queryRotationRawPage(startMs: number, endMs: number, limit: number, offset: number): RotationRawRow[] {
    return this.ready ? queryRotationRawPage(this.db, startMs, endMs, limit, offset) : []
  }
  queryRotationRaw(startMs: number, endMs: number): RotationRawRow[] {
    return this.ready ? queryRotationRaw(this.db, startMs, endMs) : []
  }
  getLatestThicknessTimestamp(): number | null {
    return this.ready ? getLatestThicknessTimestamp(this.sqliteDb) : null
  }
  queryLatestThicknessRaw(limit: number): ThicknessRawRow[] {
    return this.ready ? queryLatestThicknessRaw(this.db, limit) : []
  }
  queryLatestRotationRaw(limit: number): RotationRawRow[] {
    return this.ready ? queryLatestRotationRaw(this.db, limit) : []
  }
  queryLatestDirectionChanges(count: number, beforeTs = 0): RotationRawRow[] {
    return this.ready ? queryLatestDirectionChanges(this.sqliteDb, count, beforeTs) : []
  }

  // ══ 扫描趟查询（委托 scanPassQueries — 基于 scan_pass 物化表） ══

  querySweepCountByMode(mode: 'single' | 'round'): number {
    return this.ready ? querySweepCountByMode(this.db, mode) : 0
  }
  querySweepIdsByMode(mode: 'single' | 'round'): string[] {
    return this.ready ? querySweepIdsByMode(this.db, mode) : []
  }
  querySweepByIndex(mode: 'single' | 'round', index: number): SweepIndexedResult | null {
    return this.ready ? querySweepByIndex(this.db, mode, index) : null
  }
  queryLatestSweepSummaries(limit: number, beforeTs = 0): SweepSummaryResult[] {
    return this.ready ? queryLatestSweepSummaries(this.db, limit, beforeTs) : []
  }
  querySweepPointsByTimeRange(startTs: number, endTs: number): { pos: number; ad: number; ts: number }[] {
    return this.ready ? querySweepPointsByRangeWithOrm(this.db, startTs, endTs) : []
  }
  queryAllSweepSummaries(): SweepSummaryResult[] {
    return this.ready ? queryAllSweepSummaries(this.db) : []
  }
  querySweepPointsByRange(startTs: number, endTs: number): { pos: number; ad: number; ts: number }[] {
    return this.ready ? querySweepPointsByRangeWithOrm(this.db, startTs, endTs) : []
  }

  // ══ 扫描趟导入/导出/清理（委托 sweepExport） ══

  importSweep(pulses: number[], adValues: number[], airAD: number, gain: number, source: string): number {
    return this.ready ? importSweep(this.db, this.sqliteDb, pulses, adValues, airAD, gain, source) : 0
  }
  cleanup(beforeMs: number): { thickness: number; rotation: number; airRing: number } {
    return this.ready ? cleanup(this.db, this.sqliteDb, beforeMs) : { thickness: 0, rotation: 0, airRing: 0 }
  }
  queryFramesByTimeRange(startMs: number, endMs: number, limit: number, maxPulse: number): FrameRow[] {
    return this.ready ? queryFramesByTimeRange(this.db, startMs, endMs, limit, maxPulse) : []
  }

  // ══ 双趟模型：写入 ══

  /**
   * 写入一个已完成的测厚仪扫描趟（~30s）。
   * 由 DataPipeline 在 scanPassDetector 检测到 pulse 方向翻转时调用。
   */
  insertScanPass(sp: {
    startTs: number; endTs: number; scannerDirection: number
    pulseMin: number; pulseMax: number; validRatio: number
  }): void {
    if (!this.ready) return
    const now = Date.now()
    this.db.insert(schema.scanPass).values({
      startTs: sp.startTs, endTs: sp.endTs, scannerDirection: sp.scannerDirection,
      pulseMin: sp.pulseMin, pulseMax: sp.pulseMax, validRatio: sp.validRatio,
      status: 'complete', createdAt: now,
    }).run()
  }

  /**
   * 写入一个已完成的上旋旋转趟（~6-8min）。
   * 由 DataPipeline 在接收到 ForwardDirectionChange / ReverseDirectionChange 时调用。
   *
   * @returns 新插入行的 ID，失败返回 0
   */
  insertRotationTrip(rt: {
    startTs: number; endTs: number; direction: number
    estimatedThetaMax?: number | null; status?: string
  }): number {
    if (!this.ready) return 0
    const now = Date.now()
    this.db.insert(schema.rotationTrip).values({
      startTs: rt.startTs, endTs: rt.endTs, direction: rt.direction,
      estimatedThetaMax: rt.estimatedThetaMax ?? null,
      status: rt.status ?? 'pending', createdAt: now,
    }).run()
    return this.getLastInsertId()
  }

  /**
   * 回填 scan_pass 的 rotation_trip_id。
   */
  backfillScanPassRotationTrip(
    rotationTripId: number,
    startTs: number,
    endTs: number
  ): number {
    if (!this.ready) return 0
    const result = this.sqliteDb
      .prepare(
        `UPDATE scan_pass SET rotation_trip_id = ? WHERE rotation_trip_id IS NULL AND start_ts >= ? AND end_ts <= ?`
      )
      .run(rotationTripId, startTs, endTs)
    return result.changes
  }
}

export { schema }
