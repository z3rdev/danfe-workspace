$ErrorActionPreference = 'Stop'

$desktopRoot = $PSScriptRoot
$frontendRoot = Join-Path $desktopRoot '..\FRONTEND'
$tauriRoot = Join-Path $desktopRoot 'src-tauri'
$output = Join-Path $desktopRoot 'DANFE-Workspace.exe'

Write-Host 'Gerando o frontend...' -ForegroundColor Cyan
Push-Location $frontendRoot
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao compilar o frontend (codigo $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

Write-Host 'Compilando o aplicativo nativo...' -ForegroundColor Cyan
Push-Location $tauriRoot
try {
    cargo build --release
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao compilar o aplicativo nativo (codigo $LASTEXITCODE)."
    }
    Copy-Item '.\target\release\api-danfe-desktop.exe' $output -Force
}
finally {
    Pop-Location
}

Write-Host "Aplicativo gerado em: $output" -ForegroundColor Green
