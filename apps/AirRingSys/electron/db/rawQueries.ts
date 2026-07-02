/**
 * 原始数据查询函数
 *
 * 封装 thickness_raw / rotation_raw 两张原始数据表的全部 Drizzle CRUD。
 * 所有函数以 db 为第一参数，与 SQLiteService 实例解耦。
 *
 * 时间戳约定：startMs ≤ timestamp < endMs（左闭右开）。
 */
import { and, gte, lt, desc, sql } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import * as schema from './schema'
import type { ThicknessRawRow, RotationRawRow } from './types'

/**
 * 按时间区间查询测厚原始数据，按时间戳升序。
 *
 * @param db     Drizzle 实例
 * @param startMs 起始时间戳 (ms)，包含
 * @param endMs   结束时间戳 (ms)，不包含
 */
export function queryThicknessRaw(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number
): ThicknessRawRow[] {
  return db
    .select()
    .from(schema.thicknessRaw)
    .where(and(gte(schema.thicknessRaw.timestamp, startMs), lt(schema.thicknessRaw.timestamp, endMs)))
    .orderBy(schema.thicknessRaw.timestamp)
    .all() as ThicknessRawRow[]
}

/**
 * 按时间区间统计测厚数据行数。
 *
 * @param db     Drizzle 实例
 * @param startMs 起始时间戳 (ms)，包含
 * @param endMs   结束时间戳 (ms)，不包含
 * @returns 行数，无数据返回 0
 */
export function countThicknessRawInRange(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.thicknessRaw)
    .where(and(gte(schema.thicknessRaw.timestamp, startMs), lt(schema.thicknessRaw.timestamp, endMs)))
    .get()
  return result?.count ?? 0
}

/**
 * 按时间区间分页查询测厚原始数据，按时间戳升序。
 *
 * @param db     Drizzle 实例
 * @param startMs 起始时间戳 (ms)
 * @param endMs   结束时间戳 (ms)
 * @param limit   每页行数
 * @param offset  偏移量
 */
export function queryThicknessRawPage(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number,
  limit: number,
  offset: number
): ThicknessRawRow[] {
  return db
    .select()
    .from(schema.thicknessRaw)
    .where(and(gte(schema.thicknessRaw.timestamp, startMs), lt(schema.thicknessRaw.timestamp, endMs)))
    .orderBy(schema.thicknessRaw.timestamp)
    .limit(limit)
    .offset(offset)
    .all() as ThicknessRawRow[]
}

/**
 * 按时间区间统计上旋原始数据行数。
 */
export function countRotationRawInRange(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number
): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.rotationRaw)
    .where(and(gte(schema.rotationRaw.timestamp, startMs), lt(schema.rotationRaw.timestamp, endMs)))
    .get()
  return result?.count ?? 0
}

/**
 * 按时间区间分页查询上旋原始数据，按时间戳升序。
 */
export function queryRotationRawPage(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number,
  limit: number,
  offset: number
): RotationRawRow[] {
  return db
    .select()
    .from(schema.rotationRaw)
    .where(and(gte(schema.rotationRaw.timestamp, startMs), lt(schema.rotationRaw.timestamp, endMs)))
    .orderBy(schema.rotationRaw.timestamp)
    .limit(limit)
    .offset(offset)
    .all() as RotationRawRow[]
}

/**
 * 按时间区间查询上旋原始数据全部行，按时间戳升序。
 */
export function queryRotationRaw(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startMs: number,
  endMs: number
): RotationRawRow[] {
  return db
    .select()
    .from(schema.rotationRaw)
    .where(and(gte(schema.rotationRaw.timestamp, startMs), lt(schema.rotationRaw.timestamp, endMs)))
    .orderBy(schema.rotationRaw.timestamp)
    .all() as RotationRawRow[]
}

/**
 * 获取测厚原始数据的最新时间戳。
 *
 * @returns 最新时间戳 (ms)，无数据返回 null
 */
export function getLatestThicknessTimestamp(sqliteDb: Database.Database): number | null {
  const row = sqliteDb
    .prepare('SELECT MAX(timestamp) as ts FROM thickness_raw')
    .get() as { ts: number | null } | undefined
  return row?.ts ?? null
}

/**
 * 查询最近 N 条测厚记录，按时间倒序返回（最新的在前）。
 */
export function queryLatestThicknessRaw(
  db: ReturnType<typeof drizzle<typeof schema>>,
  limit: number
): ThicknessRawRow[] {
  return db
    .select()
    .from(schema.thicknessRaw)
    .orderBy(desc(schema.thicknessRaw.timestamp))
    .limit(limit)
    .all()
    .reverse() as ThicknessRawRow[]
}

/**
 * 查询最近 N 条上旋记录，按时间倒序返回（最新的在前）。
 */
export function queryLatestRotationRaw(
  db: ReturnType<typeof drizzle<typeof schema>>,
  limit: number
): RotationRawRow[] {
  return db
    .select()
    .from(schema.rotationRaw)
    .orderBy(desc(schema.rotationRaw.timestamp))
    .limit(limit)
    .all()
    .reverse() as RotationRawRow[]
}

/**
 * 查询最近 N 个上旋方向变化事件。
 *
 * 方向变化事件 = forwardDirChange > 0 或 reverseDirChange > 0 的记录。
 * 用于「最近 N 趟上旋旋转」分页查询：每次需要 N+1 个事件才能拼接出 N 趟完整旋转。
 *
 * @param count    返回的事件数
 * @param beforeTs 可选：仅返回该时间戳之前的事件
 */
export function queryLatestDirectionChanges(
  db: Database.Database,
  count: number,
  beforeTs = 0
): RotationRawRow[] {
  const whereParts = ['(forwardDirChange > 0 OR reverseDirChange > 0)']
  const params: (number | string)[] = []
  if (beforeTs > 0) {
    whereParts.push('timestamp < ?')
    params.push(beforeTs)
  }
  params.push(count)
  return db
    .prepare(
      `SELECT * FROM rotation_raw WHERE ${whereParts.join(' AND ')} ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...params) as RotationRawRow[]
}
