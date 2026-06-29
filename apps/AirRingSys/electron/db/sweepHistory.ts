import { and, gte, lte } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export interface SweepResult {
  direction: 'forward' | 'backward'
  points: { pos: number; ad: number; ts: number }[]
}

export interface SweepSummaryResult {
  sweepId: string
  direction: 'forward' | 'backward'
  startTs: number
  endTs: number
  pointCount: number
}

export interface SweepIndexedResult {
  id: string
  mode: 'single' | 'round'
  sweeps: SweepResult[]
}

interface ThicknessPointRow {
  pos: number
  ad: number
  ts: number
}

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
