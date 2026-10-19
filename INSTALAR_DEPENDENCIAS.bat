@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "INSTALLER=%ROOT%SERVICOS\Install-Dependencies.ps1"

echo.
echo API DANFE - Instalar dependencias
echo =================================
echo.

if not exist "%INSTALLER%" (
  echo ERRO: instalador de dependencias nao encontrado:
  echo %INSTALLER%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%" -Force
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Instalacao de dependencias finalizada com erro. Veja as mensagens acima.
  pause
  exit /b %EXITCODE%
)

echo Dependencias instaladas.
echo.
pause
