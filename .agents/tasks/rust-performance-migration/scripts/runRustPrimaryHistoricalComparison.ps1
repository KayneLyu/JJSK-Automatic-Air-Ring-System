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
$baselineStdoutPath = Join-Path $outputDirectory "stage-7-history-$timestamp.typescript.stdout.txt"
$baselineStderrPath = Join-Path $outputDirectory "stage-7-history-$timestamp.typescript.stderr.txt"
$primaryStdoutPath = Join-Path $outputDirectory "stage-7-history-$timestamp.rust.stdout.txt"
$primaryStderrPath = Join-Path $outputDirectory "stage-7-history-$timestamp.rust.stderr.txt"
$reportPath = Join-Path $outputDirectory "stage-7-history-$timestamp.json"

foreach ($requiredPath in @($diagnosticScript, $nativePath, $workerPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "缺少历史 primary 对比所需文件: $requiredPath"
  }
}

$electronCandidates = @(
  Get-ChildItem -Path (Join-Path $repositoryRoot 'node_modules/.pnpm/electron@*/node_modules/electron/dist/electron.exe') -ErrorAction SilentlyContinue
)
if ($electronCandidates.Count -ne 1) {
  throw "预期找到一个 Electron 可执行文件，实际找到 $($electronCandidates.Count) 个"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

function Invoke-HistoricalRun {
  param(
    [Parameter(Mandatory)]
    [bool]$PrimaryEnabled,
    [Parameter(Mandatory)]
    [string]$StdoutPath,
    [Parameter(Mandatory)]
    [string]$StderrPath
  )

  $childEnvironment = @{
    ELECTRON_RUN_AS_NODE = '1'
    AIR_RING_RUST_PRIMARY = if ($PrimaryEnabled) { '1' } else { '0' }
    AIR_RING_RUST_PRIMARY_THREADS = '4'
    AIR_RING_RUST_SHADOW = '0'
    AIR_RING_RUST_NATIVE_PATH = $nativePath
  }
  $process = Start-Process `
    -FilePath $electronCandidates[0].FullName `
    -ArgumentList @($diagnosticScript, $DatabasePath, [string]$StartMs, [string]$EndMs, $ObjectiveMode) `
    -WorkingDirectory $repositoryRoot `
    -Environment $childEnvironment `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -Wait `
    -PassThru
  if ($process.ExitCode -ne 0) {
    $stderr = if (Test-Path -LiteralPath $StderrPath) { Get-Content -Raw -LiteralPath $StderrPath } else { '' }
    throw "历史回放失败，primary=$PrimaryEnabled, code=$($process.ExitCode): $stderr"
  }
  $stdout = Get-Content -Raw -LiteralPath $StdoutPath
  $matches = [regex]::Matches($stdout, '"maxAngle"\s*:\s*(-?\d+(?:\.\d+)?)')
  if ($matches.Count -ne 1) {
    throw "无法从历史回放输出唯一解析 maxAngle，primary=$PrimaryEnabled"
  }
  return [double]$matches[0].Groups[1].Value
}

$typescriptAngle = Invoke-HistoricalRun -PrimaryEnabled $false -StdoutPath $baselineStdoutPath -StderrPath $baselineStderrPath
$rustAngle = Invoke-HistoricalRun -PrimaryEnabled $true -StdoutPath $primaryStdoutPath -StderrPath $primaryStderrPath
$primaryOutput = (Get-Content -Raw -LiteralPath $primaryStdoutPath) + (Get-Content -Raw -LiteralPath $primaryStderrPath)
$primarySucceeded = $primaryOutput.Contains('[RustPrimary]') -and $primaryOutput.Contains('"status":"success"')
$absoluteDeltaDeg = [Math]::Abs($rustAngle - $typescriptAngle)

$report = [ordered]@{
  schemaVersion = 1
  completedAt = (Get-Date).ToString('o')
  databaseFile = [IO.Path]::GetFileName($DatabasePath)
  startMs = $StartMs
  endMs = $EndMs
  objectiveMode = $ObjectiveMode
  databaseMode = 'read-only'
  threadLimit = 4
  typescriptAngleDeg = $typescriptAngle
  rustPrimaryAngleDeg = $rustAngle
  absoluteDeltaDeg = $absoluteDeltaDeg
  primarySucceeded = $primarySucceeded
  withinTolerance = $primarySucceeded -and $absoluteDeltaDeg -le 1e-9
  outputs = [ordered]@{
    typescriptStdout = $baselineStdoutPath
    typescriptStderr = $baselineStderrPath
    rustStdout = $primaryStdoutPath
    rustStderr = $primaryStderrPath
  }
}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding utf8

if (-not $report.withinTolerance) {
  throw "Rust primary 历史对比未通过: primarySucceeded=$primarySucceeded, delta=$absoluteDeltaDeg"
}

Write-Output "stage-7-history-report=$reportPath"
