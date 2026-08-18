import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { path7za } = require('7zip-bin')
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const repositoryRoot = resolve(appDirectory, '../..')
const packageJson = JSON.parse(
  readFileSync(join(appDirectory, 'package.json'), 'utf8')
)
const appVersion = packageJson.version
const electronVersion = JSON.parse(
  readFileSync(
    join(appDirectory, 'node_modules', 'electron', 'package.json'),
    'utf8'
  )
).version
const betterSqliteDirectory = join(
  appDirectory,
  'node_modules',
  'better-sqlite3'
)
const prebuildInstallCli = join(
  appDirectory,
  'node_modules',
  'prebuild-install',
  'bin.js'
)
const releaseDirectory = join(appDirectory, 'release', appVersion)
const unpackedDirectory = join(releaseDirectory, 'win-unpacked')
const resourcesDirectory = join(unpackedDirectory, 'resources')
const executablePath = join(unpackedDirectory, 'JJSK.exe')
const nativeFileName = 'air-ring-native.win32-x64-msvc.node'
const sourceNativePath = join(
  repositoryRoot,
  'packages',
  'AirRingNative',
  nativeFileName
)
const packagedNativePath = join(resourcesDirectory, 'native', nativeFileName)
const applyScriptPath = join(scriptDirectory, 'applyContentUpdate.ps1')
const runtimeProbePath = join(scriptDirectory, 'contentRuntimeProbe.mjs')
const contentOutputDirectory = join(releaseDirectory, 'content')
const pnpmEntrypoint = process.env.npm_execpath
const pnpmEntrypointIsJavaScript =
  pnpmEntrypoint !== undefined && /\.(?:c|m)?js$/i.test(pnpmEntrypoint)
const pnpmCommand = pnpmEntrypointIsJavaScript
  ? process.execPath
  : (pnpmEntrypoint ?? 'pnpm')
const pnpmPrefix = pnpmEntrypointIsJavaScript ? [pnpmEntrypoint] : []

