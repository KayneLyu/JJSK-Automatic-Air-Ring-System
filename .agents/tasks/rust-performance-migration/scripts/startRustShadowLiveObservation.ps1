[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [switch]$OperatorGateConfirmed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $OperatorGateConfirmed) {
  throw '必须显式传入 -OperatorGateConfirmed 才能启动真实环境观测'
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$applicationDirectory = Join-Path $repositoryRoot 'apps/AirRingSys'
$outputDirectory = Join-Path $PSScriptRoot 'outputs'
$preflightScript = Join-Path $PSScriptRoot 'checkRustShadowObservationReadiness.ps1'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$observationLogPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "JJSK\logs\rust-shadow-live-$timestamp.ndjson"
$stdoutPath = Join-Path $outputDirectory "stage-6-live-$timestamp.stdout.txt"
$stderrPath = Join-Path $outputDirectory "stage-6-live-$timestamp.stderr.txt"
$metadataPath = Join-Path $outputDirectory 'stage-6-live-session.json'

& $preflightScript | Out-Host

$electronCandidates = @(
  Get-ChildItem -Path (Join-Path $repositoryRoot 'node_modules/.pnpm/electron@*/node_modules/electron/dist/electron.exe') -ErrorAction SilentlyContinue
)
if ($electronCandidates.Count -ne 1) {
  throw "预期找到一个 Electron 可执行文件，实际找到 $($electronCandidates.Count) 个"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$childEnvironment = @{
  AIR_RING_RUST_SHADOW = '1'
  AIR_RING_RUST_SHADOW_THREADS = '4'
  AIR_RING_RUST_NATIVE_PATH = (Join-Path $repositoryRoot 'packages/AirRingNative/air-ring-native.win32-x64-msvc.node')
  AIR_RING_RUST_SHADOW_EVERY_N = '5'
  AIR_RING_RUST_SHADOW_MAX_RUNS = '100'
  AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES = '3'
  AIR_RING_RUST_SHADOW_MAX_DELTA_DEG = '0.000000001'
  AIR_RING_RUST_SHADOW_LOG_PATH = $observationLogPath
  ELECTRON_ENABLE_LOGGING = '1'
}

$electronProcess = Start-Process `
  -FilePath $electronCandidates[0].FullName `
  -ArgumentList '.' `
  -WorkingDirectory $applicationDirectory `
  -Environment $childEnvironment `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

Start-Sleep -Seconds 2
if ($electronProcess.HasExited) {
  $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { '' }
  throw "Electron 启动后立即退出，code=$($electronProcess.ExitCode): $stderr"
}

$metadata = [ordered]@{
  schemaVersion = 1
  status = 'running'
  startedAt = (Get-Date).ToString('o')
  processId = $electronProcess.Id
  operatorGateConfirmed = $true
  observationLogPath = $observationLogPath
  stdoutPath = $stdoutPath
  stderrPath = $stderrPath
  configuration = [ordered]@{
    threadLimit = 4
    everyN = 5
    maxRuns = 100
    maxConsecutiveFailures = 3
    maxDeltaDeg = 1e-9
    workerTopology = 'persistent-single-worker-fifo'
  }
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataPath -Encoding utf8

Write-Output "stage-6-live-process-id=$($electronProcess.Id)"
Write-Output "stage-6-live-session=$metadataPath"
Write-Output "stage-6-live-observation-log=$observationLogPath"
