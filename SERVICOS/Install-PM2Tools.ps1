param(
  [switch] $Quiet
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $root "LOGS"
$logFile = Join-Path $logDir "pm2-install.log"
$nodePathFile = Join-Path $logDir "node-path.txt"
$npmPathFile = Join-Path $logDir "npm-path.txt"
$pm2PathFile = Join-Path $logDir "pm2-path.txt"
$toolsRoot = Join-Path $root ".tools"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-ToolLog {
  param([string] $Message)

  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function Resolve-Tool {
  param(
    [string[]] $Names,
    [string[]] $Paths
  )

  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command -and $command.Source) {
      return $command.Source
    }
  }

  foreach ($path in $Paths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return $path
    }
  }

  return $null
}

function Read-PathFile {
  param([string] $Path)

  if (Test-Path -LiteralPath $Path) {
    $value = (Get-Content -LiteralPath $Path -Raw).Trim()
    if ($value -and (Test-Path -LiteralPath $value)) {
      return $value
    }
  }

  return $null
}

function Resolve-NpmCli {
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

function Resolve-Pm2Script {
  param([string] $CommandPath)

  if (-not $CommandPath -or -not (Test-Path -LiteralPath $CommandPath)) {
    return $null
  }

  if ([IO.Path]::GetExtension($CommandPath) -eq ".cmd") {
    $commandDir = Split-Path -Parent $CommandPath
    $globalEntry = Join-Path $commandDir "node_modules\pm2\bin\pm2"
    if (Test-Path -LiteralPath $globalEntry) {
      return $globalEntry
    }

    $binParent = Split-Path -Parent $commandDir
    $localEntry = Join-Path $binParent "pm2\bin\pm2"
    if (Test-Path -LiteralPath $localEntry) {
      return $localEntry
    }
  }

  if (Test-Path -LiteralPath $CommandPath) {
    return $CommandPath
  }

  return $null
}

$nodePath = Read-PathFile $nodePathFile
if (-not $nodePath) {
  $nodePath = Resolve-Tool `
    -Names @("node.exe", "node") `
    -Paths @(
      (Join-Path $env:ProgramFiles "nodejs\node.exe"),
      $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe" } else { $null })
    )
}

$npmPath = Read-PathFile $npmPathFile
if (-not $npmPath) {
  $npmPath = Resolve-Tool `
    -Names @("npm.cmd", "npm") `
    -Paths @(
      (Join-Path $env:ProgramFiles "nodejs\npm.cmd"),
      $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} "nodejs\npm.cmd" } else { $null }),
      (Join-Path $env:APPDATA "npm\npm.cmd")
    )
}

if (-not $nodePath -or -not $npmPath) {
  throw "Node.js/npm nao encontrado para instalar o PM2."
}

$npmCliPath = Resolve-NpmCli -NodePath $nodePath -NpmPath $npmPath
if (-not $npmCliPath) {
  throw "npm-cli.js nao encontrado ao lado do Node.js."
}

Set-Content -LiteralPath $nodePathFile -Value $nodePath -Encoding ASCII
Set-Content -LiteralPath $npmPathFile -Value $npmPath -Encoding ASCII

$pm2Command = Read-PathFile $pm2PathFile
if (-not $pm2Command) {
  $pm2Command = Resolve-Tool `
    -Names @("pm2.cmd", "pm2") `
    -Paths @(
      (Join-Path $env:ProgramFiles "nodejs\pm2.cmd"),
      (Join-Path $env:APPDATA "npm\pm2.cmd")
    )
}
$pm2Path = Resolve-Pm2Script $pm2Command

if (-not $pm2Path) {
  Write-ToolLog "PM2 nao encontrado. Instalando PM2 com npm..."
  New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
  Push-Location $root
  try {
    & $nodePath $npmCliPath install --prefix $toolsRoot --no-audit --no-fund pm2 2>&1 | ForEach-Object {
      Add-Content -LiteralPath $logFile -Value $_ -Encoding UTF8
      if (-not $Quiet) {
        Write-Host $_
      }
    }
    if ($LASTEXITCODE -ne 0) {
      throw "npm nao conseguiu instalar PM2."
    }
  } finally {
    Pop-Location
  }

  $pm2Path = Join-Path $toolsRoot "node_modules\pm2\bin\pm2"
}

if (-not (Test-Path -LiteralPath $pm2Path)) {
  throw "PM2 nao foi encontrado depois da instalacao com npm."
}

Set-Content -LiteralPath $pm2PathFile -Value $pm2Path -Encoding ASCII
Write-ToolLog "npm: $npmPath"
Write-ToolLog "PM2: $pm2Path"
exit 0