function run(command, args, options = {}) {
  console.log(`[ContentBuild] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(
      `${command} 退出码 ${result.status}${details ? `\n${details}` : ''}`
    )
  }
  return options.capture ? String(result.stdout).trim() : ''
}

function runPnpm(args, options = {}) {
  return run(pnpmCommand, [...pnpmPrefix, ...args], options)
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function requiredFile(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`缺少${label}: ${filePath}`)
  return filePath
}

function listFiles(directory) {
  const files = []
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const entryPath = join(currentDirectory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`内容目录不允许符号链接: ${entryPath}`)
      }
      if (entry.isDirectory()) visit(entryPath)
      else if (entry.isFile()) files.push(entryPath)
      else throw new Error(`内容目录包含不支持的条目: ${entryPath}`)
    }
  }
  visit(directory)
  return files.sort((left, right) => left.localeCompare(right, 'en'))
}

function parseNamedArgument(name) {
  const prefix = `--${name}=`
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

function normalizeContentVersion(value) {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(normalized)) {
    throw new Error(
      '内容版本仅允许 1–80 位字母、数字、点、下划线和连字符，且必须以字母或数字开头'
    )
  }
  return normalized
}

function parseStructuredLine(output, prefix, label) {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith(prefix))
  if (!line) throw new Error(`${label}未输出结构化结果`)
  return JSON.parse(line.slice(prefix.length))
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(
    `内容包构建仅支持 Windows x64，当前为 ${process.platform}/${process.arch}`
  )
}

const sourceState = {
  commit: run('git', ['rev-parse', 'HEAD'], { capture: true }),
  dirty: run('git', ['status', '--porcelain'], { capture: true }).length > 0,
}
const generatedAt = new Date()
const defaultRevision = `${appVersion}-${sourceState.commit.slice(0, 8)}${
  sourceState.dirty ? '-dirty' : ''
}-${generatedAt
  .toISOString()
  .replaceAll(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z')}`
const contentVersion = normalizeContentVersion(
  parseNamedArgument('content-version') ??
    process.env.AIR_RING_CONTENT_VERSION ??
    defaultRevision
)
const packageName = `JJSK-Content-${contentVersion}-electron-${electronVersion}-win-x64`
const stagingRoot = join(contentOutputDirectory, `.staging-${contentVersion}`)
const packageRoot = join(stagingRoot, 'JJSK-Content')
const payloadRoot = join(packageRoot, 'payload')
const payloadResources = join(payloadRoot, 'resources')
const archiveName = `${packageName}.7z`
const archivePath = join(contentOutputDirectory, archiveName)
const sidecarPath = join(contentOutputDirectory, `${packageName}.manifest.json`)

const toolchain = {
  node: process.version,
  pnpm: runPnpm(['--version'], { capture: true }),
  electron: electronVersion,
  rustc: run('rustc', ['--version'], { capture: true }),
  cargo: run('cargo', ['--version'], { capture: true }),
}

runPnpm(['--filter', '@jjsk/air-ring-native', 'run', 'build'])
run(
  process.execPath,
  [
    prebuildInstallCli,
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--platform=win32',
    '--arch=x64',
    '--force',
    '--verbose',
  ],
  { cwd: betterSqliteDirectory }
)
runPnpm(['exec', 'vite', 'build'], { cwd: appDirectory })
runPnpm(['run', 'audit:electron-bundles'], { cwd: appDirectory })
runPnpm(
  [
    'exec',
    'electron-builder',
    '--win',
    'dir',
    '--x64',
    '--config.npmRebuild=false',
  ],
  { cwd: appDirectory }
)

requiredFile(executablePath, '主程序')
requiredFile(join(resourcesDirectory, 'app.asar'), 'app.asar')
requiredFile(sourceNativePath, '源码 Native addon')
requiredFile(packagedNativePath, '打包 Native addon')
requiredFile(applyScriptPath, '内容替换脚本')
requiredFile(runtimeProbePath, 'Electron 运行时探针')
const sqliteNativePath = requiredFile(
  join(resourcesDirectory, 'native', 'better_sqlite3.node'),
  '打包后的 better-sqlite3 addon'
)
if (sha256(sourceNativePath) !== sha256(packagedNativePath)) {
  throw new Error('源码 Native addon 与内容目录 Native addon 的 SHA-256 不一致')
}

const runtimeOutput = run(executablePath, [runtimeProbePath], {
  capture: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
const runtime = parseStructuredLine(
  runtimeOutput,
  '[ContentRuntimeProbe] ',
  'Electron 运行时探针'
)
if (
  runtime.platform !== 'win32' ||
  runtime.arch !== 'x64' ||
  runtime.electron !== electronVersion
) {
  throw new Error(`Electron 运行时与构建目标不一致: ${JSON.stringify(runtime)}`)
}

const selfTestEntry = join(
  resourcesDirectory,
  'app.asar',
  'dist-electron',
  'fieldSelfTest.js'
)
const selfTestOutput = run(executablePath, [selfTestEntry], {
  capture: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
const selfTest = parseStructuredLine(
  selfTestOutput,
  '[FieldSelfTest] ',
  '内容目录自检'
)
if (!selfTest.ok) {
  throw new Error(`内容目录自检失败: ${selfTest.error ?? '未知错误'}`)
}

mkdirSync(contentOutputDirectory, { recursive: true })
if (existsSync(stagingRoot)) rmSync(stagingRoot, { recursive: true })
mkdirSync(payloadRoot, { recursive: true })
cpSync(resourcesDirectory, payloadResources, {
  recursive: true,
  dereference: false,
  errorOnExist: true,
})
copyFileSync(applyScriptPath, join(packageRoot, 'apply-content-update.ps1'))
copyFileSync(runtimeProbePath, join(packageRoot, 'content-runtime-probe.mjs'))

const files = listFiles(payloadRoot).map((filePath) => ({
  path: relative(payloadRoot, filePath).replaceAll('\\', '/'),
  bytes: statSync(filePath).size,
  sha256: sha256(filePath),
}))
if (!files.some((file) => file.path === 'resources/app.asar')) {
  throw new Error('内容清单缺少 resources/app.asar')
}

const manifest = {
  schemaVersion: 1,
  product: 'JJSK',
  appVersion,
  contentVersion,
  channel:
    parseNamedArgument('content-version') ||
    process.env.AIR_RING_CONTENT_VERSION
      ? 'release-candidate'
      : 'development',
  generatedAt: generatedAt.toISOString(),
  source: sourceState,
  requiredRuntime: runtime,
  toolchain,
  packagedRuntimeDefaults: {
    AIR_RING_RUST_PRIMARY: '1',
    AIR_RING_RUST_PRIMARY_THREADS: '4',
    AIR_RING_BUBBLE_RUST_PRIMARY: '1',
    rollback: {
      AIR_RING_RUST_PRIMARY_DISABLE: '1',
      AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE: '1',
    },
  },
  selfTest,
  native: {
    rust: {
      path: relative(
        payloadRoot,
        join(payloadResources, 'native', nativeFileName)
      ).replaceAll('\\', '/'),
      sha256: sha256(packagedNativePath),
    },
    betterSqlite3: {
      path: relative(
        payloadRoot,
        join(payloadResources, relative(resourcesDirectory, sqliteNativePath))
      ).replaceAll('\\', '/'),
      sha256: sha256(sqliteNativePath),
    },
  },
  files,
  payload: {
    root: 'payload/resources',
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    replacementUnit: 'resources',
  },
  updatePolicy: {
    applicationMustBeStopped: true,
    exactRuntimeMatch: ['platform', 'arch', 'electron', 'modules'],
    integrity: 'sha256-per-file',
    rollback: 'preserve-previous-resources-directory',
  },
}
writeFileSync(
  join(packageRoot, 'content-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
)

if (existsSync(archivePath)) rmSync(archivePath)
run(path7za, ['a', '-t7z', '-mx=9', archivePath, basename(packageRoot)], {
  cwd: stagingRoot,
})
run(path7za, ['t', archivePath])
const archiveListing = run(path7za, ['l', '-slt', archivePath], {
  capture: true,
})
const archiveEntries = archiveListing
  .split(/\r?\n/)
  .filter((line) => line.startsWith('Path = '))
  .map((line) => line.slice('Path = '.length).replaceAll('\\', '/'))
  .filter((entry) => resolve(entry) !== resolve(archivePath))
const unexpectedEntries = archiveEntries.filter(
  (entry) => entry !== 'JJSK-Content' && !entry.startsWith('JJSK-Content/')
)
if (unexpectedEntries.length > 0) {
  throw new Error(`内容归档包含包根目录外条目: ${unexpectedEntries.join(', ')}`)
}
const forbiddenRuntimeEntries = archiveEntries.filter((entry) => {
  const normalized = entry.toLowerCase()
  return (
    normalized.endsWith('/jjsk.exe') ||
    normalized.endsWith('/resources.pak') ||
    normalized.endsWith('/icudtl.dat') ||
    normalized.includes('/locales/') ||
    normalized.endsWith('.dll') ||
    normalized.endsWith('.pak')
  )
})
if (forbiddenRuntimeEntries.length > 0) {
  throw new Error(
    `内容归档意外包含 Electron 基础运行时: ${forbiddenRuntimeEntries.join(', ')}`
  )
}
const archiveSignature = readFileSync(archivePath)
  .subarray(0, 6)
  .toString('hex')
if (archiveSignature !== '377abcaf271c') {
  throw new Error(`内容归档不是有效 7z: ${archiveSignature}`)
}

const sidecar = {
  ...manifest,
  archive: {
    fileName: archiveName,
    bytes: statSync(archivePath).size,
    sha256: sha256(archivePath),
    createdBy: '7zip-bin 7za custom resources archive',
    integrityTested: true,
    containsElectronRuntime: false,
    runtimeFilesExcludedByListing: true,
  },
}
writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8')
rmSync(stagingRoot, { recursive: true })

console.log(
  `[ContentBuild] ${JSON.stringify({
    ok: true,
    contentVersion,
    archivePath,
    manifestPath: sidecarPath,
    archiveBytes: sidecar.archive.bytes,
    archiveSha256: sidecar.archive.sha256,
    payloadBytes: manifest.payload.totalBytes,
    fileCount: manifest.payload.fileCount,
    requiredRuntime: runtime,
    rustNativeEnabled: true,
    selfTest: selfTest.ok,
  })}`
)
