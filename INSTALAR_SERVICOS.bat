@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "INSTALLER=%ROOT%INSTALAR_SERVICOS_ADMIN.bat"

echo.
echo API DANFE - Instalador de inicializacao
echo ======================================
echo.

if not exist "%INSTALLER%" (
  echo ERRO: instalador nao encontrado:
  echo %INSTALLER%
  echo.
  pause
  exit /b 1
)

call "%INSTALLER%"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Instalacao finalizada com erro. Veja as mensagens acima.
  pause
  exit /b %EXITCODE%
)

echo Instalacao concluida.
echo O backend sobe como servico nativo do Windows.
echo O painel abre no navegador quando a API estiver pronta.
echo.
pause
