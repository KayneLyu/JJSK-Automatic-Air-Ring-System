/**
 * 测厚仪扫描趟历史查询
 *
 * 从 thickness_raw 按时间戳区间拉取采样点，压缩相邻同 pulse 冗余帧。
 * 与 sweepQueries（6-CTE 扫描趟切分）不同，本模块仅做时间范围查询。
 */
import { and, gte, lte } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

/** 一趟扫描（已标明方向的点集） */
export interface SweepResult {
  direction: 'forward' | 'backward'
  points: { pos: number; ad: number; ts: number }[]
}

/** 一趟扫描的摘要信息 */
export interface SweepSummaryResult {
  sweepId: string
  direction: 'forward' | 'backward'
  /** 起始时间戳 (ms) */
  startTs: number
  /** 结束时间戳 (ms) */
  endTs: number
  /** 有效采样点数 */
  pointCount: number
}

/** 按索引查询扫描趟的结果（单趟或往返配对） */
export interface SweepIndexedResult {
  id: string
  /** single = 单趟 sweep，round = 往返配对（正+反） */
  mode: 'single' | 'round'
  sweeps: SweepResult[]
}

interface ThicknessPointRow {
  pos: number
  ad: number
  ts: number
}

/**
 * 压缩相邻同 pulse 的冗余帧。
 *
 * ADBox 以 1ms 频率推送，当测厚仪暂停时同位置会累积多帧。
 * 本函数将同 pulse 的多帧 AD 值取加权平均，仅保留最后一帧的时间戳。
 */
function compactAdjacentSamePulse(
  rows: ThicknessPointRow[]
): ThicknessPointRow[] {
  if (rows.length === 0) return []

  const compacted: ThicknessPointRow[] = [
    { pos: rows[0].pos, ad: rows[0].ad, ts: rows[0].ts },
  ]
  let count = 1

  for (let i = 1; i < rows.length; i += 1) {
    const last = compacted[compacted.length - 1]
    const current = rows[i]
    if (last.pos === current.pos) {
      last.ad = (last.ad * count + current.ad) / (count + 1)
      last.ts = current.ts
      count += 1
    } else {
      compacted.push({ pos: current.pos, ad: current.ad, ts: current.ts })
      count = 1
    }
  }

  return compacted
}

/**
 * 按时间区间查询一趟扫描的全部采样点（已去相邻同 pulse 冗余）。
 *
 * 适用于已知扫描趟起止时间后拉取原始点数据做二次计算（如膜宽标定）。
 *
 * @param db      Drizzle 实例
 * @param startTs 起始时间戳 (ms)，包含
 * @param endTs   结束时间戳 (ms)，包含
 */
export function querySweepPointsByRangeWithOrm(
  db: ReturnType<typeof drizzle<typeof schema>>,
  startTs: number,
  endTs: number
): { pos: number; ad: number; ts: number }[] {
  if (startTs <= 0 || endTs < startTs) return []

  const rows = db
    .select({
      pos: schema.thicknessRaw.pulse,
      ad: schema.thicknessRaw.ad,
      ts: schema.thicknessRaw.timestamp,
    })
    .from(schema.thicknessRaw)
    .where(
      and(
        gte(schema.thicknessRaw.timestamp, startTs),
        lte(schema.thicknessRaw.timestamp, endTs)
      )
    )
    .orderBy(schema.thicknessRaw.timestamp)
    .all() as ThicknessPointRow[]

  if (rows.length === 0) return []
  return compactAdjacentSamePulse(rows)
}
