@echo off
REM Verifies bracket-route files against FILE-MANIFEST.txt.
REM
REM Run this from inside the project folder any time you suspect a bad
REM extraction - especially after unzipping on Windows, where File Explorer's
REM "Extract All" mangles [bracket] folder names and silently misplaces files.
REM
REM This used to hard-code two files and two line counts (338 / 63). It now
REM reads the generated manifest, so it covers every bracket route and never
REM reports a false failure just because a file was legitimately edited.

setlocal enabledelayedexpansion

if not exist "FILE-MANIFEST.txt" (
  echo FILE-MANIFEST.txt not found.
  echo Run this from the project root - the folder containing package.json.
  pause
  exit /b 1
)

set CHECKED=0
set BAD=0

echo.
echo Checking bracket-route files...
echo.

for /f "usebackq tokens=1,2 delims=	" %%A in ("FILE-MANIFEST.txt") do (
  set "FIRST=%%A"
  if not "!FIRST:~0,1!"=="#" (
    if not "%%B"=="" (
      set /a CHECKED+=1
      set "REL=%%B"
      set "WIN=!REL:/=\!"
      if not exist "!WIN!" (
        echo   MISSING   !REL!
        set /a BAD+=1
      ) else (
        set COUNT=0
        for /f %%C in ('type "!WIN!" ^| find /c /v ""') do set COUNT=%%C
        if "!COUNT!"=="%%A" (
          echo   ok        !REL!  ^(!COUNT! lines^)
        ) else (
          echo   WRONG     !REL!  ^(!COUNT! lines, expected %%A^)
          set /a BAD+=1
        )
      )
    )
  )
)

echo.
if "%BAD%"=="0" (
  echo ALL %CHECKED% BRACKET-ROUTE FILES CORRECT.
  echo Safe to build and push.
) else (
  echo %BAD% OF %CHECKED% FILES ARE WRONG.
  echo Do NOT build or push. Re-extract with EXTRACT-SAFELY.ps1.
)
echo.
pause
