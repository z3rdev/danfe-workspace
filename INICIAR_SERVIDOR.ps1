$ErrorActionPreference = "Stop"

$backend = Join-Path $PSScriptRoot "BACKEND"
Set-Location $backend

if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias..."
  npm install
}

Write-Host ""
Write-Host "Iniciando API DANFE em http://localhost:3000"
Write-Host "Para parar, pressione Ctrl+C nesta janela."
Write-Host ""
npm start
