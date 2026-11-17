#!/usr/bin/env pwsh
#
# 开工基线：依赖同步 + 全部门禁。退出码 0 才算能开工。
#
# 用法：
#   ./init.ps1                 依赖同步 + 六道门（type / lint / test / build / artifacts / compat）
#   ./init.ps1 -SkipInstall    跳过依赖同步
#   ./init.ps1 -SkipBuild      只做静态门，跳过构建、产物检查与内核兼容扫描（后两者都要读 dist）
#
# 基线红了先修基线，不要在坏起点上叠新功能。

param(
  [switch]$SkipInstall,
  [switch]$SkipBuild
)

Set-Location $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Write-Gate {
  param([string]$Label)
  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Cyan
}

function Test-Gate {
  param([string]$Label)
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    [FAIL] exit $LASTEXITCODE" -ForegroundColor Red
    $failures.Add($Label)
    return $false
  }
  Write-Host "    [OK]" -ForegroundColor Green
  return $true
}

Write-Host "==> 仓库根: $PWD"

# ---------------------------------------------------------------- 依赖
if (-not $SkipInstall) {
  if (Test-Path 'node_modules' -PathType Container) {
    Write-Host "==> 依赖已存在，跳过 pnpm install（要强制重装请手动跑 pnpm install）" -ForegroundColor DarkGray
  } else {
    Write-Gate '依赖同步 (pnpm install)'
    pnpm install
    [void](Test-Gate '依赖同步')
  }
}

if (-not (Test-Path 'node_modules' -PathType Container)) {
  Write-Host "[FAIL] node_modules 不存在，后续门无法运行" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------- 静态门
Write-Gate '类型检查 (tsc)'
pnpm type
[void](Test-Gate '类型检查')

Write-Gate '静态检查 (oxlint)'
pnpm lint
[void](Test-Gate '静态检查')

Write-Gate '单元测试 (node:test)'
pnpm test
[void](Test-Gate '单元测试')

# ---------------------------------------------------------------- 构建门
if ($SkipBuild) {
  Write-Host ""
  Write-Host "==> 跳过构建与产物检查 (-SkipBuild)" -ForegroundColor DarkGray
} else {
  Write-Gate '生产构建 (rspack)'
  pnpm build
  $built = Test-Gate '生产构建'

  if ($built) {
    Write-Gate '产物齐全 (dist)'
    $missing = @()
    $artifactsOk = $false
    if (-not (Test-Path 'dist/index.html' -PathType Leaf)) { $missing += 'dist/index.html' }
    if (-not (Test-Path 'dist/LICENSE' -PathType Leaf)) { $missing += 'dist/LICENSE（上游许可须随产物分发）' }
    if (-not (Get-ChildItem 'dist/static/js' -Filter '*.js' -File -ErrorAction SilentlyContinue)) {
      $missing += 'dist/static/js/*.js'
    }
    if (-not (Get-ChildItem 'dist/static/css' -Filter '*.css' -File -ErrorAction SilentlyContinue)) {
      $missing += 'dist/static/css/*.css'
    }
    if ($missing.Count -gt 0) {
      Write-Host "    [FAIL] 缺少: $($missing -join ', ')" -ForegroundColor Red
      $failures.Add('产物齐全')
    } else {
      Write-Host "    [OK]" -ForegroundColor Green
      $artifactsOk = $true
    }

    # 产物齐了才有得扫：scan 读的是 dist 里的 CSS/JS，扫的是「有内核门槛但没兜底」的写法
    if ($artifactsOk) {
      Write-Gate '内核兼容 (scan-compat)'
      node tools/scan-compat.mjs
      if (-not (Test-Gate '内核兼容')) {
        Write-Host '    目标内核 Chromium 93。上面每条都写了「哪个文件、什么问题、怎么修」：' -ForegroundColor Yellow
        Write-Host '    能兜底就兜底（dvh 前加一行 vh，JS 新 API 加特性探测）；确实要放行的' -ForegroundColor Yellow
        Write-Host '    写进 tools/scan-compat.mjs 的 EXEMPTIONS，并在提交信息里写理由。' -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host "    [跳过] 构建失败，产物检查与内核兼容扫描无意义" -ForegroundColor Yellow
  }
}

# ---------------------------------------------------------------- 汇总
Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host "基线全绿。下一步：读 feature_list.json 选一个未完成功能，一次只做一个。" -ForegroundColor Green
  exit 0
}

Write-Host "基线红了：$($failures -join ' | ')" -ForegroundColor Red
Write-Host "先修基线，不要在坏起点上叠新功能。" -ForegroundColor Red
exit 1
