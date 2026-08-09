[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory,

  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-NormalizedChildPath {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  if ([System.IO.Path]::IsPathRooted($RelativePath) -or $RelativePath.Contains(':')) {
    throw "内容清单包含非法绝对路径: $RelativePath"
  }

  $segments = $RelativePath -split '[/\\]'
  if ($segments.Count -eq 0 -or $segments -contains '..' -or $segments -contains '.') {
    throw "内容清单包含非法路径段: $RelativePath"
  }

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $childPath = [System.IO.Path]::GetFullPath(
    [System.IO.Path]::Combine($rootPath, ($segments -join [System.IO.Path]::DirectorySeparatorChar))
  )
  $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  if (-not $childPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "内容路径逃逸 payload 根目录: $RelativePath"
  }
  return $childPath
}

function Get-Sha256 {
  param([Parameter(Mandatory = $true)][string]$FilePath)

  $stream = [System.IO.File]::OpenRead($FilePath)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Test-ContentFiles {
  param(
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)]$ExpectedFiles
  )

  $rootPath = [System.IO.Path]::GetFullPath($PayloadRoot).TrimEnd('\', '/')
  $allItems = @(Get-ChildItem -LiteralPath $rootPath -Recurse -Force)
  foreach ($item in $allItems) {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "内容 payload 不允许重解析点: $($item.FullName)"
    }
  }
  $actualFiles = @(
    $allItems | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
      if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "内容 payload 不允许重解析点: $($_.FullName)"
      }
      $_.FullName.Substring($rootPath.Length + 1).Replace('\', '/')
    }
  )
  $expectedPaths = @($ExpectedFiles | ForEach-Object { [string]$_.path })

  $actualDiff = Compare-Object -ReferenceObject $expectedPaths -DifferenceObject $actualFiles
  if ($null -ne $actualDiff) {
    throw "内容文件集合与清单不一致: $($actualDiff | ConvertTo-Json -Compress)"
  }

  foreach ($entry in $ExpectedFiles) {
    $relativePath = [string]$entry.path
    $filePath = Get-NormalizedChildPath -Root $rootPath -RelativePath $relativePath
    $file = Get-Item -LiteralPath $filePath
    if ([long]$file.Length -ne [long]$entry.bytes) {
      throw "内容文件大小不一致: $relativePath"
    }
    $actualHash = Get-Sha256 -FilePath $filePath
    if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
      throw "内容文件 SHA-256 不一致: $relativePath"
    }
  }
}

$packageRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$manifestPath = Join-Path $packageRoot 'content-manifest.json'
$payloadRoot = Join-Path $packageRoot 'payload'
$runtimeProbePath = Join-Path $packageRoot 'content-runtime-probe.mjs'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "缺少内容清单: $manifestPath"
}
if (-not (Test-Path -LiteralPath $runtimeProbePath -PathType Leaf)) {
  throw "缺少运行时探针: $runtimeProbePath"
}
if (-not (Test-Path -LiteralPath (Join-Path $payloadRoot 'resources') -PathType Container)) {
  throw "缺少 payload/resources"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ([int]$manifest.schemaVersion -ne 1 -or [string]$manifest.product -ne 'JJSK') {
  throw '不支持的内容清单格式或产品标识'
}

$installPath = (Resolve-Path -LiteralPath $InstallDirectory).Path.TrimEnd('\', '/')
$executablePath = Join-Path $installPath 'JJSK.exe'
$resourcesPath = Join-Path $installPath 'resources'
if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
  throw "目标目录缺少 JJSK.exe: $installPath"
}
if (-not (Test-Path -LiteralPath $resourcesPath -PathType Container)) {
  throw "目标目录缺少 resources: $installPath"
}

$running = @(Get-Process -Name 'JJSK' -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
  throw '检测到 JJSK 正在运行；请完全退出应用后再更新内容'
}

if ($runtimeProbePath.Contains('"')) {
  throw '运行时探针路径包含不支持的引号字符'
}
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $executablePath
$startInfo.Arguments = '"' + $runtimeProbePath + '"'
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
$probeProcess = New-Object System.Diagnostics.Process
$probeProcess.StartInfo = $startInfo
try {
  if (-not $probeProcess.Start()) {
    throw '无法启动目标 Electron 运行时探针'
  }
  $probeStdout = $probeProcess.StandardOutput.ReadToEnd()
  $probeStderr = $probeProcess.StandardError.ReadToEnd()
  $probeProcess.WaitForExit()
  $probeLines = @(($probeStdout + [Environment]::NewLine + $probeStderr) -split '\r?\n')
  if ($probeProcess.ExitCode -ne 0) {
    throw "目标 Electron 运行时探测失败: $($probeLines -join [Environment]::NewLine)"
  }
} finally {
  $probeProcess.Dispose()
}

$probeLine = $probeLines |
  Where-Object { ([string]$_).StartsWith('[ContentRuntimeProbe] ') } |
  Select-Object -First 1
if ($null -eq $probeLine) {
  throw '目标 Electron 运行时未输出结构化探测结果'
}
$runtime = ([string]$probeLine).Substring('[ContentRuntimeProbe] '.Length) | ConvertFrom-Json
$required = $manifest.requiredRuntime
$compatibilityFields = @('platform', 'arch', 'electron', 'modules')
foreach ($field in $compatibilityFields) {
  if ([string]$runtime.$field -ne [string]$required.$field) {
    throw "运行时不兼容: $field 需要 $($required.$field)，目标为 $($runtime.$field)"
  }
}

Test-ContentFiles -PayloadRoot $payloadRoot -ExpectedFiles $manifest.files

if ($VerifyOnly) {
  [ordered]@{
    ok = $true
    action = 'verify-only'
    contentVersion = [string]$manifest.contentVersion
    installDirectory = $installPath
    runtime = $runtime
    fileCount = @($manifest.files).Count
  } | ConvertTo-Json -Compress
  return
}

$safeVersion = ([string]$manifest.contentVersion) -replace '[^A-Za-z0-9._-]', '_'
$token = [Guid]::NewGuid().ToString('N')
$stagePath = Join-Path $installPath ".jjsk-content-stage-$token"
$stageResourcesPath = Join-Path $stagePath 'resources'
$backupPath = Join-Path $installPath "resources.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$safeVersion"
$targetMoved = $false

try {
  New-Item -ItemType Directory -Path $stageResourcesPath | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $payloadRoot 'resources') -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $stageResourcesPath -Recurse -Force
  }
  Test-ContentFiles -PayloadRoot $stagePath -ExpectedFiles $manifest.files

  Move-Item -LiteralPath $resourcesPath -Destination $backupPath
  $targetMoved = $true
  try {
    Move-Item -LiteralPath $stageResourcesPath -Destination $resourcesPath
  } catch {
    if (-not (Test-Path -LiteralPath $resourcesPath) -and (Test-Path -LiteralPath $backupPath)) {
      Move-Item -LiteralPath $backupPath -Destination $resourcesPath
      $targetMoved = $false
    }
    throw
  }
} catch {
  if ($targetMoved -and -not (Test-Path -LiteralPath $resourcesPath) -and (Test-Path -LiteralPath $backupPath)) {
    Move-Item -LiteralPath $backupPath -Destination $resourcesPath
  }
  throw
} finally {
  if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
  }
}

[ordered]@{
  ok = $true
  action = 'applied'
  contentVersion = [string]$manifest.contentVersion
  installDirectory = $installPath
  backupDirectory = $backupPath
  runtime = $runtime
  fileCount = @($manifest.files).Count
} | ConvertTo-Json -Compress
