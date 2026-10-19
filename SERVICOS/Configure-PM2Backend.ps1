param(
  [switch] $Quiet
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backend = Join-Path $root "BACKEND"
$logDir = Join-Path $root "LOGS"
$nodePathFile = Join-Path $logDir "node-path.txt"
$pm2PathFile = Join-Path $logDir "pm2-path.txt"
$pm2Out = Join-Path $logDir "pm2-backend-out.log"
$pm2Err = Join-Path $logDir "pm2-backend-error.log"
$entry = Join-Path $backend "src\server.js"
$name = "api-danfe-backend"

if (-not (Test-Path -LiteralPath $pm2PathFile)) {
  throw "Caminho do PM2 nao encontrado. Execute Install-PM2Tools.ps1 primeiro."
}

$node = $null
if (Test-Path -LiteralPath $nodePathFile) {
  $node = (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
}
if (-not $node -or -not (Test-Path -LiteralPath $node)) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nodeCommand) {
    $node = $nodeCommand.Source
  }
}
if (-not $node -or -not (Test-Path -LiteralPath $node)) {
  throw "Node.js nao encontrado para executar o PM2."
}

$pm2Command = (Get-Content -LiteralPath $pm2PathFile -Raw).Trim()
$pm2 = $pm2Command
if ([IO.Path]::GetExtension($pm2Command) -eq ".cmd") {
  $commandDir = Split-Path -Parent $pm2Command
  $candidates = @(
    (Join-Path $commandDir "node_modules\pm2\bin\pm2"),
    (Join-Path (Split-Path -Parent $commandDir) "pm2\bin\pm2")
  )
  $pm2 = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $pm2 -or -not (Test-Path -LiteralPath $pm2)) {
  throw "PM2 nao encontrado em $pm2Command"
}

if (-not (Test-Path -LiteralPath $entry)) {
  throw "Entrada do backend nao encontrada: $entry"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-PM2Log {
  param([string] $Message)

  Add-Content -LiteralPath (Join-Path $logDir "pm2-install.log") -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Invoke-PM2 {
  param([string[]] $Arguments)

  $output = & $node $pm2 @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Add-Content -LiteralPath (Join-Path $logDir "pm2-install.log") -Value $line -Encoding UTF8
  }
  if ($exitCode -ne 0) {
    throw "PM2 falhou com codigo $exitCode ao executar: pm2 $($Arguments -join ' ')"
  }
  return $output
}

$pm2List = (& $node $pm2 jlist 2>$null | Out-String)
$appExists = $pm2List -match ('"name"\s*:\s*"' + [regex]::Escape($name) + '"')
if ($appExists) {
  Write-PM2Log "Reiniciando backend pelo PM2..."
  Invoke-PM2 @("restart", $name, "--update-env") | Out-Null
} else {
  Write-PM2Log "Registrando backend no PM2..."
  Invoke-PM2 @(
    "start", $entry,
    "--name", $name,
    "--cwd", $backend,
    "--time",
    "--output", $pm2Out,
    "--error", $pm2Err,
    "--merge-logs"
  ) | Out-Null
}

Invoke-PM2 @("save") | Out-Null
Write-PM2Log "Backend salvo no PM2: $name"
