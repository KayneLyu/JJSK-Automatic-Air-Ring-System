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
    pos: integer('pos').notNull(),
    ad: real('ad').notNull(),
    source: text('source').notNull().default('adbox'),
    airAD: real('airAD').notNull().default(0),
    gain: real('gain').notNull().default(1.0),
  },
  (t) => ({
    tsIdx: index('idx_thickness_raw_ts').on(t.timestamp),
    tsPosIdx: index('idx_thickness_raw_ts_pos').on(t.timestamp, t.pos),
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

export const frame = sqliteTable(
  'frame',
  {
    frameId: integer('frameId').primaryKey({ autoIncrement: true }),
    startTime: text('startTime'),
    endTime: text('endTime'),
    startTimestamp: integer('startTimestamp').notNull().default(0),
    endTimestamp: integer('endTimestamp').notNull().default(0),
    speed: real('speed').notNull().default(0),
    width: real('width').notNull().default(0),
    rotateSpeed: real('rotateSpeed').notNull().default(0),
    sigmaVal: real('sigmaVal').notNull().default(0),
    sigmaPercent: real('sigmaPercent').notNull().default(0),
    mean: real('mean').notNull().default(0),
    minVal: real('minVal').notNull().default(0),
    minPercent: real('minPercent').notNull().default(0),
    maxVal: real('maxVal').notNull().default(0),
    maxPercent: real('maxPercent').notNull().default(0),
    IsBackw: integer('IsBackw').notNull().default(0),
    source: text('source').notNull().default('adbox'),
    airAD: real('airAD').notNull().default(0),
    gain: real('gain').notNull().default(1.0),
  },
  (t) => ({
    startTsIdx: index('idx_frame_start_ts').on(t.startTimestamp),
    endTsIdx: index('idx_frame_end_ts').on(t.endTimestamp),
    sourceIdx: index('idx_frame_source').on(t.source),
  })
)

export const frameData = sqliteTable(
  'frame_data',
  {
    frameId: integer('frameId').primaryKey(),
    datalist: text('datalist'),
    rawDatalist: text('rawDatalist'),
  }
)
