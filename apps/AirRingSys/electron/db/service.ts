/**
 * SQLite 数据服务 — 吹膜机数据管线的持久化层
 *
 * 职责：
 * - 初始化 SQLite 数据库 + Drizzle ORM + 自动迁移
 * - 批量缓冲写入（500ms flush 间隔）thickness_raw / rotation_raw / airRing_raw
 * - 原始数据查询委托给 rawQueries、扫描趟查询委托给 scanPassQueries
 * - 双趟模型写入：scan_pass（约 30s/趟）、rotation_trip（约 6-8min/趟）
 *
 * 运行在 Electron utilityProcess 中，不阻塞 UI 线程。
 */
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
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
import {
  queryThicknessRaw,
  countThicknessRawInRange,
  countUsableThicknessRawInRange,
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
import migrationSqlV2 from './migrations/0002_pos1_remove_calib.sql?raw'
import migrationSqlV3 from './migrations/0003_membrane_pulse_bounds.sql?raw'
import migrationSqlV4 from './migrations/0004_drop_scan_pass_fk.sql?raw'
import migrationSqlV5 from './migrations/0005_drop_scan_pass_summary.sql?raw'
import { FrameRow, RotationRawRow } from './types'
import type { ThicknessRawRow } from '@/types/ipc'
import type { RotationTripSummaryRow } from '@/types/ipc'

const MIN_VALID_ROTATION_TRIP_MS = 30_000
const MAX_VALID_ROTATION_TRIP_MS = 900_000

/**
 * Check whether a v2 migration chunk should be skipped because
 * the operation is already applied or not applicable (v0 was modified in-place).
 */
function shouldSkipV2Chunk(db: Database.Database, sql: string): boolean {
  // ADD COLUMN: skip if column already exists
  const addMatch = sql.match(/ALTER TABLE\s+`?(\w+)`?\s+ADD COLUMN\s+`?(\w+)`?/i)
  if (addMatch) {
    const [, table, column] = addMatch
    return !!db
      .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`)
      .get(column)
  }

  // DROP COLUMN: skip if column doesn't exist
  const dropMatch = sql.match(/ALTER TABLE\s+`?(\w+)`?\s+DROP COLUMN\s+`?(\w+)`?/i)
  if (dropMatch) {
    const [, table, column] = dropMatch
    return !db
      .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`)
      .get(column)
  }

  return false // DROP TABLE IF EXISTS etc. — safe to run
}

export class SQLiteService {
  private db!: ReturnType<typeof drizzle<typeof schema>>
  private sqliteDb!: Database.Database
  private dbPath = ''
  private ready = false
  private hasScanPassMembraneColumns = true

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
 * 2. 执行 v0-v4 幂等迁移
   */
  init(dbDir: string): void {
    mkdirSync(dbDir, { recursive: true })
    this.dbPath = join(dbDir, 'jjsk.db')
    this.sqliteDb = new Database(this.dbPath)
    this.sqliteDb.exec('PRAGMA journal_mode=WAL')
    this.sqliteDb.exec('PRAGMA synchronous=NORMAL')
    this.sqliteDb.exec('PRAGMA cache_size=-400000')

    // 验证 WAL 模式已启用（某些平台/文件系统可能不支持）
    const journalMode = (
      this.sqliteDb.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    )?.journal_mode
    if (journalMode?.toLowerCase() !== 'wal') {
      console.warn(`[SQLite] WAL 模式启用失败，当前模式: ${journalMode}，回退至 OFF`)
      this.sqliteDb.exec('PRAGMA journal_mode=OFF')
    } else {
      console.log('[SQLite] WAL 模式已启用，支持并发读')
    }

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

    for (const chunk of migrationSqlV2.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        if (shouldSkipV2Chunk(this.sqliteDb, trimmed)) continue
        try {
          this.sqliteDb.exec(trimmed)
        } catch (e) {
          // ADD COLUMN failures are critical — log prominently
          if (/ADD\s+COLUMN/i.test(trimmed)) {
            console.error('[SQLite] CRITICAL: v2 ADD COLUMN migration failed:', trimmed, e)
          } else {
            console.error('[SQLite] v2 migration error:', e)
          }
        }
      }
    }

