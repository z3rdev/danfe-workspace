@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions

set "ROOT=%~dp0"
set "DEPS=%ROOT%SERVICOS\Install-Dependencies.ps1"
set "SERVICE=%ROOT%SERVICOS\Install-NativeService.ps1"

net session >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  wscript.exe "%ROOT%SERVICOS\ELEVATE_BAT_HIDDEN.vbs" "%~f0"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%DEPS%" -Quiet
if not "%ERRORLEVEL%"=="0" exit /b %ERRORLEVEL%

powershell -NoProfile -ExecutionPolicy Bypass -File "%SERVICE%" -Quiet
exit /b %ERRORLEVEL%
