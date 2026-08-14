# Extracts z1power-cms-COMPLETE.zip correctly on Windows.
#
# Why this exists: Windows File Explorer's built-in "Extract All" mangles
# folder names containing square brackets (like src\app\projects\[id]\), which
# silently drops files into the wrong folder — the financials page ends up
# overwriting the project detail page. PowerShell's Expand-Archive handles
# bracket paths correctly.
#
# HOW TO USE:
#   1. Put this file in the same folder as z1power-cms-COMPLETE.zip
#   2. Right-click it -> "Run with PowerShell"
#      (or: open PowerShell here and run  .\EXTRACT-SAFELY.ps1 )

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip  = Join-Path $here "z1power-cms-COMPLETE.zip"
$dest = Join-Path $here "z1power-extracted"

if (-not (Test-Path $zip)) {
  Write-Host "Can't find z1power-cms-COMPLETE.zip next to this script." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force

$proj = Join-Path $dest "z1power-cms"
$detail = Join-Path $proj "src\app\projects\[id]\page.tsx"
$fin    = Join-Path $proj "src\app\projects\[id]\financials\page.tsx"

$d = (Get-Content -LiteralPath $detail | Measure-Object -Line).Lines
$f = (Get-Content -LiteralPath $fin    | Measure-Object -Line).Lines

Write-Host ""
Write-Host "project detail page : $d lines (expected 329)"
Write-Host "financials page     : $f lines (expected 63)"
Write-Host ""

if ($d -eq 329 -and $f -eq 63) {
  Write-Host "EXTRACTION CORRECT." -ForegroundColor Green
  Write-Host "Your clean project is at: $proj"
  Write-Host ""
  Write-Host "Next: copy .git and .env from your old folder into it, rename it"
  Write-Host "to z1solar-team, then run npm install / npm run build."
} else {
  Write-Host "EXTRACTION STILL WRONG - do not use this copy." -ForegroundColor Red
}
Write-Host ""
Read-Host "Press Enter to close"
