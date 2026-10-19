@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "INSTALLER=%ROOT%SERVICOS\Install-StartupTasks.ps1"
set "PROGRESS=%ROOT%SERVICOS\Install-Progress.ps1"

net session >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  wscript.exe "%~dp0SERVICOS\ELEVATE_BAT_HIDDEN.vbs" "%~f0"
  exit /b 0
)

echo.
echo API DANFE - Instalador administrativo
echo ====================================
echo.

if not exist "%INSTALLER%" (
  exit /b 1
)

if not exist "%PROGRESS%" (
  exit /b 1
)

powershell -NoLogo -NoProfile -WindowStyle Hidden -STA -ExecutionPolicy Bypass -File "%PROGRESS%"
exit /b %ERRORLEVEL%
