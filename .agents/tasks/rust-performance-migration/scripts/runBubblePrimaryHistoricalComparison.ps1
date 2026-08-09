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
  [int]$SweepLimit = 30,
  [ValidateRange(8, 720)]
  [int]$NumBins = 48,
  [double]$ProcessDeformationFactor = 1.02
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
$reportPath = Join-Path $outputDirectory "phase-8c-history-$timestamp.json"

foreach ($requiredPath in @($runnerPath, $queryWorkerPath, $bubbleWorkerPath, $nativePath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "缺少 Phase 8C 历史验收文件: $requiredPath。请先执行 mise exec --command `"pnpm --filter @jjsk/ari-ring exec vite build`""
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

function Invoke-HistoricalMode {
  param(
    [string]$Mode,
    [bool]$PrimaryEnabled,
    [string[]]$Arguments
  )
  $stdoutPath = Join-Path $outputDirectory "phase-8c-history-$timestamp-$Mode.stdout.txt"
  $stderrPath = Join-Path $outputDirectory "phase-8c-history-$timestamp-$Mode.stderr.txt"
  $childEnvironment = @{
    ELECTRON_RUN_AS_NODE = '1'
    AIR_RING_BUBBLE_RUST_SHADOW = '0'
    AIR_RING_BUBBLE_RUST_PRIMARY = if ($PrimaryEnabled) { '1' } else { '0' }
    AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE = if ($PrimaryEnabled) { '0' } else { '1' }
    AIR_RING_RUST_NATIVE_PATH = $nativePath
  }
  $process = Start-Process `
    -FilePath $electronCandidates[0].FullName `
    -ArgumentList $Arguments `
    -WorkingDirectory $repositoryRoot `
    -Environment $childEnvironment `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -Wait `
    -PassThru
  $stdoutLines = if (Test-Path -LiteralPath $stdoutPath) { @(Get-Content -LiteralPath $stdoutPath) } else { @() }
  $historyEvents = @($stdoutLines | ForEach-Object {
    if ($_ -match '^\[BubbleHistorical\] (.+)$') { $Matches[1] | ConvertFrom-Json }
  })
  $primaryTelemetry = @($stdoutLines | ForEach-Object {
    if ($_ -match '^\[BubbleWorker\]\[RustPrimary\] (.+)$') { $Matches[1] | ConvertFrom-Json }
  })
  return [pscustomobject]@{
    mode = $Mode
    exitCode = $process.ExitCode
    stdoutPath = $stdoutPath
    stderrPath = $stderrPath
    sweeps = @($historyEvents | Where-Object type -eq 'sweep' | Sort-Object index)
    summary = @($historyEvents | Where-Object type -eq 'summary') | Select-Object -Last 1
    telemetry = $primaryTelemetry
  }
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
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
  [string]$ProcessDeformationFactor
)

$beforeSnapshot = Get-DatabaseSnapshot -Path $DatabasePath
$beforeJournalFormat = Get-SqliteJournalFormat -Path $DatabasePath
$baseline = Invoke-HistoricalMode -Mode 'typescript' -PrimaryEnabled $false -Arguments $arguments
$primary = Invoke-HistoricalMode -Mode 'rust-primary' -PrimaryEnabled $true -Arguments $arguments
$afterSnapshot = Get-DatabaseSnapshot -Path $DatabasePath
$afterJournalFormat = Get-SqliteJournalFormat -Path $DatabasePath

$databaseUnchanged = (ConvertTo-Json $beforeSnapshot -Depth 5 -Compress) -eq (ConvertTo-Json $afterSnapshot -Depth 5 -Compress)
$journalFormatUnchanged = $beforeJournalFormat -eq $afterJournalFormat
$mismatchIndexes = @()
$pairedCount = [Math]::Min($baseline.sweeps.Count, $primary.sweeps.Count)
for ($index = 0; $index -lt $pairedCount; $index += 1) {
  $baselineComparable = $baseline.sweeps[$index] | Select-Object index, status, direction, durationMs, sourceRowCount, sampledRowCount, measurementCount, numBins, profileHash, error
  $primaryComparable = $primary.sweeps[$index] | Select-Object index, status, direction, durationMs, sourceRowCount, sampledRowCount, measurementCount, numBins, profileHash, error
  if (($baselineComparable | ConvertTo-Json -Compress) -ne ($primaryComparable | ConvertTo-Json -Compress)) {
    $mismatchIndexes += [int]$baseline.sweeps[$index].index
  }
}
if ($baseline.sweeps.Count -ne $primary.sweeps.Count) {
  $mismatchIndexes += -1
}

$baselineSuccess = @($baseline.sweeps | Where-Object status -eq 'success')
$primarySuccess = @($primary.sweeps | Where-Object status -eq 'success')
$primarySuccessTelemetry = @($primary.telemetry | Where-Object status -eq 'success')
$primaryFallbackTelemetry = @($primary.telemetry | Where-Object status -eq 'fallback')
$baselineElapsed = [double[]]@($baselineSuccess | ForEach-Object { $_.elapsedMs })
$primaryElapsed = [double[]]@($primarySuccess | ForEach-Object { $_.elapsedMs })
$medianBaselineMs = Get-Percentile -Values $baselineElapsed -Percentile 0.5
$medianPrimaryMs = Get-Percentile -Values $primaryElapsed -Percentile 0.5
$medianSpeedup = if ($null -ne $medianBaselineMs -and $null -ne $medianPrimaryMs -and $medianPrimaryMs -gt 0) {
  $medianBaselineMs / $medianPrimaryMs
} else { $null }

$decision = if (
  $baseline.exitCode -ne 0 -or
  $primary.exitCode -ne 0 -or
  -not $databaseUnchanged -or
  -not $journalFormatUnchanged -or
  $mismatchIndexes.Count -gt 0 -or
  $baselineSuccess.Count -lt 10 -or
  $primarySuccessTelemetry.Count -ne $primarySuccess.Count -or
  $primaryFallbackTelemetry.Count -ne 0 -or
  $baseline.summary.bubbleWorkerCreateCount -ne 1 -or
  $primary.summary.bubbleWorkerCreateCount -ne 1
) { 'no-go' } else { 'go-enable-mise-development' }

$report = [ordered]@{
  schemaVersion = 1
  completedAt = (Get-Date).ToString('o')
  databaseFile = [IO.Path]::GetFileName($DatabasePath)
  databaseMode = 'read-only'
  databaseUnchanged = $databaseUnchanged
  journalFormatBefore = $beforeJournalFormat
  journalFormatAfter = $afterJournalFormat
  journalFormatUnchanged = $journalFormatUnchanged
  configuration = [ordered]@{
    startMs = $StartMs
    endMs = $EndMs
    sweepLimit = $SweepLimit
    membraneWidthMm = $MembraneWidthMm
    thetaMaxDeg = $ThetaMaxDeg
    mmPerPulse = $MmPerPulse
    airAD = $AirAD
    gain = $Gain
    transportDelayMs = $TransportDelayMs
    numBins = $NumBins
    processDeformationFactor = $ProcessDeformationFactor
  }
  comparison = [ordered]@{
    baselineExitCode = $baseline.exitCode
    primaryExitCode = $primary.exitCode
    baselineSweepCount = $baseline.sweeps.Count
    primarySweepCount = $primary.sweeps.Count
    baselineSuccessCount = $baselineSuccess.Count
    primarySuccessCount = $primarySuccess.Count
    exactProfileHashMatchCount = $baselineSuccess.Count - @($mismatchIndexes | Where-Object { $_ -ge 0 }).Count
    mismatchCount = $mismatchIndexes.Count
    mismatchIndexes = $mismatchIndexes
    primaryTelemetrySuccessCount = $primarySuccessTelemetry.Count
    primaryTelemetryFallbackCount = $primaryFallbackTelemetry.Count
    baselineWorkerCreateCount = $baseline.summary.bubbleWorkerCreateCount
    primaryWorkerCreateCount = $primary.summary.bubbleWorkerCreateCount
    medianBaselineReconstructionMs = $medianBaselineMs
    medianPrimaryReconstructionMs = $medianPrimaryMs
    medianSpeedup = $medianSpeedup
  }
  decision = $decision
  artifacts = [ordered]@{
    baselineStdoutFile = [IO.Path]::GetFileName($baseline.stdoutPath)
    baselineStderrFile = [IO.Path]::GetFileName($baseline.stderrPath)
    primaryStdoutFile = [IO.Path]::GetFileName($primary.stdoutPath)
    primaryStderrFile = [IO.Path]::GetFileName($primary.stderrPath)
  }
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8

if ($baseline.exitCode -ne 0 -or $primary.exitCode -ne 0) {
  throw "Phase 8C 历史双跑失败；报告: $reportPath"
}
if (-not $databaseUnchanged -or -not $journalFormatUnchanged) {
  throw "历史数据库或 sidecar 在双跑期间发生变化；报告: $reportPath"
}
if ($decision -ne 'go-enable-mise-development') {
  throw "Phase 8C 历史双跑未通过；报告: $reportPath"
}

Write-Output "phase-8c-report=$reportPath"
Write-Output "phase-8c-decision=$decision"
Write-Output "phase-8c-exact-matches=$($report.comparison.exactProfileHashMatchCount)"
