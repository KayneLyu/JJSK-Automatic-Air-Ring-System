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
    /** 辊编码器计数，每转+1 */
    pos1: integer().notNull().default(0),
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


// ── 双趟模型：上旋旋转趟 ──
export const rotationTrip = sqliteTable(
  'rotation_trip',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    startTs: integer('start_ts').notNull(),
    endTs: integer('end_ts').notNull(),
    direction: integer().notNull(), // 1=正向旋转, 0=反向旋转
    estimatedThetaMax: real('estimated_theta_max'),
    status: text().notNull().default('pending'), // pending | estimated | failed
    createdAt: integer('created_at').notNull(),
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
    startTs: integer('start_ts').notNull(),
    endTs: integer('end_ts').notNull(),
    scannerDirection: integer('scanner_direction').notNull(), // 1=正向扫描, 0=反向扫描
    pulseMin: integer('pulse_min').notNull(), // 整趟脉冲范围下限（含出界区域）
    pulseMax: integer('pulse_max').notNull(), // 整趟脉冲范围上限（含出界区域）
    /** 膜内首脉冲位置（双峰边沿检测）；仅 status=complete 时有值 */
    membranePulseMin: integer('membrane_pulse_min'),
    /** 膜内末脉冲位置（双峰边沿检测）；仅 status=complete 时有值 */
    membranePulseMax: integer('membrane_pulse_max'),
    validRatio: real('valid_ratio').notNull().default(0), // 有效测点占比
    status: text().notNull().default('pending'), // pending | complete | rejected
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_scan_pass_ts').on(t.startTs, t.endTs),
    index('idx_scan_pass_status').on(t.status),
  ]
)
