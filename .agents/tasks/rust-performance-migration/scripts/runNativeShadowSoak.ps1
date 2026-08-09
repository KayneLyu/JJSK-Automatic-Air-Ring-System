param(
  [ValidateRange(1, 100)]
  [int]$Cycles = 3,
  [ValidateRange(1, 100)]
  [int]$LongCycles = 12
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '../../../..')
$tsxPath = Resolve-Path (Join-Path $repositoryRoot 'apps/AirRingSys/node_modules/.bin/tsx.cmd')
$runnerPath = 'packages/AirRingServer/algorithms/benchmarks/nativeShadowSoak.test.mts'
$requiredScenarios = @(
  'disabled-serial',
  'shadow-serial'
)
$probeScenarios = @(
  'shadow-concurrency-2',
  'shadow-concurrency-4'
)

Push-Location $repositoryRoot
try {
  foreach ($scenario in $requiredScenarios) {
    Write-Output "[Stage3Soak] 独立运行 $scenario"
    $env:RUST_SHADOW_SOAK_CYCLES = [string]$Cycles
    $env:RUST_SHADOW_SOAK_SCENARIOS = $scenario
    $env:RUST_SHADOW_SOAK_OUTPUT_VARIANT = $scenario
    & $tsxPath $runnerPath
    if ($LASTEXITCODE -ne 0) {
      throw "场景 $scenario 失败，exitCode=$LASTEXITCODE"
    }
  }

  Write-Output '[Stage3Soak] 独立运行 shadow-serial-60'
  $env:RUST_SHADOW_SOAK_CYCLES = [string]$LongCycles
  $env:RUST_SHADOW_SOAK_SCENARIOS = 'shadow-serial'
  $env:RUST_SHADOW_SOAK_OUTPUT_VARIANT = 'shadow-serial-60'
  & $tsxPath $runnerPath
  if ($LASTEXITCODE -ne 0) {
    throw "shadow-serial-60 失败，exitCode=$LASTEXITCODE"
  }

  $probeResults = @()
  foreach ($scenario in $probeScenarios) {
    Write-Output "[Stage3Soak] 非阻断并发探针 $scenario"
    $env:RUST_SHADOW_SOAK_CYCLES = [string]$Cycles
    $env:RUST_SHADOW_SOAK_SCENARIOS = $scenario
    $env:RUST_SHADOW_SOAK_OUTPUT_VARIANT = $scenario
    & $tsxPath $runnerPath
    $exitCode = $LASTEXITCODE
    $probeResults += [PSCustomObject]@{
      scenario = $scenario
      exitCode = $exitCode
      passed = $exitCode -eq 0
      outputVariant = if ($exitCode -eq 0) { $scenario } else { $null }
    }
    if ($exitCode -ne 0) {
      Write-Warning "并发探针 $scenario 失败，exitCode=$exitCode；当前串行生产拓扑验收继续"
    }
  }

  $probeOutput = Join-Path $PSScriptRoot 'outputs/native-shadow-soak.concurrency-probes.json'
  $probeJson = $probeResults | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText(
    $probeOutput,
    $probeJson,
    [System.Text.UTF8Encoding]::new($false)
  )

  node .agents/tasks/rust-performance-migration/scripts/aggregateNativeShadowSoak.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "聚合报告失败，exitCode=$LASTEXITCODE"
  }
} finally {
  Pop-Location
}
