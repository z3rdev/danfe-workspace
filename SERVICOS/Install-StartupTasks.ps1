param(
  [string] $DesktopExecutable = '',
  [switch] $SkipFrontendStart
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$dependencyInstaller = Join-Path $PSScriptRoot "Install-Dependencies.ps1"
$nativeServiceInstaller = Join-Path $PSScriptRoot "Install-NativeService.ps1"
$frontScript = Join-Path $PSScriptRoot "START_FRONT.bat"
$frontHiddenScript = Join-Path $PSScriptRoot "START_FRONT_HIDDEN.vbs"
$wrapper = Join-Path $PSScriptRoot "API-DANFE-BACKEND.exe"
$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$logDir = Join-Path $root "LOGS"
$legacyBackendTask = "API-DANFE-BACKEND"
$frontTask = "API-DANFE-FRONT"
$startupDir = [Environment]::GetFolderPath("Startup")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$identityObject = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principalObject = New-Object System.Security.Principal.WindowsPrincipal($identityObject)
if (-not $principalObject.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "A instalacao do servico nativo precisa ser executada como administrador. Use INSTALAR_SERVICOS.bat e aceite o UAC."
}

foreach ($file in @($dependencyInstaller, $nativeServiceInstaller, $frontScript, $frontHiddenScript, $wrapper, $wscript)) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Arquivo necessario nao encontrado: $file"
  }
}

Write-Host "Instalando/validando dependencias do backend com npm..."
& $dependencyInstaller
Write-Host ""

Write-Host "Instalando o backend como servico nativo do Windows..."
$nativeServiceArguments = @()
if ($DesktopExecutable) {
  $nativeServiceArguments += @('-DesktopExecutable', $DesktopExecutable)
}
& $nativeServiceInstaller @nativeServiceArguments
Write-Host ""

try {
  Unregister-ScheduledTask -TaskName $legacyBackendTask -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa antiga do backend removida: $legacyBackendTask"
} catch {
  Write-Host "Aviso: nao foi possivel remover a tarefa antiga do backend: $($_.Exception.Message)"
}

$legacyBackendShortcut = Join-Path $startupDir "$legacyBackendTask.lnk"
if (Test-Path -LiteralPath $legacyBackendShortcut) {
  Remove-Item -LiteralPath $legacyBackendShortcut -Force
  Write-Host "Atalho antigo do backend removido: $legacyBackendShortcut"
}

$identity = $identityObject.Name
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

function Register-DanfeFrontTask {
  $action = New-ScheduledTaskAction `
    -Execute $wscript `
    -Argument ('"{0}"' -f $frontHiddenScript) `
    -WorkingDirectory (Split-Path -Parent $frontHiddenScript)
  $trigger = New-ScheduledTaskTrigger -AtLogOn

  Register-ScheduledTask `
    -TaskName $frontTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Abre o painel web da API DANFE quando o backend estiver online." `
    -Force | Out-Null

  Write-Host "OK: tarefa criada/atualizada: $frontTask"
}

function New-DanfeFrontShortcut {
  if (-not (Test-Path -LiteralPath $startupDir)) {
    New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
  }

  $shortcutPath = Join-Path $startupDir "$frontTask.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $wscript
  $shortcut.Arguments = ('"{0}"' -f $frontHiddenScript)
  $shortcut.WorkingDirectory = Split-Path -Parent $frontHiddenScript
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Abre o painel web da API DANFE quando o backend estiver online."
  $shortcut.Save()

  Write-Host "OK: inicializacao criada: $shortcutPath"
}

$installedByTaskScheduler = $true
try {
  Register-DanfeFrontTask
} catch {
  $installedByTaskScheduler = $false
  Write-Host "Aviso: nao foi possivel criar a tarefa do front no Agendador."
  Write-Host "Motivo: $($_.Exception.Message)"
  Write-Host "Usando a pasta Inicializar do usuario como alternativa."
  Write-Host ""

  try {
    Unregister-ScheduledTask -TaskName $frontTask -Confirm:$false -ErrorAction SilentlyContinue
  } catch {
    # O atalho sera usado como alternativa.
  }

  New-DanfeFrontShortcut
}

if (-not $SkipFrontendStart) {
  Write-Host ""
  Write-Host "Iniciando painel..."
  if ($installedByTaskScheduler) {
    Start-ScheduledTask -TaskName $frontTask
  } else {
    Start-Process `
      -FilePath $wscript `
      -ArgumentList ('"{0}"' -f $frontHiddenScript) `
      -WorkingDirectory (Split-Path -Parent $frontHiddenScript) `
      -WindowStyle Hidden
  }
}

Write-Host ""
Write-Host "Logs:"
Write-Host "  $logDir\native-service-install.log"
Write-Host "  $logDir\backend-install.log"
Write-Host "  $logDir\native-service\"
