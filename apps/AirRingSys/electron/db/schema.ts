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
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp').notNull(),
    pulse: integer('pulse').notNull(),
    ad: real('ad').notNull(),
    source: text('source').notNull().default('adbox'),
    airAD: real('airAD').notNull().default(0),
    gain: real('gain').notNull().default(1.0),
  },
  (t) => ({
    tsIdx: index('idx_thickness_raw_ts').on(t.timestamp),
    tsPosIdx: index('idx_thickness_raw_ts_pulse').on(t.timestamp, t.pulse),
  })
)

export const rotationRaw = sqliteTable(
  'rotation_raw',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp').notNull(),
    forwardRotation: integer('forwardRotation').notNull().default(0),
    reverseRotation: integer('reverseRotation').notNull().default(0),
    motorFrequency: real('motorFrequency').notNull().default(0),
    forwardDirChange: integer('forwardDirChange').notNull().default(0),
    reverseDirChange: integer('reverseDirChange').notNull().default(0),
    reset: integer('reset').notNull().default(0),
    heats: text('heats').notNull().default('[]'),
  },
  (t) => ({
    tsIdx: index('idx_rotation_raw_ts').on(t.timestamp),
  })
)

export const airRingRaw = sqliteTable(
  'air_ring_raw',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp').notNull(),
    channelHeats: text('channelHeats').notNull().default('[]'),
    isAuto: integer('isAuto').notNull().default(0),
    sigma: real('sigma').notNull().default(0),
    corrR: real('corrR').notNull().default(0),
  },
  (t) => ({
    tsIdx: index('idx_air_ring_raw_ts').on(t.timestamp),
  })
)

export const rollerRaw = sqliteTable(
  'roller_raw',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp').notNull(),
    speed: real('speed').notNull().default(0),
    position: real('position').notNull().default(0),
    direction: integer('direction').notNull().default(1),
  },
  (t) => ({
    tsIdx: index('idx_roller_raw_ts').on(t.timestamp),
  })
)

// ── 双趟模型：上旋旋转趟 ──
export const rotationTrip = sqliteTable(
  'rotation_trip',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    startTs: integer('start_ts').notNull(),
    endTs: integer('end_ts').notNull(),
    direction: integer('direction').notNull(), // 1=正向旋转, 0=反向旋转
    estimatedThetaMax: real('estimated_theta_max'),
    status: text('status').notNull().default('pending'), // pending | estimated | failed
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    tsIdx: index('idx_rotation_trip_ts').on(t.startTs, t.endTs),
  })
)

// ── 双趟模型：测厚仪扫描趟 ──
export const scanPass = sqliteTable(
  'scan_pass',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rotationTripId: integer('rotation_trip_id').references(
      () => rotationTrip.id
    ),
    startTs: integer('start_ts').notNull(),
    endTs: integer('end_ts').notNull(),
    scannerDirection: integer('scanner_direction').notNull(), // 1=正向扫描, 0=反向扫描
    pulseMin: integer('pulse_min').notNull(),
    pulseMax: integer('pulse_max').notNull(),
    validRatio: real('valid_ratio').notNull().default(0), // 有效测点占比
    status: text('status').notNull().default('pending'), // pending | complete | rejected
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    tsIdx: index('idx_scan_pass_ts').on(t.startTs, t.endTs),
    rtIdx: index('idx_scan_pass_rt').on(t.rotationTripId),
  })
)

// ── 双趟模型：扫描趟摘要 ──
export const scanPassSummary = sqliteTable(
  'scan_pass_summary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scanPassId: integer('scan_pass_id')
      .notNull()
      .references(() => scanPass.id),
    profileBinsJson: text('profile_bins_json').notNull().default('[]'),
    // JSON: { offsetDeg: number, avgThickness: number }[]
    qualityScore: real('quality_score').notNull().default(0), // 0-1 综合质量分
    candidateFanIndicesJson: text('candidate_fan_indices_json')
      .notNull()
      .default('[]'), // number[] 候选风道索引
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    spIdx: index('idx_scan_pass_summary_sp').on(t.scanPassId),
  })
)
