import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

type NativeBinding = {
  configureThreadPool: (maxThreads: number) => number
  searchBestDirect: (...args: unknown[]) => unknown
  searchBestExpanded: (...args: unknown[]) => unknown
  solveBubbleBatch: (
    rowPtr: Int32Array,
    colInd: Int32Array,
    values: Float64Array,
    targets: Float64Array,
    numBins: number,
    lambda: number,
    mu: number
  ) => number[]
}

type DatabaseConstructor = new (filename: string) => {
  prepare: (sql: string) => { get: () => unknown }
  close: () => void
}

const NATIVE_FILE_NAME = 'air-ring-native.win32-x64-msvc.node'
const REQUIRED_APP_FILES = [
  'main.js',
  'calibrationWorker.js',
  'historicalCalibrationWorker.js',
  'bubbleWorker.js',
  'bubbleQueryWorker.js',
  'historicalBubbleObservation.js',
  'utilityWorker.js',
]

const require = createRequire(import.meta.url)
const resourcesPath =
  (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
  join(dirname(process.execPath), 'resources')

const result = {
  schemaVersion: 1,
  ok: false,
  platform: process.platform,
  arch: process.arch,
  runtime: {
    electron: process.versions.electron ?? null,
    modules: process.versions.modules,
    napi: process.versions.napi ?? null,
  },
  resourcesPath,
  rustNative: { loaded: false, upperRotation: false, bubbleBatch: false },
  betterSqlite3: { loaded: false, query: false },
  packagedFiles: { checked: 0, missing: [] as string[] },
  error: null as string | null,
}

try {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(
      `现场包仅支持 Windows x64，当前为 ${process.platform}/${process.arch}`
    )
  }

  const nativePath = join(resourcesPath, 'native', NATIVE_FILE_NAME)
  const native = require(nativePath) as Partial<NativeBinding>
  result.rustNative.loaded = true
  result.rustNative.upperRotation =
    typeof native.configureThreadPool === 'function' &&
    typeof native.searchBestDirect === 'function' &&
    typeof native.searchBestExpanded === 'function'
  if (!result.rustNative.upperRotation) {
    throw new Error('Rust Native 缺少上旋主路径导出')
  }

  if (typeof native.solveBubbleBatch !== 'function') {
    throw new Error('Rust Native 缺少膜泡 Batch 导出')
  }
  const profile = native.solveBubbleBatch(
    new Int32Array([0, 1, 2]),
    new Int32Array([0, 1]),
    new Float64Array([1, 1]),
    new Float64Array([10, 20]),
    2,
    1e-4,
    0
  )
  result.rustNative.bubbleBatch =
    profile.length === 2 && profile.every(Number.isFinite)
  if (!result.rustNative.bubbleBatch) {
    throw new Error('Rust Native 膜泡 Batch 自检返回无效结果')
  }

  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor
  result.betterSqlite3.loaded = true
  const database = new BetterSqlite3(':memory:')
  try {
    const row = database.prepare('SELECT 1 AS value').get() as {
      value?: number
    }
    result.betterSqlite3.query = row.value === 1
  } finally {
    database.close()
  }
  if (!result.betterSqlite3.query) {
    throw new Error('better-sqlite3 内存查询自检失败')
  }

  const appRoot = join(resourcesPath, 'app.asar', 'dist-electron')
  result.packagedFiles.missing = REQUIRED_APP_FILES.filter(
    (fileName) => !existsSync(join(appRoot, fileName))
  )
  result.packagedFiles.checked = REQUIRED_APP_FILES.length
  if (result.packagedFiles.missing.length > 0) {
    throw new Error(
      `打包产物缺少入口: ${result.packagedFiles.missing.join(', ')}`
    )
  }

  result.ok = true
} catch (error) {
  result.error =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
}

console.log(`[FieldSelfTest] ${JSON.stringify(result)}`)
if (!result.ok) process.exitCode = 1
