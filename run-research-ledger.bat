@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js 18 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)
node server.js --open
pause
