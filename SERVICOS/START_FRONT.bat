@echo off
if /I not "%DANFE_HIDDEN%"=="1" (
    wscript.exe "%~dp0START_FRONT_HIDDEN.vbs"
    exit /b 0
)

setlocal EnableExtensions

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"

set "LOGDIR=%ROOT%\LOGS"
set "LOGFILE=%LOGDIR%\front-service.log"
set "NODEPATHFILE=%LOGDIR%\node-path.txt"
set "URL=http://localhost:3000"
set "HEALTH=http://localhost:3000/api/health"

if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

if not exist "%NODEPATHFILE%" exit /b 1
set /p "NODEEXE="<"%NODEPATHFILE%"
if not exist "%NODEEXE%" exit /b 1

echo [%DATE% %TIME%] Aguardando API para abrir painel...>> "%LOGFILE%"

"%NODEEXE%" -e "const u='%HEALTH%';let n=0;async function check(){try{const r=await fetch(u,{signal:AbortSignal.timeout(2000)});if(r.ok){console.log('ok');process.exit(0)}}catch{}if(++n>=60)process.exit(1);setTimeout(check,2000)}check()" >nul 2>nul

if errorlevel 1 (
    echo [%DATE% %TIME%] API nao respondeu no tempo esperado. Abrindo painel mesmo assim.>> "%LOGFILE%"
)

echo [%DATE% %TIME%] Abrindo %URL%>> "%LOGFILE%"
start "" "%URL%"
exit /b 0
