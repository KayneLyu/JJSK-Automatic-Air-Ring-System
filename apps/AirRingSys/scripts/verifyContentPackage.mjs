import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
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
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { path7za } = require('7zip-bin')
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const packageJson = JSON.parse(
  readFileSync(join(appDirectory, 'package.json'), 'utf8')
)
const releaseDirectory = join(appDirectory, 'release', packageJson.version)
const contentDirectory = join(releaseDirectory, 'content')
const defaultBaseDirectory = join(releaseDirectory, 'win-unpacked')

function parseNamedArgument(name) {
  const prefix = `--${name}=`
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

function run(command, args, options = {}) {
  console.log(`[ContentVerify] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appDirectory,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  })
  if (result.error) throw result.error
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim()
  if (result.status !== 0 && !options.expectFailure) {
    throw new Error(
      `${command} 退出码 ${result.status}${output ? `\n${output}` : ''}`
    )
  }
  if (result.status === 0 && options.expectFailure) {
    throw new Error(`${command} 本应拒绝不兼容内容，但返回成功`)
  }
  return { status: result.status, output }
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function hashRuntimeSentinels(installDirectory) {
  const names = ['JJSK.exe', 'resources.pak', 'icudtl.dat']
  return Object.fromEntries(
    names.map((name) => {
      const filePath = join(installDirectory, name)
      if (!existsSync(filePath)) {
        throw new Error(`基础运行时缺少哨兵文件: ${filePath}`)
      }
      return [name, sha256(filePath)]
    })
  )
}

function latestArchive() {
  if (!existsSync(contentDirectory)) return undefined
  return readdirSync(contentDirectory)
    .filter((name) => name.endsWith('.7z'))
    .map((name) => join(contentDirectory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0]
}

function parseStructuredLine(output, prefix, label) {
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith(prefix))
  if (!line) throw new Error(`${label}未输出结构化结果\n${output}`)
  return JSON.parse(line.slice(prefix.length))
}

if (process.platform !== 'win32') {
  throw new Error(`内容替换验证仅支持 Windows，当前为 ${process.platform}`)
}

const archivePath = resolve(
  parseNamedArgument('archive') ?? latestArchive() ?? ''
)
const baseDirectory = resolve(
  parseNamedArgument('base') ?? defaultBaseDirectory
)
if (!existsSync(archivePath)) throw new Error(`找不到内容 7z: ${archivePath}`)
if (!existsSync(join(baseDirectory, 'JJSK.exe'))) {
  throw new Error(`基础目录缺少 JJSK.exe: ${baseDirectory}`)
}

const verificationRoot = join(tmpdir(), `jjsk-cv-${process.pid}-${Date.now()}`)
const testInstallDirectory = join(verificationRoot, 'base')
const extractedDirectory = join(verificationRoot, 'extracted')
const reportPath = join(
  contentDirectory,
  `${basename(archivePath, '.7z')}.verification.json`
)

try {
  mkdirSync(verificationRoot, { recursive: true })
  mkdirSync(extractedDirectory)
  cpSync(baseDirectory, testInstallDirectory, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
  })

  const runtimeBefore = hashRuntimeSentinels(testInstallDirectory)

  run(path7za, ['x', '-y', `-o${extractedDirectory}`, archivePath])
  const packageDirectories = readdirSync(extractedDirectory, {
    withFileTypes: true,
  }).filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(extractedDirectory, entry.name, 'content-manifest.json'))
  )
  if (packageDirectories.length !== 1) {
    throw new Error(
      `内容归档必须包含唯一包目录，实际为 ${packageDirectories.length}`
    )
  }
  const packageRoot = join(extractedDirectory, packageDirectories[0].name)
  const applyScript = join(packageRoot, 'apply-content-update.ps1')
  const manifestPath = join(packageRoot, 'content-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  const verifyResult = run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    applyScript,
    '-InstallDirectory',
    testInstallDirectory,
    '-VerifyOnly',
  ])
  const verified = JSON.parse(
    verifyResult.output.split(/\r?\n/).findLast((line) => line.startsWith('{'))
  )
  if (!verified.ok || verified.action !== 'verify-only') {
    throw new Error(`内容 VerifyOnly 返回无效结果: ${verifyResult.output}`)
  }

  const applyResult = run('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    applyScript,
    '-InstallDirectory',
    testInstallDirectory,
  ])
  const applied = JSON.parse(
    applyResult.output.split(/\r?\n/).findLast((line) => line.startsWith('{'))
  )
  if (!applied.ok || applied.action !== 'applied') {
    throw new Error(`内容替换返回无效结果: ${applyResult.output}`)
  }
  if (!existsSync(applied.backupDirectory)) {
    throw new Error('内容替换没有保留旧 resources 备份')
  }

  const runtimeAfter = hashRuntimeSentinels(testInstallDirectory)
  if (JSON.stringify(runtimeAfter) !== JSON.stringify(runtimeBefore)) {
    throw new Error('内容替换修改了 Electron 基础运行时文件')
  }

  const selfTestEntry = join(
    testInstallDirectory,
    'resources',
    'app.asar',
    'dist-electron',
    'fieldSelfTest.js'
  )
  const selfTestResult = run(
    join(testInstallDirectory, 'JJSK.exe'),
    [selfTestEntry],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  )
  const selfTest = parseStructuredLine(
    selfTestResult.output,
    '[FieldSelfTest] ',
    '更新后现场包自检'
  )
  if (!selfTest.ok) {
    throw new Error(`更新后现场包自检失败: ${selfTest.error ?? '未知错误'}`)
  }

  manifest.requiredRuntime.electron = '0.0.0-incompatible-test'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const mismatchResult = run(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      applyScript,
      '-InstallDirectory',
      testInstallDirectory,
      '-VerifyOnly',
    ],
    { expectFailure: true }
  )
  if (!mismatchResult.output.includes('运行时不兼容')) {
    throw new Error(`错误版本拒绝原因不明确: ${mismatchResult.output}`)
  }

  const report = {
    schemaVersion: 1,
    ok: true,
    verifiedAt: new Date().toISOString(),
    archive: {
      path: archivePath,
      bytes: statSync(archivePath).size,
      sha256: sha256(archivePath),
    },
    baseDirectory,
    contentVersion: manifest.contentVersion,
    runtimeUnchanged: true,
    verifyOnlyPassed: true,
    applyPassed: true,
    backupPreserved: true,
    postApplySelfTest: selfTest,
    incompatibleRuntimeRejected: true,
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(
    `[ContentVerify] ${JSON.stringify({
      ok: true,
      archivePath,
      reportPath,
      contentVersion: manifest.contentVersion,
      runtimeUnchanged: true,
      selfTest: selfTest.ok,
      incompatibleRuntimeRejected: true,
    })}`
  )
} finally {
  if (existsSync(verificationRoot)) {
    rmSync(verificationRoot, { recursive: true, force: true })
  }
}
