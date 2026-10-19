$ErrorActionPreference = 'SilentlyContinue'

$legacyTarget = Join-Path (Join-Path $env:LOCALAPPDATA 'DANFE Workspace') 'api-danfe-desktop.exe'
$shortcutRoots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('StartMenu'),
  [Environment]::GetFolderPath('Startup')
) | Where-Object { $_ } | Select-Object -Unique
$shell = New-Object -ComObject WScript.Shell

foreach ($shortcut in ($shortcutRoots | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Filter 'DANFE Workspace.lnk' -File -Recurse -ErrorAction SilentlyContinue
} | Select-Object -ExpandProperty FullName -Unique)) {
  $target = $shell.CreateShortcut($shortcut).TargetPath
  if ([string]::Equals($target, $legacyTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $shortcut -Force
  }
}
