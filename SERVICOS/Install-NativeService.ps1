param(
  [switch] $Quiet,
  [switch] $DryRun,
  [string] $DesktopExecutable = ''
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backend = Join-Path $root "BACKEND"
$entry = Join-Path $backend "src\server.js"
$logDir = Join-Path $root "LOGS"
$serviceLogDir = Join-Path $logDir "native-service"
$nodePathFile = Join-Path $logDir "node-path.txt"
$wrapper = Join-Path $PSScriptRoot "API-DANFE-BACKEND.exe"
$config = Join-Path $PSScriptRoot "API-DANFE-BACKEND.xml"
$serviceName = "APIDANFEBACKEND"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $serviceLogDir | Out-Null

function Write-ServiceLog {
  param([string] $Message)

  Add-Content -LiteralPath (Join-Path $logDir "native-service-install.log") -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
  if (-not $Quiet) {
    Write-Host $Message
  }
}

function ConvertTo-XmlText {
  param([string] $Value)

  return [System.Security.SecurityElement]::Escape($Value)
}

function Resolve-NodePath {
  if (Test-Path -LiteralPath $nodePathFile) {
    $saved = (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
    if ($saved -and (Test-Path -LiteralPath $saved)) {
      return $saved
    }
  }

  $command = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and $command.Source) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe")
  )
  return $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

function Invoke-WinSw {
  param(
    [string[]] $Arguments,
    [switch] $AllowFailure
  )

  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $wrapper
  $info.Arguments = $Arguments -join " "
  $info.WorkingDirectory = $PSScriptRoot
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  [void] $process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  foreach ($line in @($stdout -split "`r?`n")) {
    if ($line) { Write-ServiceLog $line }
  }
  foreach ($line in @($stderr -split "`r?`n")) {
    if ($line) { Write-ServiceLog ("ERRO: " + $line) }
  }

  if ($process.ExitCode -ne 0 -and -not $AllowFailure) {
    throw "WinSW falhou com codigo $($process.ExitCode) ao executar: $($Arguments -join ' ')"
  }

  return $process.ExitCode
}

function Stop-LegacyBackendProcess {
  $connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $connection.OwningProcess) -ErrorAction SilentlyContinue
    if ($process -and $process.Name -ieq "node.exe") {
      $commandLine = [string]$process.CommandLine
      if ($commandLine -match "server\.js" -or $commandLine -match [regex]::Escape($backend)) {
        Write-ServiceLog "Parando processo antigo do backend (PID $($connection.OwningProcess))..."
        Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

if (-not (Test-Path -LiteralPath $wrapper)) {
  throw "Wrapper nativo do Windows nao encontrado: $wrapper"
}
if (-not (Test-Path -LiteralPath $entry)) {
  throw "Entrada do backend nao encontrada: $entry"
}

$node = Resolve-NodePath
if (-not $node) {
  throw "Node.js nao encontrado. Instale o Node pelo node.msi antes de criar o servico."
}

$nodeXml = ConvertTo-XmlText $node
$entryXml = ConvertTo-XmlText $entry
$backendXml = ConvertTo-XmlText $backend
$serviceLogXml = ConvertTo-XmlText $serviceLogDir
$programDataRoot = [Environment]::GetFolderPath("CommonApplicationData")
if (-not $programDataRoot) {
  $programDataRoot = $env:ProgramData
}
$dataDir = Join-Path $programDataRoot "DANFE Workspace\data"
$userProfile = [Environment]::GetFolderPath("UserProfile")
if (-not $userProfile) {
  $userProfile = $env:USERPROFILE
}
$documentsDir = [Environment]::GetFolderPath("MyDocuments")
if (-not $documentsDir -or ($userProfile -and -not ($documentsDir.StartsWith($userProfile, [System.StringComparison]::OrdinalIgnoreCase)))) {
  $documentsDir = Join-Path $userProfile "Documents"
}
$defaultOutputDir = Join-Path $documentsDir "DANFE"

# O instalador do Tauri usa Program Files. O fallback em AppData atende
# execucoes manuais e instalacoes antigas sem depender da pasta do projeto.
$desktopCandidates = @()
if ($DesktopExecutable) {
  $desktopCandidates += $DesktopExecutable
}
if ($env:ProgramFiles) {
  $desktopCandidates += Join-Path $env:ProgramFiles "DANFE Workspace\api-danfe-desktop.exe"
  $desktopCandidates += Join-Path $env:ProgramFiles "DANFE Workspace\DANFE Workspace.exe"
}
if ($userProfile) {
  $desktopCandidates += Join-Path (Join-Path $userProfile "AppData\Local") "DANFE Workspace\api-danfe-desktop.exe"
  $desktopCandidates += Join-Path (Join-Path $userProfile "AppData\Local") "DANFE Workspace\DANFE Workspace.exe"
}
$desktopExecutable = @($desktopCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1)
if (-not $desktopExecutable) {
  $desktopExecutable = $desktopCandidates | Select-Object -First 1
}
if ($desktopExecutable) {
  $desktopExecutable = [System.IO.Path]::GetFullPath([string]$desktopExecutable)
}
New-Item -ItemType Directory -Force -Path $dataDir, $defaultOutputDir | Out-Null
$dataDirXml = ConvertTo-XmlText $dataDir
$defaultOutputDirXml = ConvertTo-XmlText $defaultOutputDir
$desktopExecutableXml = ConvertTo-XmlText $desktopExecutable

$xml = @"
<service>
  <id>$serviceName</id>
  <name>API DANFE Backend</name>
  <description>Backend local da API DANFE. Executa o server.js sem abrir janela de console.</description>
  <executable>$nodeXml</executable>
  <arguments>&quot;$entryXml&quot;</arguments>
  <workingdirectory>$backendXml</workingdirectory>
  <env name="DANFE_DATA_DIR" value="$dataDirXml" />
  <env name="DANFE_DEFAULT_OUTPUT_DIR" value="$defaultOutputDirXml" />
  <env name="DANFE_DESKTOP_EXECUTABLE" value="$desktopExecutableXml" />
  <hidewindow>true</hidewindow>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>20 sec</stoptimeout>
  <onfailure action="restart" delay="10 sec" />
  <resetfailure>1 hour</resetfailure>
  <logpath>$serviceLogXml</logpath>
  <log mode="roll" />
</service>
"@

Set-Content -LiteralPath $config -Value $xml -Encoding UTF8
Write-ServiceLog "Configuracao nativa gerada: $config"
Write-ServiceLog "Node usado pelo servico: $node"

if ($DryRun) {
  Write-ServiceLog "DryRun concluido; o servico nao foi instalado."
  exit 0
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-ServiceLog "Servico existente encontrado. Reinstalando configuracao..."
  Invoke-WinSw @("stop") -AllowFailure | Out-Null
  Start-Sleep -Seconds 1
  Invoke-WinSw @("uninstall") -AllowFailure | Out-Null
  Start-Sleep -Seconds 1
}

Stop-LegacyBackendProcess
Invoke-WinSw @("install") | Out-Null
Invoke-WinSw @("start") | Out-Null

$running = $false
for ($attempt = 1; $attempt -le 20; $attempt += 1) {
  Start-Sleep -Seconds 1
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  if ($service -and $service.Status -eq "Running") {
    $running = $true
    break
  }
}

if (-not $running) {
  $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
  throw "O servico $serviceName nao iniciou. Status atual: $($service.Status)"
}

Write-ServiceLog "Servico nativo instalado e em execucao: $serviceName"
