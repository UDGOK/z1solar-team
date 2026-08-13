@echo off
REM Verifies the two files that keep getting mixed up during manual copy/paste.
REM Run this from inside your z1solar-team folder AFTER copying the new files,
REM BEFORE running npm run build or git push.

setlocal enabledelayedexpansion
set FAIL=0

echo Checking src\app\projects\[id]\page.tsx ...
for /f %%A in ('find /c /v "" ^< "src\app\projects\[id]\page.tsx"') do set LINES1=%%A
if "%LINES1%"=="328" (
  echo   OK - 328 lines, this is the project detail page
) else (
  echo   *** WRONG - found %LINES1% lines, expected 328 ***
  echo   *** This file should be the FULL project page, not financials! ***
  set FAIL=1
)

echo.
echo Checking src\app\projects\[id]\financials\page.tsx ...
for /f %%A in ('find /c /v "" ^< "src\app\projects\[id]\financials\page.tsx"') do set LINES2=%%A
if "%LINES2%"=="62" (
  echo   OK - 62 lines, this is the financials page
) else (
  echo   *** WRONG - found %LINES2% lines, expected 62 ***
  set FAIL=1
)

echo.
if "%FAIL%"=="1" (
  echo ============================================
  echo  FILES ARE MIXED UP - DO NOT BUILD OR PUSH YET
  echo  Go back to the two individual files provided,
  echo  double check you renamed and placed each one
  echo  into the CORRECT folder, then run this again.
  echo ============================================
  exit /b 1
) else (
  echo ============================================
  echo  Both files verified correct. Safe to continue:
  echo    npm install
  echo    npm run build
  echo    npm run db:push
  echo    npm run db:seed
  echo    git add -A
  echo    git commit -m "Update"
  echo    git push origin main
  echo ============================================
  exit /b 0
)
