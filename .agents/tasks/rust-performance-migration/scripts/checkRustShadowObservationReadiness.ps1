[CmdletBinding()]
param(
  [string]$OutputPath = (Join-Path $PSScriptRoot 'outputs/stage-6-preflight.json'),
  [string]$ObservationLogPath = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'JJSK\logs\rust-shadow.ndjson')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))
$resolvedOutputPath = if ([IO.Path]::IsPathFullyQualified($OutputPath)) {
  [IO.Path]::GetFullPath($OutputPath)
} else {
  [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputPath))
}
$observationLogPathWasAbsolute = [IO.Path]::IsPathFullyQualified($ObservationLogPath)
$resolvedObservationLogPath = if ($observationLogPathWasAbsolute) {
  [IO.Path]::GetFullPath($ObservationLogPath)
} else {
  [IO.Path]::GetFullPath((Join-Path $repositoryRoot $ObservationLogPath))
}

function Get-MiseToolVersion {
  param([Parameter(Mandatory)][string]$Command)

  $commandOutput = @(& mise exec -c $Command 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "mise 命令失败: $Command`n$($commandOutput -join [Environment]::NewLine)"
  }
  return [string]($commandOutput | Select-Object -Last 1)
}

function Get-ArtifactStatus {
  param([Parameter(Mandatory)][string]$RelativePath)

  $absolutePath = Join-Path $repositoryRoot $RelativePath
  $item = Get-Item -LiteralPath $absolutePath -ErrorAction SilentlyContinue
  return [ordered]@{
    path = $RelativePath
    exists = [bool]$item
    lengthBytes = if ($item) { $item.Length } else { 0 }
    lastWriteTime = if ($item) { $item.LastWriteTime.ToString('o') } else { $null }
    sha256 = if ($item) { (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash } else { $null }
  }
}

Push-Location $repositoryRoot
try {
  $toolVersions = [ordered]@{
    node = (Get-MiseToolVersion -Command 'node --version').Trim()
    pnpm = (Get-MiseToolVersion -Command 'pnpm --version').Trim()
    rust = (Get-MiseToolVersion -Command 'rustc --version').Trim()
  }
} finally {
  Pop-Location
}

$artifacts = @(
  Get-ArtifactStatus -RelativePath 'packages/AirRingNative/air-ring-native.win32-x64-msvc.node'
  Get-ArtifactStatus -RelativePath 'apps/AirRingSys/dist-electron/calibrationWorker.js'
  Get-ArtifactStatus -RelativePath 'apps/AirRingSys/dist-electron/main.js'
)

$activeApplicationProcesses = @(
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -match 'AirRing|electron' } |
    ForEach-Object {
      [ordered]@{
        id = $_.Id
        processName = $_.ProcessName
        startTime = try { $_.StartTime.ToString('o') } catch { $null }
      }
    }
)

$shadowEnvironmentNames = @(
  'AIR_RING_RUST_SHADOW'
  'AIR_RING_RUST_SHADOW_THREADS'
  'AIR_RING_RUST_NATIVE_PATH'
  'AIR_RING_RUST_SHADOW_EVERY_N'
  'AIR_RING_RUST_SHADOW_MAX_RUNS'
  'AIR_RING_RUST_SHADOW_MAX_CONSECUTIVE_FAILURES'
  'AIR_RING_RUST_SHADOW_MAX_DELTA_DEG'
  'AIR_RING_RUST_SHADOW_LOG_PATH'
)
$shadowEnvironment = @(
  $shadowEnvironmentNames | ForEach-Object {
    [ordered]@{
      name = $_
      isSet = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
    }
  }
)

$existingObservationLog = Get-Item -LiteralPath $resolvedObservationLogPath -ErrorAction SilentlyContinue
$gates = [ordered]@{
  miseToolVersionsMatch = (
    $toolVersions.node -eq 'v24.18.0' -and
    $toolVersions.pnpm -eq '10.18.3' -and
    $toolVersions.rust -match '^rustc 1\.88\.0\b'
  )
  requiredArtifactsPresent = -not ($artifacts.exists -contains $false)
  noActiveApplicationProcess = $activeApplicationProcesses.Count -eq 0
  shadowEnvironmentClean = -not ($shadowEnvironment.isSet -contains $true)
  observationLogPathAbsolute = $observationLogPathWasAbsolute
}
$technicalReady = -not ($gates.Values -contains $false)

$report = [ordered]@{
  schemaVersion = 1
  generatedAt = (Get-Date).ToString('o')
  technicalReadyForOperatorConfirmation = $technicalReady
  toolVersions = $toolVersions
  artifacts = $artifacts
  activeApplicationProcesses = $activeApplicationProcesses
  shadowEnvironment = $shadowEnvironment
  observationLog = [ordered]@{
    path = $resolvedObservationLogPath
    exists = [bool]$existingObservationLog
    lengthBytes = if ($existingObservationLog) { $existingObservationLog.Length } else { 0 }
    lastWriteTime = if ($existingObservationLog) { $existingObservationLog.LastWriteTime.ToString('o') } else { $null }
  }
  deviceRisk = [ordered]@{
    applicationStartupAutoConnectsDevices = $true
    manualOperatorConfirmationRequired = $true
    evidence = @(
      'apps/AirRingSys/electron/main.ts:initMotionControl'
      'apps/AirRingSys/electron/adbox.ts:initADBox'
      'apps/AirRingSys/electron/adbox.ts:getUpperRotationConnection().connect'
    )
  }
  gates = $gates
}

$outputDirectory = Split-Path -Parent $resolvedOutputPath
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8

Write-Output "阶段 6 技术预检报告: $resolvedOutputPath"
Write-Output "technicalReadyForOperatorConfirmation=$technicalReady"
if (-not $technicalReady) {
  $failedGates = @($gates.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
  throw "阶段 6 技术预检未通过: $($failedGates -join ', ')"
}
