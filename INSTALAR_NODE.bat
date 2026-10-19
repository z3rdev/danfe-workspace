@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
  wscript.exe "%~dp0SERVICOS\RUN_BAT_HIDDEN.vbs" "%~f0" %*
  exit /b 0
)
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "MSI=%ROOT%SERVICOS\node.msi"

echo.
echo API DANFE - Instalar Node.js
echo ===========================
echo.

if not exist "%MSI%" (
  echo ERRO: node.msi nao encontrado:
  echo %MSI%
  echo.
  pause
  exit /b 1
)

echo Abrindo instalador Node.js...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'msiexec.exe' -ArgumentList '/i ""%MSI%"" /passive /norestart' -Verb RunAs -Wait"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Instalacao do Node.js finalizada com erro.
  pause
  exit /b %EXITCODE%
)

echo Node.js instalado. Agora execute INSTALAR_DEPENDENCIAS.bat ou INSTALAR_SERVICOS.bat.
echo.
pause
