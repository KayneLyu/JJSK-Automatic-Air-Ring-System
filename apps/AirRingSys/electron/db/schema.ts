import {
  sqliteTable,
  integer,
  real,
  text,
  index,
} from 'drizzle-orm/sqlite-core'

export const thicknessRaw = sqliteTable(
  'thickness_raw',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    timestamp: integer().notNull(),
    pulse: integer().notNull(),
    ad: real().notNull(),
    source: text().notNull().default('adbox'),
    airAD: real().notNull().default(0),
    gain: real().notNull().default(1.0),
  },
  (t) => [
    index('idx_thickness_raw_ts').on(t.timestamp),
    index('idx_thickness_raw_ts_pulse').on(t.timestamp, t.pulse),
  ]
)

export const rotationRaw = sqliteTable(
  'rotation_raw',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    timestamp: integer().notNull(),
    forwardRotation: integer().notNull().default(0),
    reverseRotation: integer().notNull().default(0),
    motorFrequency: real().notNull().default(0),
    forwardDirChange: integer().notNull().default(0),
    reverseDirChange: integer().notNull().default(0),
    reset: integer().notNull().default(0),
    heats: text().notNull().default('[]'),
  },
  (t) => [
    index('idx_rotation_raw_ts').on(t.timestamp),
  ]
)

export const airRingRaw = sqliteTable(
  'air_ring_raw',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    timestamp: integer().notNull(),
    channelHeats: text().notNull().default('[]'),
    isAuto: integer().notNull().default(0),
    sigma: real().notNull().default(0),
    corrR: real().notNull().default(0),
  },
  (t) => [
    index('idx_air_ring_raw_ts').on(t.timestamp),
  ]
)

export const rollerRaw = sqliteTable(
  'roller_raw',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    timestamp: integer().notNull(),
    speed: real().notNull().default(0),
    position: real().notNull().default(0),
    direction: integer().notNull().default(1),
  },
  (t) => [
    index('idx_roller_raw_ts').on(t.timestamp),
  ]
)

// ── 双趟模型：上旋旋转趟 ──
export const rotationTrip = sqliteTable(
  'rotation_trip',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    startTs: integer().notNull(),
    endTs: integer().notNull(),
    direction: integer().notNull(), // 1=正向旋转, 0=反向旋转
    estimatedThetaMax: real(),
    status: text().notNull().default('pending'), // pending | estimated | failed
    createdAt: integer().notNull(),
  },
  (t) => [
    index('idx_rotation_trip_ts').on(t.startTs, t.endTs),
  ]
)

// ── 双趟模型：测厚仪扫描趟 ──
export const scanPass = sqliteTable(
  'scan_pass',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    rotationTripId: integer('rotation_trip_id').references(
      () => rotationTrip.id
    ),
    startTs: integer().notNull(),
    endTs: integer().notNull(),
    scannerDirection: integer().notNull(), // 1=正向扫描, 0=反向扫描
    pulseMin: integer().notNull(),
    pulseMax: integer().notNull(),
    validRatio: real().notNull().default(0), // 有效测点占比
    status: text().notNull().default('pending'), // pending | complete | rejected
    createdAt: integer().notNull(),
  },
  (t) => [
    index('idx_scan_pass_ts').on(t.startTs, t.endTs),
    index('idx_scan_pass_status').on(t.status),
    index('idx_scan_pass_rt').on(t.rotationTripId),
  ]
)

// ── 双趟模型：扫描趟摘要 ──
export const scanPassSummary = sqliteTable(
  'scan_pass_summary',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    scanPassId: integer('scan_pass_id')
      .notNull()
      .references(() => scanPass.id),
    profileBinsJson: text().notNull().default('[]'),
    // JSON: { offsetDeg: number, avgThickness: number }[]
    qualityScore: real().notNull().default(0), // 0-1 综合质量分
    candidateFanIndicesJson: text()
      .notNull()
      .default('[]'), // number[] 候选风道索引
    createdAt: integer().notNull(),
  },
  (t) => [
    index('idx_scan_pass_summary_sp').on(t.scanPassId),
  ]
)
