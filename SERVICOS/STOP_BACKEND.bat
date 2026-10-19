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
set "PM2PATHFILE=%LOGDIR%\pm2-path.txt"
set "PM2STOP=%ROOT%\SERVICOS\PM2_STOP_HIDDEN.vbs"
set "PORT=3000"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

echo [%DATE% %TIME%] Solicitando parada do backend na porta %PORT%...>> "%LOGFILE%"
if not exist "%PM2PATHFILE%" goto STOP_BY_PORT
if not exist "%PM2STOP%" goto STOP_BY_PORT
wscript.exe "%PM2STOP%"
exit /b %ERRORLEVEL%

:STOP_BY_PORT
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if (-not $conns) { Write-Host 'Nenhum processo escutando na porta %PORT%.'; exit 0 }; $processIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $processIds) { Write-Host ('Parando PID ' + $processId); Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }"
exit /b %ERRORLEVEL%
