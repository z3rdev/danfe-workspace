$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir = Join-Path $root "DIST"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "API-DANFE-INSTALADOR-$stamp"
$stageDir = Join-Path $distDir $packageName
$zipPath = Join-Path $distDir "$packageName.zip"

function Copy-FileSafe {
  param(
    [string] $Source,
    [string] $Destination
  )

  if (-not (Test-Path $Source)) {
    return
  }

  $destinationDir = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-DirectorySafe {
  param(
    [string] $Source,
    [string] $Destination
  )

  if (-not (Test-Path $Source)) {
    return
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $excludedNames = @('node_modules', '.output', '.wrangler', '.tanstack', '.lovable', '.git')
  Get-ChildItem -LiteralPath $Source -Force |
    Where-Object { $excludedNames -notcontains $_.Name } |
    ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  }
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

if (Test-Path $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Write-Host "Montando pacote em:"
Write-Host "  $stageDir"
Write-Host ""

$rootFiles = @(
  "COMO_INICIAR.md",
  "INSTALAR_DEPENDENCIAS.bat",
  "INSTALAR_NODE.bat",
  "INICIAR_SERVIDOR.bat",
  "INICIAR_SERVIDOR.ps1",
  "INSTALAR_SERVICOS.bat",
  "INSTALAR_SERVICOS_ADMIN.bat",
  "REMOVER_SERVICOS.bat",
  "STATUS_SERVICOS.bat",
  "PARAR_SERVICOS.bat",
  "COMPILAR_INSTALADOR.bat"
)

foreach ($file in $rootFiles) {
  Copy-FileSafe `
    -Source (Join-Path $root $file) `
    -Destination (Join-Path $stageDir $file)
}

Copy-DirectorySafe -Source (Join-Path $root "FRONTEND") -Destination (Join-Path $stageDir "FRONTEND")
Copy-DirectorySafe -Source (Join-Path $root "EXTENSAO") -Destination (Join-Path $stageDir "EXTENSAO")
Copy-DirectorySafe -Source (Join-Path $root "SERVICOS") -Destination (Join-Path $stageDir "SERVICOS")

# O XML contem caminhos absolutos desta maquina; o instalador gera outro no destino.
$stagedServiceConfig = Join-Path $stageDir "SERVICOS\API-DANFE-BACKEND.xml"
if (Test-Path -LiteralPath $stagedServiceConfig) {
  Remove-Item -LiteralPath $stagedServiceConfig -Force
}

$backendSource = Join-Path $root "BACKEND"
$backendStage = Join-Path $stageDir "BACKEND"
New-Item -ItemType Directory -Force -Path $backendStage | Out-Null
Copy-FileSafe -Source (Join-Path $backendSource "package.json") -Destination (Join-Path $backendStage "package.json")
Copy-FileSafe -Source (Join-Path $backendSource "package-lock.json") -Destination (Join-Path $backendStage "package-lock.json")
Copy-FileSafe -Source (Join-Path $backendSource ".env.example") -Destination (Join-Path $backendStage ".env.example")
$backendEnv = Join-Path $backendSource ".env"
if (Test-Path -LiteralPath $backendEnv) {
  Copy-FileSafe -Source $backendEnv -Destination (Join-Path $backendStage ".env")
} else {
  Copy-FileSafe -Source (Join-Path $backendSource ".env.example") -Destination (Join-Path $backendStage ".env")
}
Copy-FileSafe -Source (Join-Path $backendSource "README.md") -Destination (Join-Path $backendStage "README.md")
Copy-DirectorySafe -Source (Join-Path $backendSource "src") -Destination (Join-Path $backendStage "src")

New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "DADOS") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "SAIDAS") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stageDir "LOGS") | Out-Null

@"
API DANFE - pacote instalavel
=============================

1. Extraia esta pasta em um local fixo.
2. Execute INSTALAR_SERVICOS_ADMIN.bat.
3. Uma janela de progresso mostra o que esta sendo instalado.
4. O backend inicia em http://localhost:3000.

Observacao:
- node_modules e .tools nao vao no pacote; o instalador usa o node.msi e executa npm install se precisar.
- O backend fica instalado como servico nativo do Windows e inicia antes do login.
- O painel e aberto no login do usuario por tarefa agendada ou atalho oculto.
- O servico gera os caminhos de dados, saida e executavel conforme o computador onde foi instalado.
- A configuracao SQL do arquivo `.env` acompanha este pacote e nao depende do caminho do projeto de desenvolvimento.
- O terminal permanece oculto; o acompanhamento aparece na janela "API DANFE - Instalacao".
- PDFs/XMLs/JSONs/logs locais nao sao copiados para este pacote.
"@ | Set-Content -LiteralPath (Join-Path $stageDir "LEIA-ME-INSTALACAO.txt") -Encoding UTF8

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Pacote criado:"
Write-Host "  $zipPath"
