$ErrorActionPreference = 'Stop'

$desktopRoot = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $desktopRoot '..')).Path
$resourceRoot = Join-Path $desktopRoot 'src-tauri\resources\full-installer'
$backendSource = Join-Path $projectRoot 'BACKEND'
$servicesSource = Join-Path $projectRoot 'SERVICOS'

if (Test-Path -LiteralPath $resourceRoot) {
  Remove-Item -LiteralPath $resourceRoot -Recurse -Force
}

function Copy-ResourceFile {
  param(
    [string] $Source,
    [string] $Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Arquivo necessario para o instalador nao encontrado: $Source"
  }

  $destinationDir = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-ResourceDirectory {
  param(
    [string] $Source,
    [string] $Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Pasta necessaria para o instalador nao encontrada: $Source"
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force |
    Where-Object { $_.Name -notin @('node_modules', '.git', '.output', '.wrangler', '.tanstack', '.lovable') } |
    ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

$backendStage = Join-Path $resourceRoot 'BACKEND'
$servicesStage = Join-Path $resourceRoot 'SERVICOS'
$extensionStage = Join-Path $resourceRoot 'EXTENSAO'

foreach ($file in @('package.json', 'package-lock.json', 'README.md', '.env.example')) {
  Copy-ResourceFile (Join-Path $backendSource $file) (Join-Path $backendStage $file)
}

$backendEnv = Join-Path $backendSource '.env'
if (Test-Path -LiteralPath $backendEnv) {
  Copy-ResourceFile $backendEnv (Join-Path $backendStage '.env')
} else {
  Copy-ResourceFile (Join-Path $backendSource '.env.example') (Join-Path $backendStage '.env')
}
$developmentConfig = Join-Path $backendSource 'CONFIG.dev'
if (Test-Path -LiteralPath $developmentConfig) {
  Copy-ResourceFile $developmentConfig (Join-Path $backendStage 'CONFIG.dev')
}
Copy-ResourceDirectory (Join-Path $backendSource 'src') (Join-Path $backendStage 'src')
Copy-ResourceDirectory (Join-Path $projectRoot 'EXTENSAO') $extensionStage

foreach ($file in @(
  'API-DANFE-BACKEND.exe',
  'Install-Dependencies.ps1',
  'Install-NativeService.ps1',
  'Install-StartupTasks.ps1',
  'Cleanup-LegacyShortcuts.ps1',
  'Uninstall-NativeService.ps1',
  'Uninstall-StartupTasks.ps1',
  'Install-BrowserExtension.ps1',
  'Uninstall-BrowserExtension.ps1',
  'START_FRONT.bat',
  'START_FRONT_HIDDEN.vbs',
  'node.msi'
)) {
  Copy-ResourceFile (Join-Path $servicesSource $file) (Join-Path $servicesStage $file)
}

foreach ($directory in @('DADOS', 'SAIDAS', 'LOGS')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $resourceRoot $directory) | Out-Null
}

Write-Host "Recursos do instalador preparados em: $resourceRoot"
