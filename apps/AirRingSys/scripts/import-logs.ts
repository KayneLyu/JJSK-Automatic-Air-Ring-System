import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { calcThicknessClient, buildSweepDataList } from '../electron/db/helpers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Configuration ──
const DEFAULT_AIR_AD = 50300
const DEFAULT_GAIN = 1.0

const DOWNLOAD_LOG_DIRS = [
  join(homedir(), 'Downloads', 'logs', 'thickness'),
  join(homedir(), 'Downloads', 'logs', 'airRing'),
]
const LOG_DIRS_TO_SCAN = [...DOWNLOAD_LOG_DIRS]
const DB_PATH = resolve('C:/JJSK_Data/@jjsk/ari-ring/db/jjsk.db')
const OLD_DB_PATH = resolve('C:/JJSK_Data/db/jjsk.db')
const MIGRATION_SQL_PATH = resolve(
  __dirname,
  '../electron/db/migrations/0000_glossy_bloodstrike.sql'
)

// ── Command line ──
let airAD = DEFAULT_AIR_AD
let customDir: string | null = null
let skipExisting = true

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--air-ad') airAD = parseInt(process.argv[++i])
  else if (arg === '--dir') customDir = resolve(process.argv[++i])
  else if (arg === '--no-skip') skipExisting = false
  else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: pnpm exec tsx scripts/import-logs.ts [options]

Import historical thickness log files into SQLite database.

Options:
  --air-ad <num>    Air AD value (default: ${DEFAULT_AIR_AD})
  --gain <num>      Gain multiplier (default: ${DEFAULT_GAIN})
  --dir <path>      Custom log directory to scan
  --no-skip         Re-import data even if timestamps overlap
  --help, -h        Show this help
