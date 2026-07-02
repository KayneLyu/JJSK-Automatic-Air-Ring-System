/**
 * 扫描趟导入/导出与 Frame 构建
 *
 * 批量导入、过期清理、按 pulse 方向变化切分 Frame。
 * 所有函数接收 Drizzle db + 原生 sqliteDb 作为参数，不依赖 SQLiteService 实例。
 */
import type Database from 'better-sqlite3'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import { lt, gte, and } from 'drizzle-orm'
import * as schema from './schema'
import type { ThicknessRawRow, FrameRow } from './types'

/**
 * 批量导入一次扫描的全部采样点到 thickness_raw。
 *
 * 适用于从外部数据源（文件导入、回放）批量写入测厚原始数据。
 * 使用 SQL 事务保证原子性。
 *
 * 注意：时间戳使用 `Date.now() + i`，原始时间信息会丢失。
 * 如需保留原始时间戳，请在调用侧修改 timestamp 逻辑。
 *
 * @param db        Drizzle 实例
 * @param sqliteDb  原生 better-sqlite3 实例
 * @param pulses    横向脉冲数组
 * @param adValues  AD 值数组，与 pulses 一一对应
 * @param source    数据来源标识（'adbox' | 'opcua' | 'modbus' | 'file'）
 * @returns 成功返回 1，无有效数据返回 0
 */
export function importSweep(
  db: ReturnType<typeof drizzle<typeof schema>>,
  sqliteDb: Database.Database,
  pulses: number[],
  adValues: number[],
  source: string
): number {
  const ts = Date.now()

  let count = 0
  sqliteDb.exec('BEGIN')
  try {
    for (let i = 0; i < pulses.length; i++) {
      const pulse = pulses[i]
      const ad = adValues[i]
      if (pulse < 0 || ad <= 0) continue
      db
        .insert(schema.thicknessRaw)
        .values({ timestamp: ts + i, pulse, ad, source })
        .run()
      count++
    }

    sqliteDb.exec('COMMIT')
  } catch (e) {
    sqliteDb.exec('ROLLBACK')
    throw e
  }

  return count > 0 ? 1 : 0
}

/**
 * 清理指定时间戳之前的全部原始数据。
 *
 * 同时清理 thickness_raw、rotation_raw、airRingRaw 三张表。
 *
 * @param beforeMs 删除该时间戳之前的数据
 * @returns 三张表各自的删除行数
 */
export function cleanup(
  db: ReturnType<typeof drizzle<typeof schema>>,
  sqliteDb: Database.Database,
  beforeMs: number
): { thickness: number; rotation: number; airRing: number } {
  sqliteDb.exec('BEGIN')
  try {
    const resultT = db
      .delete(schema.thicknessRaw)
      .where(lt(schema.thicknessRaw.timestamp, beforeMs))
      .run()
    const t = resultT.changes

    const resultR = db
      .delete(schema.rotationRaw)
      .where(lt(schema.rotationRaw.timestamp, beforeMs))
      .run()
    const r = resultR.changes

    const resultA = db
      .delete(schema.airRingRaw)
      .where(lt(schema.airRingRaw.timestamp, beforeMs))
      .run()
    const a = resultA.changes

    sqliteDb.exec('COMMIT')
    return { thickness: t, rotation: r, airRing: a }
  } catch (e) {
    sqliteDb.exec('ROLLBACK')
    throw e
  }
}

/**
 * 按时间区间查询原始数据，按 pulse 方向变化切分为 Frame。
 *
 * 与 sweepQueries 的 6-CTE 不同，本函数在 JS 侧做方向检测和切分，
 * 用于需要统计信息（sigma、mean、min/max 等）的导出场景。
 *
 * @param db        Drizzle 实例
 * @param startMs   起始时间戳 (ms)
 * @param endMs     结束时间戳 (ms)
 * @param limit     返回的 Frame 数量上限
 * @param maxPulse  最大 pulse 值，用于过滤不完整趟（span < 85% maxPulse 的趟被丢弃）
 */
export function queryFramesByTimeRange(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number,
  limit: number,
  maxPulse: number
): FrameRow[] {
  const rows = db
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

  // 压缩相邻同 pulse 行（消除暂停冗余）
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

  // pulse 方向连续两帧反向 → 扫描趟边界
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

  // 丢弃 pulse span 不足 85% maxPulse 的不完整首趟
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
    }
  })
}
