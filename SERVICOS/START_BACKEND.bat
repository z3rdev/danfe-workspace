@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

set "LOGDIR=%ROOT%\LOGS"
set "LOGFILE=%LOGDIR%\backend-control.log"
set "ERRFILE=%LOGDIR%\backend-control.err.log"
set "SERVICEWRAPPER=%ROOT%\SERVICOS\API-DANFE-BACKEND.exe"
set "SERVICENAME=APIDANFEBACKEND"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

if not exist "%SERVICEWRAPPER%" (
  echo [%DATE% %TIME%] ERRO: servico nativo nao encontrado: %SERVICEWRAPPER%>> "%ERRFILE%"
  exit /b 1
)

powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "try { Start-Service -Name '%SERVICENAME%' -ErrorAction Stop; exit 0 } catch { Add-Content -LiteralPath '%ERRFILE%' -Value $_.Exception.Message; exit 1 }" >> "%LOGFILE%" 2>> "%ERRFILE%"
exit /b %ERRORLEVEL%
