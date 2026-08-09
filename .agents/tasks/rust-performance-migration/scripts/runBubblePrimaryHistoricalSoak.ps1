[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$DatabasePath,
  [Parameter(Mandatory)]
  [long]$StartMs,
  [Parameter(Mandatory)]
  [long]$EndMs,
  [Parameter(Mandatory)]
  [double]$MembraneWidthMm,
  [Parameter(Mandatory)]
  [double]$ThetaMaxDeg,
  [Parameter(Mandatory)]
  [double]$MmPerPulse,
  [Parameter(Mandatory)]
  [double]$AirAD,
  [double]$Gain = 1.0,
  [Parameter(Mandatory)]
  [double]$TransportDelayMs,
  [ValidateRange(1, 100)]
  [int]$SweepLimit = 50,
  [ValidateRange(8, 720)]
  [int]$NumBins = 48,
  [double]$ProcessDeformationFactor = 1.02,
  [ValidateRange(2, 200)]
  [int]$RepeatCount = 77,
  [ValidateRange(100, 10000)]
  [int]$MinPrimarySuccess = 1000
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
foreach ($entry in @{
  MembraneWidthMm = $MembraneWidthMm
  ThetaMaxDeg = $ThetaMaxDeg
  MmPerPulse = $MmPerPulse
  AirAD = $AirAD
  Gain = $Gain
  TransportDelayMs = $TransportDelayMs
  ProcessDeformationFactor = $ProcessDeformationFactor
}.GetEnumerator()) {
  if (-not [double]::IsFinite($entry.Value) -or $entry.Value -le 0) {
    throw "$($entry.Key) 必须是大于 0 的有限数值"
  }
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$runnerPath = Join-Path $repositoryRoot 'apps/AirRingSys/dist-electron/historicalBubbleObservation.js'
$queryWorkerPath = Join-Path $repositoryRoot 'apps/AirRingSys/dist-electron/bubbleQueryWorker.js'
$bubbleWorkerPath = Join-Path $repositoryRoot 'apps/AirRingSys/dist-electron/bubbleWorker.js'
$nativePath = Join-Path $repositoryRoot 'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
$outputDirectory = Join-Path $PSScriptRoot 'outputs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutPath = Join-Path $outputDirectory "phase-9-history-soak-$timestamp.stdout.txt"
$stderrPath = Join-Path $outputDirectory "phase-9-history-soak-$timestamp.stderr.txt"
$reportPath = Join-Path $outputDirectory "phase-9-history-soak-$timestamp.json"

foreach ($requiredPath in @($runnerPath, $queryWorkerPath, $bubbleWorkerPath, $nativePath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "缺少 Phase 9 历史长跑文件: $requiredPath。请先执行 mise exec --command `"pnpm --filter @jjsk/ari-ring exec vite build`""
  }
}

$electronCandidates = @(
  Get-ChildItem -Path (Join-Path $repositoryRoot 'node_modules/.pnpm/electron@*/node_modules/electron/dist/electron.exe') -ErrorAction SilentlyContinue
)
if ($electronCandidates.Count -ne 1) {
  throw "预期找到一个 Electron 可执行文件，实际找到 $($electronCandidates.Count) 个"
}

function Get-DatabaseSnapshot {
  param([string]$Path)
  $targets = @($Path, "$Path-wal", "$Path-shm", "$Path-journal")
  return @($targets | ForEach-Object {
    if (Test-Path -LiteralPath $_ -PathType Leaf) {
      $item = Get-Item -LiteralPath $_
      [ordered]@{
        file = [IO.Path]::GetFileName($_)
        exists = $true
        length = $item.Length
        lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString('o')
        sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash
      }
    } else {
      [ordered]@{
        file = [IO.Path]::GetFileName($_)
        exists = $false
        length = 0
        lastWriteTimeUtc = $null
        sha256 = $null
      }
    }
  })
}

function Get-SqliteJournalFormat {
  param([string]$Path)
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    if ($stream.Length -lt 19) { throw 'SQLite 文件头长度不足' }
    [void]$stream.Seek(18, [IO.SeekOrigin]::Begin)
    $writeVersion = $stream.ReadByte()
    if ($writeVersion -eq 2) { return 'wal' }
    if ($writeVersion -eq 1) { return 'rollback' }
    return "unknown:$writeVersion"
  } finally {
    $stream.Dispose()
  }
}

function Get-Percentile {
  param([double[]]$Values, [double]$Percentile)
  if ($Values.Count -eq 0) { return $null }
  $sorted = @($Values | Sort-Object)
  $index = [Math]::Min($sorted.Count - 1, [Math]::Max(0, [Math]::Ceiling($sorted.Count * $Percentile) - 1))
  return $sorted[$index]
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$beforeSnapshot = Get-DatabaseSnapshot -Path $DatabasePath
$beforeJournalFormat = Get-SqliteJournalFormat -Path $DatabasePath
$childEnvironment = @{
  ELECTRON_RUN_AS_NODE = '1'
  AIR_RING_BUBBLE_RUST_SHADOW = '0'
  AIR_RING_BUBBLE_RUST_PRIMARY = '1'
  AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE = '0'
  AIR_RING_RUST_NATIVE_PATH = $nativePath
}
$arguments = @(
  $runnerPath,
  $DatabasePath,
  [string]$StartMs,
  [string]$EndMs,
  [string]$SweepLimit,
  [string]$MembraneWidthMm,
  [string]$ThetaMaxDeg,
  [string]$MmPerPulse,
  [string]$AirAD,
  [string]$Gain,
  [string]$TransportDelayMs,
  [string]$NumBins,
  [string]$ProcessDeformationFactor,
  [string]$RepeatCount
)

$process = Start-Process `
  -FilePath $electronCandidates[0].FullName `
  -ArgumentList $arguments `
  -WorkingDirectory $repositoryRoot `
  -Environment $childEnvironment `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -Wait `
  -PassThru

$afterSnapshot = Get-DatabaseSnapshot -Path $DatabasePath
$afterJournalFormat = Get-SqliteJournalFormat -Path $DatabasePath
$databaseUnchanged = (ConvertTo-Json $beforeSnapshot -Depth 5 -Compress) -eq (ConvertTo-Json $afterSnapshot -Depth 5 -Compress)
$journalFormatUnchanged = $beforeJournalFormat -eq $afterJournalFormat
$stdoutLines = if (Test-Path -LiteralPath $stdoutPath) { @(Get-Content -LiteralPath $stdoutPath) } else { @() }
$historyEvents = @($stdoutLines | ForEach-Object {
  if ($_ -match '^\[BubbleHistorical\] (.+)$') { $Matches[1] | ConvertFrom-Json }
})
$telemetry = @($stdoutLines | ForEach-Object {
  if ($_ -match '^\[BubbleWorker\]\[RustPrimary\] (.+)$') { $Matches[1] | ConvertFrom-Json }
})
$historySummary = @($historyEvents | Where-Object type -eq 'summary') | Select-Object -Last 1

if ($process.ExitCode -ne 0 -or $null -eq $historySummary) {
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
  throw "Phase 9 历史长跑进程失败，code=$($process.ExitCode): $stderr"
}

$sweepEvents = @($historyEvents | Where-Object type -eq 'sweep')
$firstPassSuccess = @($sweepEvents | Where-Object { $_.repeatIndex -eq 0 -and $_.status -eq 'success' })
$successTelemetry = @($telemetry | Where-Object status -eq 'success')
$fallbackTelemetry = @($telemetry | Where-Object status -eq 'fallback')
$rustTotalSamples = [double[]]@($successTelemetry | ForEach-Object { $_.rustTotalMs })
$primaryTotalSamples = [double[]]@($successTelemetry | ForEach-Object { $_.totalPrimaryMs })
$reconstructionSamples = [double[]]@($sweepEvents | Where-Object status -eq 'success' | ForEach-Object { $_.elapsedMs })
$directionCoverage = @($firstPassSuccess.direction | Sort-Object -Unique)
$endReplayDeltaBytes = [long]$historySummary.endRssBytes - [long]$historySummary.replayStartRssBytes
$peakRssLimitBytes = 512MB
$memorySlopeLimitBytesPerPass = 1MB
$memoryDeltaLimitBytes = 128MB

$stabilityDecision = if (
  -not $databaseUnchanged -or
  -not $journalFormatUnchanged -or
  $successTelemetry.Count -lt $MinPrimarySuccess -or
  $fallbackTelemetry.Count -ne 0 -or
  $successTelemetry.Count -ne [int]$historySummary.validProfileCount -or
  [int]$historySummary.profileHashDriftCount -ne 0 -or
  [int]$historySummary.uniqueSuccessfulProfileHashCount -lt 10 -or
  [int]$historySummary.bubbleWorkerCreateCount -ne 1 -or
  $directionCoverage.Count -lt 2 -or
  [double]$historySummary.eventLoopP95Ms -ge 100 -or
  [long]$historySummary.peakRssBytes -gt $peakRssLimitBytes -or
  [double]$historySummary.repeatRssSlopeBytesPerPass -gt $memorySlopeLimitBytesPerPass -or
  $endReplayDeltaBytes -gt $memoryDeltaLimitBytes
) { 'fail' } else { 'pass' }

$deploymentDecision = if ($stabilityDecision -ne 'pass') {
  'no-go-stability'
} else {
  'keep-installer-default-off-insufficient-independent-datasets'
}

$report = [ordered]@{
  schemaVersion = 1
  completedAt = (Get-Date).ToString('o')
  databaseFile = [IO.Path]::GetFileName($DatabasePath)
  databaseMode = 'read-only'
  independentDatasetCount = 1
  databaseUnchanged = $databaseUnchanged
  journalFormatBefore = $beforeJournalFormat
  journalFormatAfter = $afterJournalFormat
  journalFormatUnchanged = $journalFormatUnchanged
  configuration = [ordered]@{
    startMs = $StartMs
    endMs = $EndMs
    sweepLimit = $SweepLimit
    repeatCount = $RepeatCount
    minPrimarySuccess = $MinPrimarySuccess
    numBins = $NumBins
  }
  coverage = [ordered]@{
    queriedSweepCount = $historySummary.queriedSweepCount
    attemptedSweepCount = $historySummary.attemptedSweepCount
    firstPassValidProfileCount = $firstPassSuccess.Count
    uniqueSuccessfulProfileHashCount = $historySummary.uniqueSuccessfulProfileHashCount
    directionCoverage = $directionCoverage
    totalValidProfileCount = $historySummary.validProfileCount
    totalRejectedProfileCount = $historySummary.nullProfileCount
    totalFailedProfileCount = $historySummary.failedProfileCount
  }
  primary = [ordered]@{
    successCount = $successTelemetry.Count
    fallbackCount = $fallbackTelemetry.Count
    profileHashDriftCount = $historySummary.profileHashDriftCount
    workerCreateCount = $historySummary.bubbleWorkerCreateCount
    medianRustReconstructionMs = Get-Percentile -Values $rustTotalSamples -Percentile 0.5
    p95RustReconstructionMs = Get-Percentile -Values $rustTotalSamples -Percentile 0.95
    medianPrimaryTotalMs = Get-Percentile -Values $primaryTotalSamples -Percentile 0.5
    p95PrimaryTotalMs = Get-Percentile -Values $primaryTotalSamples -Percentile 0.95
    medianProductionChainMs = Get-Percentile -Values $reconstructionSamples -Percentile 0.5
    p95ProductionChainMs = Get-Percentile -Values $reconstructionSamples -Percentile 0.95
  }
  runtime = [ordered]@{
    eventLoopP95Ms = $historySummary.eventLoopP95Ms
    replayStartRssBytes = $historySummary.replayStartRssBytes
    firstRepeatRssBytes = $historySummary.firstRepeatRssBytes
    lastRepeatRssBytes = $historySummary.lastRepeatRssBytes
    endRssBytes = $historySummary.endRssBytes
    peakRssBytes = $historySummary.peakRssBytes
    peakRssLimitBytes = $peakRssLimitBytes
    endReplayDeltaBytes = $endReplayDeltaBytes
    repeatRssSlopeBytesPerPass = $historySummary.repeatRssSlopeBytesPerPass
    memorySlopeLimitBytesPerPass = $memorySlopeLimitBytesPerPass
    memoryDeltaLimitBytes = $memoryDeltaLimitBytes
  }
  stabilityDecision = $stabilityDecision
  deploymentDecision = $deploymentDecision
  artifacts = [ordered]@{
    stdoutFile = [IO.Path]::GetFileName($stdoutPath)
    stderrFile = [IO.Path]::GetFileName($stderrPath)
  }
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8

if (-not $databaseUnchanged -or -not $journalFormatUnchanged) {
  throw "历史数据库或 sidecar 在长跑期间发生变化；报告: $reportPath"
}
if ($stabilityDecision -ne 'pass') {
  throw "Phase 9 历史长跑未通过；报告: $reportPath"
}

Write-Output "phase-9-report=$reportPath"
Write-Output "phase-9-stability=$stabilityDecision"
Write-Output "phase-9-primary-success=$($successTelemetry.Count)"
Write-Output "phase-9-deployment=$deploymentDecision"
