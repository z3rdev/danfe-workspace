$ErrorActionPreference = 'Stop'

$desktopRoot = $PSScriptRoot
$keyPath = Join-Path $env:USERPROFILE '.tauri\danfe-workspace.key'
$passwordPath = "$keyPath.password"

if (-not (Test-Path $keyPath)) {
    throw "Chave privada nao encontrada em $keyPath."
}

if (-not (Test-Path $passwordPath)) {
    throw "Senha da chave nao encontrada em $passwordPath."
}

$env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content -Raw $passwordPath).Trim()

& (Join-Path $desktopRoot 'Prepare-InstallerResources.ps1')
if (-not $?) {
    throw "Falha ao preparar os recursos do instalador (codigo $LASTEXITCODE)."
}

Push-Location $desktopRoot
try {
    pnpm dlx @tauri-apps/cli@2.12.3 build --ci --bundles nsis
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar o instalador assinado (codigo $LASTEXITCODE)."
    }
}
finally {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
