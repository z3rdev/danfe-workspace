param(
  [switch] $Quiet
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wrapper = Join-Path $PSScriptRoot "API-DANFE-BACKEND.exe"
$logDir = Join-Path $root "LOGS"
$serviceName = "APIDANFEBACKEND"

function Write-ServiceLog {
  param([string] $Message)

  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Add-Content -LiteralPath (Join-Path $logDir "native-service-install.log") -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
  if (-not $Quiet) { Write-Host $Message }
}

if (-not (Test-Path -LiteralPath $wrapper)) {
  Write-ServiceLog "Wrapper nativo nao encontrado; nada para remover."
  exit 0
}

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-ServiceLog "Servico nativo nao instalado: $serviceName"
  exit 0
}

$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = $wrapper
$info.Arguments = "stop"
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

foreach ($line in @($stdout -split "`r?`n")) { if ($line) { Write-ServiceLog $line } }
foreach ($line in @($stderr -split "`r?`n")) { if ($line) { Write-ServiceLog ("ERRO: " + $line) } }

$info.Arguments = "uninstall"
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $info
[void] $process.Start()
$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

foreach ($line in @($stdout -split "`r?`n")) { if ($line) { Write-ServiceLog $line } }
foreach ($line in @($stderr -split "`r?`n")) { if ($line) { Write-ServiceLog ("ERRO: " + $line) } }

if ($process.ExitCode -ne 0) {
  throw "Nao foi possivel remover o servico $serviceName. Codigo: $($process.ExitCode)"
}

Write-ServiceLog "Servico nativo removido: $serviceName"
