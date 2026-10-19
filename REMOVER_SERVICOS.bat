@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "UNINSTALLER=%ROOT%SERVICOS\Uninstall-StartupTasks.ps1"

net session >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  wscript.exe "%ROOT%SERVICOS\ELEVATE_BAT_HIDDEN.vbs" "%~f0"
  exit /b 0
)

echo.
echo API DANFE - Remover inicializacao
echo =================================
echo.

if not exist "%UNINSTALLER%" (
  echo ERRO: removedor nao encontrado:
  echo %UNINSTALLER%
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALLER%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Remocao finalizada com erro. Veja as mensagens acima.
  pause
  exit /b %EXITCODE%
)

echo Remocao concluida.
echo.
pause
