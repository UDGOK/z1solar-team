# Extracts z1power-cms-COMPLETE.zip correctly on Windows, then verifies it.
#
# WHY THIS EXISTS
# Windows File Explorer's built-in "Extract All" mangles folder names containing
# square brackets (src\app\projects\[id]\), silently dropping files into the
# wrong folder - the financials page ends up overwriting the project detail
# page. PowerShell's Expand-Archive handles bracket paths correctly.
#
# WHAT CHANGED THIS ROUND
# This script used to check two hard-coded files against two hard-coded line
# counts (338 / 63). That had two problems: it missed the OTHER SEVEN bracket
# route files in this project, including the NextAuth handler, and it reported a
# false failure every time those two files were legitimately edited.
#
# It now checks every entry in FILE-MANIFEST.txt, which is regenerated whenever
# the project is packaged and therefore cannot go stale.
#
# HOW TO USE
#   1. Put this file in the same folder as z1power-cms-COMPLETE.zip
#   2. Right-click it -> "Run with PowerShell"
#      (or: open PowerShell here and run  .\EXTRACT-SAFELY.ps1 )

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip  = Join-Path $here "z1power-cms-COMPLETE.zip"
$dest = Join-Path $here "z1power-extracted"

if (-not (Test-Path -LiteralPath $zip)) {
  Write-Host "Can't find z1power-cms-COMPLETE.zip next to this script." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force

$proj     = Join-Path $dest "z1power-cms"
$manifest = Join-Path $proj "FILE-MANIFEST.txt"

if (-not (Test-Path -LiteralPath $manifest)) {
  Write-Host ""
  Write-Host "FILE-MANIFEST.txt is missing from the extracted project." -ForegroundColor Red
  Write-Host "Either the zip is incomplete or extraction failed. Do not use this copy."
  Read-Host "Press Enter to close"; exit 1
}

Write-Host ""
Write-Host "Checking bracket-route files against the manifest..." -ForegroundColor Cyan
Write-Host ""

$checked = 0
$bad     = 0

foreach ($line in Get-Content -LiteralPath $manifest) {
  if ($line -match '^\s*#' -or $line.Trim() -eq "") { continue }

  $parts = $line -split "`t", 2
  if ($parts.Count -lt 2) { continue }

  $expected = [int]$parts[0]
  $relative = $parts[1].Trim()
  # -LiteralPath everywhere below: without it PowerShell treats [id] as a
  # wildcard character class and matches nothing, which is the same class of
  # bug this script exists to catch.
  $full = Join-Path $proj ($relative -replace '/', '\')

  $checked++

  if (-not (Test-Path -LiteralPath $full)) {
    Write-Host ("  MISSING   {0}" -f $relative) -ForegroundColor Red
    $bad++
    continue
  }

  $actual = (Get-Content -LiteralPath $full | Measure-Object -Line).Lines

  if ($actual -eq $expected) {
    Write-Host ("  ok        {0}  ({1} lines)" -f $relative, $actual) -ForegroundColor DarkGray
  } else {
    Write-Host ("  WRONG     {0}  ({1} lines, expected {2})" -f $relative, $actual, $expected) -ForegroundColor Red
    $bad++
  }
}

Write-Host ""
if ($bad -eq 0) {
  Write-Host ("EXTRACTION CORRECT - all {0} bracket-route files match." -f $checked) -ForegroundColor Green
  Write-Host "Your clean project is at: $proj"
  Write-Host ""
  Write-Host "Next:"
  Write-Host "  1. Copy .git and .env from your old folder into it"
  Write-Host "  2. Rename it to z1solar-team, replacing the old folder"
  Write-Host "     (package.json must sit DIRECTLY inside z1solar-team, not nested)"
  Write-Host "  3. npm install"
  Write-Host "  4. npm test          <- new this round: 140 assertions, must pass"
  Write-Host "  5. npm run build"
  Write-Host "  6. npm run db:push   <- the schema changed this round"
} else {
  Write-Host ("EXTRACTION STILL WRONG - {0} of {1} files are bad." -f $bad, $checked) -ForegroundColor Red
  Write-Host "Do not use this copy, and do not push it." -ForegroundColor Red
  Write-Host ""
  Write-Host "If files are MISSING rather than the wrong length, the [bracket]"
  Write-Host "folders were mangled - that is the Explorer 'Extract All' bug."
}
Write-Host ""
Read-Host "Press Enter to close"