    // v3: 膜内脉冲边界列
    for (const chunk of migrationSqlV3.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        if (shouldSkipV2Chunk(this.sqliteDb, trimmed)) continue
        try {
          this.sqliteDb.exec(trimmed)
        } catch (e) {
          if (/ADD\s+COLUMN/i.test(trimmed)) {
            console.error('[SQLite] CRITICAL: v3 ADD COLUMN migration failed:', trimmed, e)
          } else {
            console.error('[SQLite] v3 migration error:', e)
          }
        }
      }
    }

    // v4: 移除 scan_pass.rotation_trip_id（死 FK，从无消费者）
    for (const chunk of migrationSqlV4.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        if (shouldSkipV2Chunk(this.sqliteDb, trimmed)) continue
        try {
          this.sqliteDb.exec(trimmed)
        } catch (e) {
          console.error('[SQLite] v4 migration error:', e)
        }
      }
    }

    // v5: 移除 scan_pass_summary（死表，从无消费者）
    for (const chunk of migrationSqlV5.split('--> statement-breakpoint\n')) {
      const trimmed = chunk.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        try {
          this.sqliteDb.exec(trimmed)
        } catch (e) {
          console.error('[SQLite] v5 migration error:', e)
        }
      }
    }

    // Post-migration repair: ensure pos1 exists in thickness_raw.
    // The v0 migration was modified in-place (commit eb32fa3) to include pos1.
    // Existing databases that predate this may have the v2 ADD COLUMN
    // skipped or fail silently — this repair catches those cases.
    try {
      const hasPos1 = this.sqliteDb
        .prepare("SELECT 1 FROM pragma_table_info('thickness_raw') WHERE name = 'pos1'")
        .get()
      if (!hasPos1) {
        this.sqliteDb.exec('ALTER TABLE thickness_raw ADD COLUMN pos1 integer DEFAULT 0 NOT NULL')
        console.log('[SQLite] Repaired: added pos1 column to thickness_raw')
      }
    } catch (e) {
      console.error('[SQLite] pos1 repair check failed:', e)
    }

    // Post-migration repair: ensure membrane_pulse_min/max exist in scan_pass.
    // 部分历史库或异常迁移路径会缺少这两列，导致 insertScanPass 直接抛错。
    try {
      const hasMembranePulseMin = this.sqliteDb
        .prepare("SELECT 1 FROM pragma_table_info('scan_pass') WHERE name = 'membrane_pulse_min'")
        .get()
      if (!hasMembranePulseMin) {
        this.sqliteDb.exec('ALTER TABLE scan_pass ADD COLUMN membrane_pulse_min integer')
        console.log('[SQLite] Repaired: added membrane_pulse_min column to scan_pass')
      }

      const hasMembranePulseMax = this.sqliteDb
        .prepare("SELECT 1 FROM pragma_table_info('scan_pass') WHERE name = 'membrane_pulse_max'")
        .get()
      if (!hasMembranePulseMax) {
        this.sqliteDb.exec('ALTER TABLE scan_pass ADD COLUMN membrane_pulse_max integer')
        console.log('[SQLite] Repaired: added membrane_pulse_max column to scan_pass')
      }

      this.hasScanPassMembraneColumns = true
    } catch (e) {
      this.hasScanPassMembraneColumns = false
      console.error('[SQLite] scan_pass membrane columns repair failed:', e)
    }

    this.db = drizzle(this.sqliteDb, { schema })
    this.ready = true
  }

  /** 关闭数据库：先 flush 缓冲区，再关闭连接 */
  close(): void {
    this.ready = false
    try { this.flush() } catch (err) { console.error('[SQLite] flush on close error:', err) }
    this.sqliteDb.close()
  }

  /** 获取数据库文件路径（供 Worker Thread 打开只读连接） */
  getDbPath(): string {
    return this.dbPath
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
  pushThickness(ts: number, pulse: number, ad: number, source: string, pos1 = 0): void {
    if (!this.ready) return
    this.batchBuffer.thickness.push({ timestamp: ts, pulse, ad, source, pos1 })
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
      if (counts.thickness > 0) {
        this.db.insert(schema.thicknessRaw).values(this.batchBuffer.thickness).run()
      }
      if (counts.rotation > 0) {
        this.db.insert(schema.rotationRaw).values(this.batchBuffer.rotation).run()
      }
      if (counts.airRing > 0) {
        this.db.insert(schema.airRingRaw).values(this.batchBuffer.airRing).run()
      }
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
  countUsableThicknessRawInRange(startMs: number, endMs: number): number {
    return this.ready
      ? countUsableThicknessRawInRange(this.db, startMs, endMs)
      : 0
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
  queryLatestRotationTripSummaries(limit: number, beforeTs = 0): RotationTripSummaryRow[] {
    if (!this.ready) return []

    const rows = this.sqliteDb
      .prepare(
        beforeTs > 0
          ? `SELECT id, start_ts, end_ts, direction
             FROM rotation_trip
             WHERE start_ts < ?
               AND (end_ts - start_ts) >= ?
               AND (end_ts - start_ts) <= ?
             ORDER BY start_ts DESC
             LIMIT ?`
          : `SELECT id, start_ts, end_ts, direction
             FROM rotation_trip
             WHERE (end_ts - start_ts) >= ?
               AND (end_ts - start_ts) <= ?
             ORDER BY start_ts DESC
             LIMIT ?`
      )
      .all(
        ...(beforeTs > 0
          ? [
              beforeTs,
              MIN_VALID_ROTATION_TRIP_MS,
              MAX_VALID_ROTATION_TRIP_MS,
              limit,
            ]
          : [
              MIN_VALID_ROTATION_TRIP_MS,
              MAX_VALID_ROTATION_TRIP_MS,
              limit,
            ])
      ) as Array<{
        id: number
        start_ts: number
        end_ts: number
        direction: number
      }>

    return rows
      .map((row): RotationTripSummaryRow => ({
        id: `rotation-trip-${row.id}`,
        time: row.start_ts,
        direction: row.direction === 1 ? 'forward' : 'reverse',
        cycleDurationMs: Math.max(0, row.end_ts - row.start_ts),
      }))
      .reverse()
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

  importSweep(pulses: number[], adValues: number[], source: string): number {
    return this.ready ? importSweep(this.db, this.sqliteDb, pulses, adValues, source) : 0
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
    membranePulseMin: number | null; membranePulseMax: number | null
    status?: 'complete' | 'rejected'
  }): void {
    if (!this.ready) return
    const now = Date.now()
    const baseValues = {
      startTs: sp.startTs,
      endTs: sp.endTs,
      scannerDirection: sp.scannerDirection,
      pulseMin: sp.pulseMin,
      pulseMax: sp.pulseMax,
      validRatio: sp.validRatio,
      status: sp.status ?? 'complete',
      createdAt: now,
    }

    if (this.hasScanPassMembraneColumns) {
      try {
        this.db
          .insert(schema.scanPass)
          .values({
            ...baseValues,
            membranePulseMin: sp.membranePulseMin,
            membranePulseMax: sp.membranePulseMax,
          })
          .run()
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/no column named membrane_pulse_(min|max)/i.test(msg)) {
          this.hasScanPassMembraneColumns = false
          console.error(
            '[SQLite] insertScanPass fallback: membrane columns missing, write without membrane bounds:',
            msg
          )
        } else {
          throw e
        }
      }
    }

    this.db.insert(schema.scanPass).values(baseValues).run()
  }

  /**
   * 写入一个新的上旋旋转趟（~6-8min）。
   * 由 DataPipeline 在接收到 ForwardDirectionChange / ReverseDirectionChange 时调用，
   * 初始状态为 pending，关闭时由 updateRotationTrip 更新 endTs 和 status。
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
   * 更新旋转趟的结束时间和状态。
   * 由 DataPipeline 在趟关闭时（下一次方向变化 / shutdown / Reset）调用。
   */
  updateRotationTrip(id: number, endTs: number, status: 'completed' | 'failed'): void {
    if (!this.ready) return
    this.db
      .update(schema.rotationTrip)
      .set({ endTs, status })
      .where(eq(schema.rotationTrip.id, id))
      .run()
  }

}

export { schema }

// ═══════════════════════════════════════════════════════════
// SQLite 只读连接 — 供 Worker Thread 使用
// ═══════════════════════════════════════════════════════════

/**
 * 为 Worker Thread 打开一个只读 SQLite 连接。
 *
 * 沿用数据库现有日志模式；主连接为 WAL 时仍支持 writer + readers 并发。
 * 只读连接不得尝试切换 journal_mode，否则旧的非 WAL 历史库会报写入错误。
 *
 * 注意：调用方负责在 Worker 退出时 close()。
 */
export function createReadOnlyConnection(dbPath: string): {
  sqliteDb: Database.Database
  db: ReturnType<typeof drizzle<typeof schema>>
  close: () => void
} {
  const sqliteDb = new Database(dbPath, { readonly: true })
  sqliteDb.exec('PRAGMA query_only=ON')
  sqliteDb.exec('PRAGMA cache_size=-64000')
  const db = drizzle(sqliteDb, { schema })
  return {
    sqliteDb,
    db,
    close: () => sqliteDb.close(),
  }
}
