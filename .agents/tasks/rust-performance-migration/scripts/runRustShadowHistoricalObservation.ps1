[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$DatabasePath,

  [Parameter(Mandatory)]
  [long]$StartMs,

  [Parameter(Mandatory)]
  [long]$EndMs,

  [ValidateSet('auto', 'direct', 'expanded')]
  [string]$ObjectiveMode = 'auto'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not [IO.Path]::IsPathFullyQualified($DatabasePath)) {
  throw 'DatabasePath 必须是绝对路径'
}
if (-not (Test-Path -LiteralPath $DatabasePath -PathType Leaf)) {
  throw "历史数据库不存在: $DatabasePath"
}
if ($StartMs -le 0 -or $EndMs -le $StartMs) {
  throw '历史回放时间范围无效'
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$diagnosticScript = Join-Path $repositoryRoot '.agents/scripts/run-historical-angle-diagnostic.mjs'
$nativePath = Join-Path $repositoryRoot 'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
$workerPath = Join-Path $repositoryRoot 'apps/AirRingSys/dist-electron/historicalCalibrationWorker.js'
$outputDirectory = Join-Path $PSScriptRoot 'outputs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$observationLogPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "JJSK\logs\rust-shadow-history-$timestamp.ndjson"
$stdoutPath = Join-Path $outputDirectory "stage-6-history-$timestamp.stdout.txt"
$stderrPath = Join-Path $outputDirectory "stage-6-history-$timestamp.stderr.txt"
$metadataPath = Join-Path $outputDirectory "stage-6-history-$timestamp.json"

foreach ($requiredPath in @($diagnosticScript, $nativePath, $workerPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "缺少历史 Native 观测所需文件: $requiredPath"
  }
}

$electronCandidates = @(
  Get-ChildItem -Path (Join-Path $repositoryRoot 'node_modules/.pnpm/electron@*/node_modules/electron/dist/electron.exe') -ErrorAction SilentlyContinue
)
if ($electronCandidates.Count -ne 1) {
  throw "预期找到一个 Electron 可执行文件，实际找到 $($electronCandidates.Count) 个"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$childEnvironment = @{
  ELECTRON_RUN_AS_NODE = '1'
  AIR_RING_RUST_SHADOW = '1'
  AIR_RING_RUST_SHADOW_THREADS = '4'
  AIR_RING_RUST_NATIVE_PATH = $nativePath
  AIR_RING_RUST_SHADOW_EVERY_N = '1'
  AIR_RING_RUST_SHADOW_MAX_RUNS = '1'
  AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES = '1'
  AIR_RING_RUST_SHADOW_MAX_DELTA_DEG = '0.000000001'
  AIR_RING_RUST_SHADOW_LOG_PATH = $observationLogPath
}

$process = Start-Process `
  -FilePath $electronCandidates[0].FullName `
  -ArgumentList @($diagnosticScript, $DatabasePath, [string]$StartMs, [string]$EndMs, $ObjectiveMode) `
  -WorkingDirectory $repositoryRoot `
  -Environment $childEnvironment `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -Wait `
  -PassThru

if ($process.ExitCode -ne 0) {
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
  throw "历史 Native 观测失败，code=$($process.ExitCode): $stderr"
}
if (-not (Test-Path -LiteralPath $observationLogPath -PathType Leaf)) {
  throw '历史回放完成，但未生成 Rust shadow telemetry'
}

$metadata = [ordered]@{
  schemaVersion = 1
  completedAt = (Get-Date).ToString('o')
  databaseFile = [IO.Path]::GetFileName($DatabasePath)
  startMs = $StartMs
  endMs = $EndMs
  objectiveMode = $ObjectiveMode
  observationLogPath = $observationLogPath
  stdoutPath = $stdoutPath
  stderrPath = $stderrPath
  configuration = [ordered]@{
    threadLimit = 4
    everyN = 1
    maxRuns = 1
    maxConsecutiveFailures = 1
    maxDeltaDeg = 1e-9
    databaseMode = 'read-only'
  }
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataPath -Encoding utf8

Write-Output "stage-6-history-metadata=$metadataPath"
Write-Output "stage-6-history-observation-log=$observationLogPath"
