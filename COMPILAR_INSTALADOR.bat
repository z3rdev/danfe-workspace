@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "BUILDER=%ROOT%SERVICOS\Build-InstallerPackage.ps1"

echo.
echo API DANFE - Compilador do instalador
echo ===================================
echo.

if not exist "%BUILDER%" (
  echo ERRO: compilador nao encontrado:
  echo %BUILDER%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%BUILDER%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Compilacao finalizada com erro. Veja as mensagens acima.
  pause
  exit /b %EXITCODE%
)

echo Compilacao concluida.
echo.
pause
