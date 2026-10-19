$ErrorActionPreference = "Continue"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$serviceName = "APIDANFEBACKEND"
$wrapper = Join-Path $PSScriptRoot "API-DANFE-BACKEND.exe"
$config = Join-Path $PSScriptRoot "API-DANFE-BACKEND.xml"
$frontTask = "API-DANFE-FRONT"

Write-Host "API DANFE - Status"
Write-Host "=================="
Write-Host ""

Write-Host "Servico nativo do backend:"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
  Write-Host "  Nome interno: $serviceName"
  Write-Host "  Nome exibido: API DANFE Backend"
  Write-Host "  Status      : $($service.Status)"
  Write-Host "  Inicio      : $($service.StartType)"
} else {
  Write-Host "  Nao instalado"
}
Write-Host "  Wrapper     : $(if (Test-Path -LiteralPath $wrapper) { 'presente' } else { 'ausente' })"
Write-Host "  Configuracao: $(if (Test-Path -LiteralPath $config) { 'presente' } else { 'sera gerada na instalacao' })"

Write-Host ""
Write-Host "Inicializacao do painel:"
$front = Get-ScheduledTask -TaskName $frontTask -ErrorAction SilentlyContinue
if ($front) {
  $info = Get-ScheduledTaskInfo -TaskName $frontTask -ErrorAction SilentlyContinue
  Write-Host "  $frontTask : instalado"
  if ($info) {
    Write-Host "  Ultima execucao: $($info.LastRunTime)"
    Write-Host "  Resultado      : $($info.LastTaskResult)"
  }
} else {
  Write-Host "  $frontTask : nao instalado por tarefa"
}

$startupDir = [Environment]::GetFolderPath("Startup")
$frontShortcut = Join-Path $startupDir "$frontTask.lnk"
if (Test-Path -LiteralPath $frontShortcut) {
  Write-Host "  Atalho Startup : $frontShortcut"
}

Write-Host ""
Write-Host "API:"
try {
  $health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3
  Write-Host "  Status: online"
  Write-Host "  URL   : http://localhost:3000"
  if ($health.pastaSaida) {
    Write-Host "  Saida : $($health.pastaSaida)"
  }
} catch {
  Write-Host "  Status: offline ou sem resposta"
}

Write-Host ""
Write-Host "Porta 3000:"
$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
  foreach ($connection in ($connections | Select-Object -Unique OwningProcess)) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
      Write-Host "  PID $($process.Id): $($process.ProcessName)"
    }
  }
} else {
  Write-Host "  Nenhum processo escutando."
}

Write-Host ""
Write-Host "Dependencias:"
$backend = Join-Path $root "BACKEND"
$nodeModules = Join-Path $backend "node_modules"
$nodePathFile = Join-Path $root "LOGS\node-path.txt"
$npmPathFile = Join-Path $root "LOGS\npm-path.txt"

Write-Host "  node_modules: $(if (Test-Path -LiteralPath $nodeModules) { 'instalado' } else { 'ausente' })"
if (Test-Path -LiteralPath $nodePathFile) {
  Write-Host "  node        : $((Get-Content -LiteralPath $nodePathFile -Raw).Trim())"
}
if (Test-Path -LiteralPath $npmPathFile) {
  Write-Host "  npm         : $((Get-Content -LiteralPath $npmPathFile -Raw).Trim())"
}

Write-Host ""
Write-Host "PM2: nao utilizado pelo instalador atual."
