@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "STOPPER=%ROOT%SERVICOS\STOP_BACKEND.bat"

echo.
echo API DANFE - Parar backend agora
echo ===============================
echo.

if not exist "%STOPPER%" (
  echo ERRO: script de parada nao encontrado:
  echo %STOPPER%
  echo.
  pause
  exit /b 1
)

call "%STOPPER%"
echo.
pause