`)
    process.exit(0)
  }
}

function utcDayStartMs(epochMs: number): number {
  const d = new Date(epochMs)
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    0,
    0,
    0,
    0
  )
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ── Scan log files ──
const searchDirs = [...LOG_DIRS_TO_SCAN]
if (customDir) searchDirs.unshift(customDir)

const thicknessLogFiles: string[] = []
const rotationLogFiles: string[] = []
for (const dir of searchDirs) {
  if (!existsSync(dir)) {
    console.log(`(skip) Directory not found: ${dir}`)
    continue
  }
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (/^thickness-adbox-\d{4}-\d{2}-\d{2}-\d{2}\.log$/.test(entry.name)) {
      thicknessLogFiles.push(join(dir, entry.name))
    } else if (/^upper-rotation-s7-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) {
      rotationLogFiles.push(join(dir, entry.name))
    }
  }
}

console.log(`Scanned ${searchDirs.length} directories`)
console.log(
  `Found ${thicknessLogFiles.length} thickness file(s), ${rotationLogFiles.length} rotation file(s)`
)
if (rotationLogFiles.length > 0) {
  rotationLogFiles.forEach((f) => console.log(`  rotation: ${f}`))
}
if (thicknessLogFiles.length === 0 && rotationLogFiles.length === 0) {
  console.log('No log files found — check paths above')
  process.exit(0)
}

const deduplicate = (files: string[]) => {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const f of files.sort()) {
    const resolved = resolve(f)
    if (!seen.has(resolved)) {
      seen.add(resolved)
      unique.push(resolved)
    }
  }
  return unique
}

const uniqueThicknessFiles = deduplicate(thicknessLogFiles)
const uniqueRotationFiles = deduplicate(rotationLogFiles)

if (uniqueThicknessFiles.length > 0) {
  const totalBytes = uniqueThicknessFiles.reduce(
    (s, f) => s + (existsSync(f) ? readFileSync(f).length : 0),
    0
  )
  console.log(
    `Found ${uniqueThicknessFiles.length} thickness log file(s), total ~${(totalBytes / 1024 / 1024).toFixed(0)}MB`
  )
}
if (uniqueRotationFiles.length > 0) {
  const totalBytes = uniqueRotationFiles.reduce(
    (s, f) => s + (existsSync(f) ? readFileSync(f).length : 0),
    0
  )
  console.log(
    `Found ${uniqueRotationFiles.length} rotation log file(s), total ~${(totalBytes / 1024 / 1024).toFixed(0)}MB`
  )
}

// ── Database ──
const dbDir = join(DB_PATH, '..')
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

function dbHasData(db: Database.Database): boolean {
  try {
    const r = db.prepare('SELECT COUNT(*) as cnt FROM frame').get() as
      | { cnt: number }
      | undefined
    return r !== undefined && r.cnt > 0
  } catch {
    return false
  }
}

if (!existsSync(DB_PATH)) {
  if (existsSync(OLD_DB_PATH) && readFileSync(OLD_DB_PATH).length > 4096) {
    console.log(
      `Migrating existing database from:\n  ${OLD_DB_PATH}\n  → ${DB_PATH}`
    )
    copyFileSync(OLD_DB_PATH, DB_PATH)
  } else {
    console.log(`Creating new database: ${DB_PATH}`)
  }
} else {
  // DB_PATH exists — open in read-only to check if it has data
  const chk = new Database(DB_PATH, { readonly: true })
  const hasData = dbHasData(chk)
  chk.close()
  if (hasData) {
    console.log(`Opened existing database: ${DB_PATH}`)
  } else if (
    existsSync(OLD_DB_PATH) &&
    readFileSync(OLD_DB_PATH).length > 4096
  ) {
    console.log(
      `Existing DB is empty; migrating from:\n  ${OLD_DB_PATH}\n  → ${DB_PATH}`
    )
    copyFileSync(OLD_DB_PATH, DB_PATH)
  } else {
    console.log(`Using existing (empty) database: ${DB_PATH}`)
  }
}

const db = new Database(DB_PATH)
db.exec('PRAGMA journal_mode=OFF')
db.exec('PRAGMA synchronous=OFF')
db.exec('PRAGMA cache_size=-400000')

const migrationSql = readFileSync(MIGRATION_SQL_PATH, 'utf8')
for (const chunk of migrationSql.split('--> statement-breakpoint\n')) {
  const trimmed = chunk.trim()
  if (trimmed && !trimmed.startsWith('--')) {
    try {
      db.exec(trimmed)
    } catch {
      /* ok — e.g. index already exists */
    }
  }
}

// ── Import ──
let totalBatches = 0
let totalRows = 0
let totalSkipped = 0
let totalErrors = 0

function hasOverlap(startTs: number, endTs: number): boolean {
  const r = db
    .prepare(
      'SELECT 1 as x FROM thickness_raw WHERE timestamp >= ? AND timestamp <= ? LIMIT 1'
    )
    .get(startTs, endTs) as { x: number } | undefined
  return r !== undefined
}

function importBatch(line: string): { rows: number } | 'skipped' | null {
  let parsed: any
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (!parsed?.message?.data) return null

  const { adValues, pulses, timestamps } = parsed.message.data as {
    adValues: number[]
    pulses: number[]
    timestamps: number[]
  }

  if (
    !Array.isArray(adValues) ||
    !Array.isArray(pulses) ||
    !Array.isArray(timestamps)
  )
    return null
  if (
    adValues.length !== pulses.length ||
    adValues.length !== timestamps.length
  )
    return null

  const recordTs = parsed.timestamp
    ? new Date(parsed.timestamp).getTime()
    : Date.now()
  if (!Number.isFinite(recordTs)) return null

  const dayStart = utcDayStartMs(recordTs)
  const absoluteTimestamps = timestamps.map((rel) => dayStart + rel)

  const startTs = absoluteTimestamps[0]
  const endTs = absoluteTimestamps[absoluteTimestamps.length - 1]

  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return null

  if (skipExisting && hasOverlap(startTs, endTs)) {
    return 'skipped'
  }

  const rawDatalist = buildSweepDataList(pulses, adValues)
  const thickness = rawDatalist.map((ad) =>
    calcThicknessClient(ad, airAD, gain)
  )
  const validValues = thickness.filter((v) => v > 0)

  if (validValues.length < 100) return null

  const mean = validValues.reduce((s, v) => s + v, 0) / validValues.length
  const variance =
    validValues.reduce((s, v) => s + (v - mean) ** 2, 0) / validValues.length
  const sigmaVal = Math.sqrt(variance) * 2
  const sigmaPercent = mean > 0 ? (sigmaVal / mean) * 100 : 0
  const minVal = Math.min(...validValues)
  const maxVal = Math.max(...validValues)

  const insertThickness = db.prepare(
    "INSERT INTO thickness_raw (timestamp, pos, ad, source, airAD, gain) VALUES (?, ?, ?, 'adbox', ?, ?)"
  )
  const insertFrame = db.prepare(
    "INSERT INTO frame (startTime, endTime, startTimestamp, endTimestamp, speed, width, rotateSpeed, sigmaVal, sigmaPercent, mean, minVal, minPercent, maxVal, maxPercent, IsBackw, source, airAD, gain) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 'adbox', ?, ?)"
  )
  db.exec('BEGIN')
  try {
    for (let i = 0; i < pulses.length; i++) {
      const pulse = pulses[i]
      const ad = adValues[i]
      if (pulse < 0 || pulse > 6999 || ad <= 0) continue
      insertThickness.run(absoluteTimestamps[i], pulse, ad, airAD, gain)
    }

    const timeStr = formatTime(startTs)
    insertFrame.run(
      timeStr,
      timeStr,
      startTs,
      endTs,
      Math.round(sigmaVal * 100) / 100,
      Math.round(sigmaPercent * 100) / 100,
      Math.round(mean * 100) / 100,
      minVal,
      mean > 0 ? Math.round((1 - minVal / mean) * 10000) / 100 : 0,
      maxVal,
      mean > 0 ? Math.round((maxVal / mean - 1) * 10000) / 100 : 0,
      airAD,
      gain
    )
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return { rows: pulses.filter((p) => p >= 0 && p <= 6999).length }
}

// ── Rotation log import ──
let totalRotationRows = 0

const insertRotation = db.prepare(
  `INSERT INTO rotation_raw (timestamp, forwardRotation, reverseRotation, motorFrequency, forwardDirChange, reverseDirChange, reset, heats) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
)

