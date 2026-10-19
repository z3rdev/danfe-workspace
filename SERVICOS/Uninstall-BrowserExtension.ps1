$ErrorActionPreference = 'Stop'

$extensionRoot = Join-Path $env:LOCALAPPDATA 'DANFE Workspace'
$extensionPath = Join-Path $extensionRoot 'BrowserExtension'
$statePath = Join-Path $extensionRoot 'browser-extension.json'

if (Test-Path -LiteralPath $extensionPath) {
  Remove-Item -LiteralPath $extensionPath -Recurse -Force
}

if (Test-Path -LiteralPath $statePath) {
  Remove-Item -LiteralPath $statePath -Force
}

Write-Host 'Arquivos da extensao do navegador removidos.'
