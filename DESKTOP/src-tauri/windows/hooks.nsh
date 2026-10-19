!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Parando o backend existente antes de atualizar os arquivos..."
  IfFileExists "$INSTDIR\resources\full-installer\SERVICOS\Uninstall-NativeService.ps1" danfe_preinstall_stop_backend danfe_preinstall_done
danfe_preinstall_stop_backend:
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\full-installer\SERVICOS\Uninstall-NativeService.ps1" -Quiet' $0
  Sleep 1000
danfe_preinstall_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Iniciando a instalacao do backend local em segundo plano..."
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\full-installer\SERVICOS\Install-StartupTasks.ps1" -SkipFrontendStart'
  DetailPrint "O backend continuara a configuracao nos logs da instalacao."
  ExecWait '"$INSTDIR\resources\full-installer\SERVICOS\Cleanup-LegacyShortcuts.ps1"' $0
  DetailPrint "Preparando a extensao do navegador..."
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\full-installer\SERVICOS\Install-BrowserExtension.ps1" -OpenBrowserPage'
  DetailPrint "Extensao preparada e tela do navegador aberta."
  Exec '"$INSTDIR\api-danfe-desktop.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removendo o servico local e as tarefas do Windows..."
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\full-installer\SERVICOS\Uninstall-StartupTasks.ps1"' $0
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\full-installer\SERVICOS\Uninstall-BrowserExtension.ps1"' $0
!macroend