function importRotationLine(line: string): { rows: number } | null {
  let parsed: any
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  const msg = parsed.message || parsed
  if (msg?.event !== 'read' || msg?.protocol !== 's7' || !msg?.data) {
    return null
  }

  const d = msg.data
  const tsStr = parsed.timestamp
  if (!tsStr) return null

  const timestamp = new Date(tsStr).getTime()
  if (!Number.isFinite(timestamp)) return null

  const forwardRotation = d.ForwardRotation === true ? 1 : 0
  const reverseRotation = d.ReverseRotation === true ? 1 : 0
  const motorFrequency =
    typeof d.MotorFrequency === 'number' ? d.MotorFrequency : 0
  const forwardDirChange = d.ForwardDirectionChange === true ? 1 : 0
  const reverseDirChange = d.ReverseDirectionChange === true ? 1 : 0
  const reset = d.Reset === true ? 1 : 0
  const heats = Array.isArray(d.Heats)
    ? JSON.stringify(d.Heats)
    : d.Heats !== undefined
      ? JSON.stringify([d.Heats])
      : '[]'

  insertRotation.run(
    timestamp,
    forwardRotation,
    reverseRotation,
    motorFrequency,
    forwardDirChange,
    reverseDirChange,
    reset,
    heats
  )

  return { rows: 1 }
}

// ── Process thickness files ──
for (let fi = 0; fi < uniqueThicknessFiles.length; fi++) {
  const filePath = uniqueThicknessFiles[fi]
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n').filter(Boolean)
  let fileBatches = 0
  let fileRows = 0
  let fileSkipped = 0
  let fileErrors = 0

  for (const line of lines) {
    try {
      const result = importBatch(line)
      if (result === null) continue
      if (result === 'skipped') {
        fileSkipped++
        continue
      }
      fileBatches++
      fileRows += result.rows
    } catch {
      fileErrors++
    }
  }

  totalBatches += fileBatches
  totalRows += fileRows
  totalSkipped += fileSkipped
  totalErrors += fileErrors

  const fileName = filePath.split('\\').pop()?.split('/').pop() ?? filePath
  const barLen = 30
  const pct = ((fi + 1) / uniqueThicknessFiles.length) * 100
  const filled = Math.round(((fi + 1) / uniqueThicknessFiles.length) * barLen)
  console.log(
    `[${'#'.repeat(filled)}${'.'.repeat(barLen - filled)}] ${pct.toFixed(0)}%  ${fileName}: ${fileBatches} batches, ${fileRows} rows` +
      (fileSkipped ? `, ${fileSkipped} skipped` : '') +
      (fileErrors ? `, ${fileErrors} errors` : '')
  )
}

// ── Process rotation files ──
db.exec('BEGIN')
let rotationFileRows = 0
let rotationFileErrors = 0

for (const filePath of uniqueRotationFiles) {
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n').filter(Boolean)
  let fileRows = 0
  let fileErrors = 0

  for (const line of lines) {
    try {
      const result = importRotationLine(line)
      if (result === null) continue
      fileRows += result.rows
    } catch {
      fileErrors++
    }
  }

  rotationFileRows += fileRows
  rotationFileErrors += fileErrors

  const fileName = filePath.split('\\').pop()?.split('/').pop() ?? filePath
  console.log(
    `  rotation ${fileName}: ${fileRows} rows${fileErrors ? `, ${fileErrors} errors` : ''}`
  )
}

db.exec('COMMIT')
totalRotationRows += rotationFileRows

console.log(
  `\nDone. Total: ${totalBatches} batches, ${totalRows} thickness rows` +
    (totalRotationRows > 0 ? `, ${totalRotationRows} rotation rows` : '') +
    (totalSkipped ? `, ${totalSkipped} skipped` : '') +
    (totalErrors ? `, ${totalErrors} errors` : '')
)
console.log(`Database saved to: ${DB_PATH}`)

db.close()
