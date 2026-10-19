@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "STATUS=%ROOT%SERVICOS\Status-StartupTasks.ps1"
set "LOGDIR=%ROOT%LOGS"
set "REPORT=%LOGDIR%status-report.txt"

echo.
echo API DANFE - Status
echo ==================
echo.

if not exist "%STATUS%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path '%LOGDIR%' | Out-Null; Set-Content -LiteralPath '%REPORT%' -Value 'ERRO: script de status nao encontrado: %STATUS%' -Encoding UTF8"
  start "" notepad.exe "%REPORT%"
  exit /b 1
)

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%STATUS%" > "%REPORT%" 2>&1
start "" notepad.exe "%REPORT%"
