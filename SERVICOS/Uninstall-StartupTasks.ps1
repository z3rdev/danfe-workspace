$ErrorActionPreference = "Stop"

$tasks = @("API-DANFE-BACKEND", "API-DANFE-FRONT")
$startupDir = [Environment]::GetFolderPath("Startup")

foreach ($task in $tasks) {
  $existing = Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  if ($existing) {
    try {
      Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction Stop
      Write-Host "OK: tarefa removida: $task"
    } catch {
      Write-Host "Aviso: nao foi possivel remover tarefa $($task): $($_.Exception.Message)"
    }
  }

  $shortcutPath = Join-Path $startupDir "$task.lnk"
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    Write-Host "OK: inicializacao removida: $shortcutPath"
  }
}

$nativeServiceUninstaller = Join-Path $PSScriptRoot "Uninstall-NativeService.ps1"
if (Test-Path -LiteralPath $nativeServiceUninstaller) {
  Write-Host ""
  Write-Host "Removendo servico nativo do backend..."
  & $nativeServiceUninstaller
}
