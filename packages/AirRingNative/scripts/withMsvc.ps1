param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('test', 'build', 'clippy')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
  throw '未找到 vswhere.exe，请先安装 Visual Studio Build Tools C++ 工作负载。'
}

$installationPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installationPath) {
  throw '未找到 Visual Studio C++ x64 工具链。'
}

$vsDevCmd = Join-Path $installationPath 'Common7\Tools\VsDevCmd.bat'
$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargoCommand) {
  throw '未找到 Cargo。请安装 Rust 1.88+，并确保 cargo 已加入 PATH；版本管理工具不限。'
}
$cargo = $cargoCommand.Source

$packageRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $packageRoot 'Cargo.toml'

$command = switch ($Action) {
  'test' { '"{0}" test --manifest-path "{1}"' -f $cargo, $manifestPath }
  'clippy' { '"{0}" clippy --manifest-path "{1}" --all-targets -- -D warnings' -f $cargo, $manifestPath }
  'build' { '"{0}" build --release --manifest-path "{1}"' -f $cargo, $manifestPath }
}

$developerCommand = '"{0}" -no_logo -arch=x64 -host_arch=x64 && {1}' -f $vsDevCmd, $command
& $env:COMSPEC /d /s /c $developerCommand
$commandExitCode = $LASTEXITCODE
if ($commandExitCode -ne 0) {
  exit $commandExitCode
}

if ($Action -eq 'build') {
  $nativeDll = Join-Path $packageRoot 'target\release\air_ring_native.dll'
  $nodeAddon = Join-Path $packageRoot 'air-ring-native.win32-x64-msvc.node'
  if (-not (Test-Path -LiteralPath $nativeDll)) {
    throw "Cargo 构建成功，但未找到原生库: $nativeDll"
  }
  Copy-Item -LiteralPath $nativeDll -Destination $nodeAddon -Force
}

exit 0
