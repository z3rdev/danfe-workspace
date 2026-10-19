param(
  [switch] $Force,
  [switch] $Quiet,
  [switch] $SkipNodeInstall
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backend = Join-Path $root "BACKEND"
$logDir = Join-Path $root "LOGS"
$logFile = Join-Path $logDir "backend-install.log"
$nodePathFile = Join-Path $logDir "node-path.txt"
$npmPathFile = Join-Path $logDir "npm-path.txt"
$nodeMsi = Join-Path $PSScriptRoot "node.msi"
$packageJson = Join-Path $backend "package.json"
$packageLock = Join-Path $backend "package-lock.json"
$nodeModules = Join-Path $backend "node_modules"
$okMarker = Join-Path $nodeModules ".danfe-deps-ok"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-DanfeLog {
  param([string] $Message)

  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Resolve-DanfeCommand {
  param(
    [string[]] $Names,
    [string[]] $FallbackPaths
  )

  foreach ($name in $Names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) {
      return $cmd.Source
    }
  }

  foreach ($path in $FallbackPaths) {
    if ($path -and (Test-Path $path)) {
      return $path
    }
  }

  return $null
}

function Test-DanfeAdmin {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-DanfeNodePath {
  Resolve-DanfeCommand `
    -Names @("node.exe", "node") `
    -FallbackPaths @(
      (Join-Path $env:ProgramFiles "nodejs\node.exe"),
      $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe" } else { $null })
    )
}

function Get-DanfeNpmPath {
  Resolve-DanfeCommand `
    -Names @("npm.cmd", "npm") `
    -FallbackPaths @(
      (Join-Path $env:ProgramFiles "nodejs\npm.cmd"),
      $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs\npm.cmd" } else { $null }),
      (Join-Path $env:APPDATA "npm\npm.cmd")
  )
}

function Get-DanfeNpmCliPath {
  param(
    [string] $NodePath,
    [string] $NpmPath
  )

  $candidates = @(
    (Join-Path (Split-Path -Parent $NodePath) "node_modules\npm\bin\npm-cli.js"),
    (Join-Path (Split-Path -Parent $NpmPath) "node_modules\npm\bin\npm-cli.js")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Install-DanfeNodeFromMsi {
  if ($SkipNodeInstall) {
    throw "Node.js/npm nao encontrado e a instalacao automatica esta desativada neste modo. Execute INSTALAR_DEPENDENCIAS.bat."
  }

  if (-not (Test-Path $nodeMsi)) {
    throw "Node.js/npm nao encontrado e node.msi nao existe em $nodeMsi"
  }

  Write-DanfeLog "Node.js/npm nao encontrado. Instalando pelo MSI: $nodeMsi"
  $arguments = "/i `"$nodeMsi`" /passive /norestart"

  try {
    if (Test-DanfeAdmin) {
      $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru
    } else {
      Write-DanfeLog "Solicitando permissao de administrador para instalar Node.js..."
      $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    }
  } catch {
    throw "Falha ao abrir instalador do Node.js: $($_.Exception.Message)"
  }

  $successCodes = @(0, 3010, 1641)
  if ($process -and ($successCodes -notcontains $process.ExitCode)) {
    throw "Instalador Node.js retornou codigo $($process.ExitCode)."
  }

  $nodeDir = Join-Path $env:ProgramFiles "nodejs"
  if (Test-Path $nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
  }

  Write-DanfeLog "Instalacao do Node.js concluida."
}

function Test-DanfeDependencies {
  if (-not (Test-Path $nodeModules)) {
    return $false
  }

  if (-not (Test-Path $packageJson)) {
    throw "package.json nao encontrado em $packageJson"
  }

  $pkg = Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json
  $deps = @()
  if ($pkg.dependencies) {
    $deps = $pkg.dependencies.PSObject.Properties.Name
  }

  foreach ($dep in $deps) {
    $depPath = Join-Path $nodeModules $dep
    if (-not (Test-Path $depPath)) {
      Write-DanfeLog "Dependencia ausente: $dep"
      return $false
    }
  }

  if ((Test-Path $packageLock) -and (Test-Path $okMarker)) {
    $lockTime = (Get-Item -LiteralPath $packageLock).LastWriteTimeUtc
    $markerTime = (Get-Item -LiteralPath $okMarker).LastWriteTimeUtc
    if ($lockTime -gt $markerTime) {
      Write-DanfeLog "package-lock.json mudou depois da ultima instalacao."
      return $false
    }
  }

  return $true
}

if (-not (Test-Path $backend)) {
  throw "Pasta BACKEND nao encontrada: $backend"
}

if (-not (Test-Path $packageJson)) {
  throw "package.json nao encontrado: $packageJson"
}

$nodePath = Get-DanfeNodePath
$npmPath = Get-DanfeNpmPath

if (-not $nodePath -or -not $npmPath) {
  Install-DanfeNodeFromMsi
  $nodePath = Get-DanfeNodePath
  $npmPath = Get-DanfeNpmPath
}

if (-not $nodePath -or -not $npmPath) {
  throw "Node.js/npm ainda nao foi encontrado depois da instalacao. Reinicie o terminal ou o Windows e tente novamente."
}

$npmCliPath = Get-DanfeNpmCliPath -NodePath $nodePath -NpmPath $npmPath
if (-not $npmCliPath) {
  throw "npm-cli.js nao encontrado ao lado do Node.js."
}

Write-DanfeLog "Node: $nodePath"
Write-DanfeLog "npm: $npmPath"
Set-Content -LiteralPath $nodePathFile -Value $nodePath -Encoding ASCII
Set-Content -LiteralPath $npmPathFile -Value $npmPath -Encoding ASCII

$needsInstall = $Force -or -not (Test-DanfeDependencies)

if (-not $needsInstall) {
  Write-DanfeLog "Dependencias ja estao instaladas."
  return
}

Write-DanfeLog "Instalando dependencias do backend com npm..."

$env:NPM_CONFIG_AUDIT = "false"
$env:NPM_CONFIG_FUND = "false"
$env:NPM_CONFIG_UPDATE_NOTIFIER = "false"

Push-Location $backend
try {
  $npmOutput = & $nodePath $npmCliPath install --no-audit --fund=false 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}

foreach ($line in $npmOutput) {
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  if (-not $Quiet) {
    Write-Host $line
  }
}

if ($exitCode -ne 0) {
  throw "npm install falhou com codigo $exitCode. Veja o log em $logFile"
}

New-Item -ItemType File -Force -Path $okMarker | Out-Null

if (-not (Test-DanfeDependencies)) {
  throw "npm install terminou, mas ainda faltam dependencias. Veja o log em $logFile"
}

Write-DanfeLog "Dependencias instaladas com sucesso."
