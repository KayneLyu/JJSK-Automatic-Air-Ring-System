import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const repositoryRoot = resolve(appDirectory, '../..')
const packageJson = JSON.parse(
  readFileSync(join(appDirectory, 'package.json'), 'utf8')
)
const version = packageJson.version
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
const releaseDirectory = join(appDirectory, 'release', version)
const unpackedDirectory = join(releaseDirectory, 'win-unpacked')
const resourcesDirectory = join(unpackedDirectory, 'resources')
const nativeFileName = 'air-ring-native.win32-x64-msvc.node'
const sourceNativePath = join(
  repositoryRoot,
  'packages',
  'AirRingNative',
  nativeFileName
)
const packagedNativePath = join(resourcesDirectory, 'native', nativeFileName)
const archiveName = `JJSK-Windows-${version}-unpacked.7z`
const archivePath = join(releaseDirectory, archiveName)
const sidecarManifestPath = join(
  releaseDirectory,
  `JJSK-Windows-${version}-unpacked.manifest.json`
)
const pnpmEntrypoint = process.env.npm_execpath
const pnpmEntrypointIsJavaScript =
  pnpmEntrypoint !== undefined && /\.(?:c|m)?js$/i.test(pnpmEntrypoint)
const pnpmCommand = pnpmEntrypointIsJavaScript
  ? process.execPath
  : (pnpmEntrypoint ?? 'pnpm')
const pnpmPrefix = pnpmEntrypointIsJavaScript ? [pnpmEntrypoint] : []

function run(command, args, options = {}) {
  console.log(`[FieldBuild] ${command} ${args.join(' ')}`)
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

function findFile(directory, targetName) {
  if (!existsSync(directory)) return undefined
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(entryPath, targetName)
      if (nested) return nested
    } else if (entry.name === targetName) {
      return entryPath
    }
  }
  return undefined
}

function summarizeDirectory(directory) {
  let fileCount = 0
  let totalBytes = 0
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const entryPath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(entryPath)
      else {
        fileCount += 1
        totalBytes += statSync(entryPath).size
      }
    }
  }
  visit(directory)
  return { fileCount, totalBytes }
}

function requiredFile(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`缺少${label}: ${filePath}`)
  return filePath
}

function relativeToUnpacked(filePath) {
  return relative(unpackedDirectory, filePath).replaceAll('\\', '/')
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(
    `现场包构建仅支持 Windows x64，当前为 ${process.platform}/${process.arch}`
  )
}

const sourceState = {
  commit: run('git', ['rev-parse', 'HEAD'], { capture: true }),
  dirty: run('git', ['status', '--porcelain'], { capture: true }).length > 0,
}
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
runPnpm(
  [
    'exec',
    'electron-builder',
    '--win',
    'dir',
    '7z',
    '--x64',
    `--config.win.artifactName=JJSK-Windows-${version}-unpacked.\${ext}`,
    '--config.compression=maximum',
    '--config.npmRebuild=false',
  ],
  { cwd: appDirectory }
)

const executablePath = requiredFile(
  join(unpackedDirectory, 'JJSK.exe'),
  '主程序'
)
const asarPath = requiredFile(join(resourcesDirectory, 'app.asar'), 'app.asar')
requiredFile(sourceNativePath, '源码 Native addon')
requiredFile(packagedNativePath, '打包 Native addon')
requiredFile(archivePath, 'electron-builder 7z 现场包')
const sqliteNativePath = requiredFile(
  findFile(
    join(
      resourcesDirectory,
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3'
    ),
    'better_sqlite3.node'
  ) ?? '',
  '解包后的 better-sqlite3 addon'
)

const sourceNativeSha256 = sha256(sourceNativePath)
const packagedNativeSha256 = sha256(packagedNativePath)
if (sourceNativeSha256 !== packagedNativeSha256) {
  throw new Error('源码 Native addon 与现场包 Native addon 的 SHA-256 不一致')
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
const selfTestLine = selfTestOutput
  .split(/\r?\n/)
  .find((line) => line.startsWith('[FieldSelfTest] '))
if (!selfTestLine) throw new Error('现场包自检未输出结构化结果')
const selfTest = JSON.parse(selfTestLine.slice('[FieldSelfTest] '.length))
if (!selfTest.ok)
  throw new Error(`现场包自检失败: ${selfTest.error ?? '未知错误'}`)

const buildManifest = {
  schemaVersion: 1,
  product: 'JJSK',
  version,
  generatedAt: new Date().toISOString(),
  target: { platform: 'win32', arch: 'x64', format: 'win-unpacked' },
  source: sourceState,
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
  files: {
    executable: {
      path: relativeToUnpacked(executablePath),
      sha256: sha256(executablePath),
    },
    asar: { path: relativeToUnpacked(asarPath), sha256: sha256(asarPath) },
    rustNative: {
      path: relativeToUnpacked(packagedNativePath),
      sha256: packagedNativeSha256,
      sourceSha256: sourceNativeSha256,
    },
    betterSqlite3Native: {
      path: relativeToUnpacked(sqliteNativePath),
      sha256: sha256(sqliteNativePath),
    },
  },
  selfTest,
  unpacked: summarizeDirectory(unpackedDirectory),
}

const archiveSignature = readFileSync(archivePath)
  .subarray(0, 6)
  .toString('hex')
if (archiveSignature !== '377abcaf271c') {
  throw new Error(`electron-builder 输出不是有效 7z 签名: ${archiveSignature}`)
}

const sidecarManifest = {
  ...buildManifest,
  archive: {
    fileName: archiveName,
    bytes: statSync(archivePath).size,
    sha256: sha256(archivePath),
    createdBy: 'electron-builder 7z target',
    signatureVerified: true,
  },
}
writeFileSync(
  sidecarManifestPath,
  `${JSON.stringify(sidecarManifest, null, 2)}\n`,
  'utf8'
)

console.log(
  `[FieldBuild] ${JSON.stringify({
    ok: true,
    unpackedDirectory,
    archivePath,
    manifestPath: sidecarManifestPath,
    rustNativeEnabled: true,
    selfTest: selfTest.ok,
  })}`
)
