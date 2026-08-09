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
  [int]$SweepLimit = 10,
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
$phase8ReportPath = Join-Path $PSScriptRoot 'outputs/phase-8-bubble-native.json'
$outputDirectory = Join-Path $PSScriptRoot 'outputs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutPath = Join-Path $outputDirectory "phase-8b-history-$timestamp.stdout.txt"
$stderrPath = Join-Path $outputDirectory "phase-8b-history-$timestamp.stderr.txt"
$reportPath = Join-Path $outputDirectory "phase-8b-history-$timestamp.json"

foreach ($requiredPath in @($runnerPath, $queryWorkerPath, $bubbleWorkerPath, $nativePath)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "缺少 Phase 8B 历史观测文件: $requiredPath。请先执行 mise exec -- pnpm --filter @jjsk/ari-ring exec vite build"
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
  AIR_RING_BUBBLE_RUST_SHADOW = '1'
  AIR_RING_BUBBLE_RUST_PRIMARY = '0'
  AIR_RING_BUBBLE_RUST_PRIMARY_DISABLE = '1'
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
  [string]$ProcessDeformationFactor
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
$telemetry = @($stdoutLines | ForEach-Object {
  if ($_ -match '^\[BubbleWorker\]\[RustShadow\] (.+)$') {
    $Matches[1] | ConvertFrom-Json
  }
})
$historyEvents = @($stdoutLines | ForEach-Object {
  if ($_ -match '^\[BubbleHistorical\] (.+)$') {
    $Matches[1] | ConvertFrom-Json
  }
})
$historySummary = @($historyEvents | Where-Object type -eq 'summary') | Select-Object -Last 1
$sweepEvents = @($historyEvents | Where-Object type -eq 'sweep')
$successTelemetry = @($telemetry | Where-Object status -eq 'success')
$failureTelemetry = @($telemetry | Where-Object status -ne 'success')
$tsSolveSamples = [double[]]@($successTelemetry | ForEach-Object { $_.tsSolveMs })
$rustSolveSamples = [double[]]@($successTelemetry | ForEach-Object { $_.rustSolveMs })
$tsTotalSamples = [double[]]@($successTelemetry | ForEach-Object { $_.tsTotalMs })
$rustTotalSamples = [double[]]@($successTelemetry | ForEach-Object { $_.rustTotalMs })
$maxProfileDelta = if ($successTelemetry.Count -gt 0) {
  ($successTelemetry | Measure-Object -Property maxAbsProfileDelta -Maximum).Maximum
} else { $null }
$medianTsSolveMs = Get-Percentile -Values $tsSolveSamples -Percentile 0.5
$medianRustSolveMs = Get-Percentile -Values $rustSolveSamples -Percentile 0.5
$medianTsTotalMs = Get-Percentile -Values $tsTotalSamples -Percentile 0.5
$medianRustTotalMs = Get-Percentile -Values $rustTotalSamples -Percentile 0.5
$historicalSolverSpeedup = if ($null -ne $medianTsSolveMs -and $null -ne $medianRustSolveMs -and $medianRustSolveMs -gt 0) {
  $medianTsSolveMs / $medianRustSolveMs
} else { $null }
$historicalReconstructionSpeedup = if ($null -ne $medianTsTotalMs -and $null -ne $medianRustTotalMs -and $medianRustTotalMs -gt 0) {
  $medianTsTotalMs / $medianRustTotalMs
} else { $null }
$syntheticDefault = $null
if (Test-Path -LiteralPath $phase8ReportPath -PathType Leaf) {
  $phase8Report = Get-Content -Raw -LiteralPath $phase8ReportPath | ConvertFrom-Json
  $syntheticDefault = @($phase8Report.solverResults | Where-Object numBins -eq $NumBins) | Select-Object -First 1
}

$validProfileCount = if ($null -ne $historySummary) { [int]$historySummary.validProfileCount } else { 0 }
$decision = if ($process.ExitCode -ne 0 -or -not $databaseUnchanged -or -not $journalFormatUnchanged) {
  'no-go'
} elseif ($validProfileCount -lt 10) {
  'insufficient-data'
} elseif ($NumBins -ne 48) {
  'non-primary-bin-observation-only'
} elseif ($failureTelemetry.Count -gt 0 -or $successTelemetry.Count -eq 0 -or $maxProfileDelta -gt 1e-8) {
  'no-go'
} elseif ($null -eq $historicalReconstructionSpeedup -or $historicalReconstructionSpeedup -lt 1.1) {
  'no-go'
} else {
  'go-primary-candidate'
}

$report = [ordered]@{
  schemaVersion = 1
  completedAt = (Get-Date).ToString('o')
  databaseFile = [IO.Path]::GetFileName($DatabasePath)
  databaseMode = 'read-only'
  databaseUnchanged = $databaseUnchanged
  journalFormatBefore = $beforeJournalFormat
  journalFormatAfter = $afterJournalFormat
  journalFormatUnchanged = $journalFormatUnchanged
  processExitCode = $process.ExitCode
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
  observation = [ordered]@{
    queriedSweepCount = if ($null -ne $historySummary) { $historySummary.queriedSweepCount } else { 0 }
    validProfileCount = $validProfileCount
    rejectedProfileCount = @($sweepEvents | Where-Object status -eq 'rejected').Count
    failedProfileCount = @($sweepEvents | Where-Object status -eq 'failed').Count
    bubbleWorkerCreateCount = if ($null -ne $historySummary) { $historySummary.bubbleWorkerCreateCount } else { 0 }
    shadowSuccessCount = $successTelemetry.Count
    shadowFailureCount = $failureTelemetry.Count
    maxAbsProfileDelta = $maxProfileDelta
    medianTsSolveMs = $medianTsSolveMs
    medianRustSolveMs = $medianRustSolveMs
    historicalSolverSpeedup = $historicalSolverSpeedup
    medianTsReconstructionMs = $medianTsTotalMs
    medianRustReconstructionMs = $medianRustTotalMs
    historicalReconstructionSpeedup = $historicalReconstructionSpeedup
    syntheticEndToEndSpeedup = if ($null -ne $syntheticDefault) { $syntheticDefault.endToEnd.medianSpeedup } else { $null }
  }
  decision = $decision
  dataShortage = $validProfileCount -lt 10
  artifacts = [ordered]@{
    stdoutFile = [IO.Path]::GetFileName($stdoutPath)
    stderrFile = [IO.Path]::GetFileName($stderrPath)
  }
}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8

if (-not $databaseUnchanged -or -not $journalFormatUnchanged) {
  throw "历史数据库或 sidecar 在观测期间发生变化；报告: $reportPath"
}
if ($process.ExitCode -ne 0) {
  $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
  throw "Phase 8B 历史观测失败，code=$($process.ExitCode): $stderr"
}

Write-Output "phase-8b-report=$reportPath"
Write-Output "phase-8b-decision=$decision"
Write-Output "phase-8b-valid-profiles=$validProfileCount"
