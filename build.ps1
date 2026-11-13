# 星匣 StarBox · 构建脚本
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\build.ps1
#   powershell -ExecutionPolicy Bypass -File .\build.ps1 -MingwDir "C:\mingw64\bin" -TargetDir "C:\starbox-build"
#
# 为什么需要这个脚本：
# 1) windows-gnu 工具链需要 MinGW 的 gcc 参与链接；
# 2) 工程路径含非 ASCII 字符（例如中文目录）时，MinGW 的 windres 读不到
#    src-tauri\icons\icon.ico（报 "can't open icon file ... Invalid argument"），
#    链接阶段也会读错临时对象路径。
#    解决办法：把图标复制到纯 ASCII 目录，再用 --config 覆盖 bundle.icon，
#    同时把 cargo 的 target 目录固定到纯 ASCII 路径。
#
# 因此 TargetDir 和 MingwDir 必须是纯 ASCII 路径；默认分别是
# %USERPROFILE%\starbox-build 与自动探测到的 MinGW，可用参数或环境变量覆盖：
#   STARBOX_TARGET_DIR / STARBOX_MINGW
#
# 产物：
#   <TargetDir>\release\starbox.exe                          便携版（前端已内嵌）
#   <TargetDir>\release\bundle\nsis\StarBox_0.1.0_x64-setup.exe  安装包

param(
  [string]$MingwDir = $env:STARBOX_MINGW,
  [string]$TargetDir = $env:STARBOX_TARGET_DIR,
  [string]$CargoBin = (Join-Path $env:USERPROFILE ".cargo\bin")
)

$ErrorActionPreference = "Stop"

function Test-Ascii([string]$s) {
  return -not ($s -match '[^\x00-\x7F]')
}

# 自动探测 MinGW：先看 PATH，再看几个常见安装位置
if (-not $MingwDir) {
  $gcc = Get-Command gcc.exe -ErrorAction SilentlyContinue
  if ($gcc) {
    $MingwDir = Split-Path $gcc.Source -Parent
  } else {
    foreach ($cand in @(
        "C:\mingw64\bin",
        "C:\msys64\mingw64\bin",
        (Join-Path $env:ProgramFiles "mingw64\bin")
      )) {
      if (Test-Path (Join-Path $cand "gcc.exe")) { $MingwDir = $cand; break }
    }
  }
}

if (-not $TargetDir) {
  $TargetDir = Join-Path $env:USERPROFILE "starbox-build"
}

$iconDir = Join-Path $TargetDir "icons"
$overrideConfig = Join-Path $TargetDir "build-config.json"

if (-not (Test-Path (Join-Path $CargoBin "cargo.exe"))) {
  throw "找不到 cargo：$CargoBin。请先安装 Rust（x86_64-pc-windows-gnu）。"
}
if (-not $MingwDir -or -not (Test-Path (Join-Path $MingwDir "gcc.exe"))) {
  throw "找不到 MinGW gcc。请用 -MingwDir 指定包含 gcc.exe 的目录（例如 C:\mingw64\bin）。"
}
if (-not (Test-Ascii $TargetDir)) {
  throw "TargetDir 必须是纯 ASCII 路径（当前：$TargetDir）。MinGW 在非 ASCII 路径下会读错图标和对象文件。"
}
if (-not (Test-Ascii $MingwDir)) {
  throw "MingwDir 必须是纯 ASCII 路径（当前：$MingwDir）。"
}

$env:Path = "$CargoBin;$MingwDir;$env:Path"
$env:CARGO_TARGET_DIR = $TargetDir

Push-Location $PSScriptRoot
try {
  Write-Host "==> 准备 ASCII 路径的图标与配置覆盖" -ForegroundColor Cyan
  New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
  Copy-Item (Join-Path $PSScriptRoot "src-tauri\icons\*") $iconDir -Force
  # 反斜杠要转义成 JSON 的 /，避免路径里的 \i 之类被当成转义序列
  $rel = $iconDir.Replace('\', '/')
  $json = @"
{
  "bundle": {
    "icon": [
      "$rel/32x32.png",
      "$rel/128x128.png",
      "$rel/128x128@2x.png",
      "$rel/icon.ico"
    ]
  }
}
"@
  Set-Content -Path $overrideConfig -Value $json -Encoding UTF8

  Write-Host "==> 类型检查 + 前端构建" -ForegroundColor Cyan
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "前端构建失败（exit $LASTEXITCODE）" }

  Write-Host "==> 打包 Tauri 应用（release + NSIS）" -ForegroundColor Cyan
  npx tauri build --config $overrideConfig
  if ($LASTEXITCODE -ne 0) { throw "Tauri 打包失败（exit $LASTEXITCODE）" }

  $exe = Join-Path $TargetDir "release\starbox.exe"
  $setup = Join-Path $TargetDir "release\bundle\nsis"
  Write-Host ""
  Write-Host "完成：" -ForegroundColor Green
  if (Test-Path $exe) {
    $mb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host "  便携版 exe: $exe ($mb MB)"
  }
  if (Test-Path $setup) {
    Get-ChildItem $setup -Filter "*.exe" | ForEach-Object {
      $mb = [math]::Round($_.Length / 1MB, 1)
      Write-Host "  安装包: $($_.FullName) ($mb MB)"
    }
  }
} finally {
  Pop-Location
}
