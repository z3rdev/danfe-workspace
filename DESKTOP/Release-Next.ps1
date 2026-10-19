[CmdletBinding()]
param(
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Part = 'patch',
    [string]$Version,
    [string]$Notes,
    [switch]$Publish,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$desktopRoot = $PSScriptRoot
$tauriConfigPath = Join-Path $desktopRoot 'src-tauri\tauri.conf.json'
$cargoPath = Join-Path $desktopRoot 'src-tauri\Cargo.toml'

function Read-ProjectVersion {
    $content = [System.IO.File]::ReadAllText($tauriConfigPath)
    $match = [regex]::Match($content, '"version"\s*:\s*"([^\"]+)"')
    if (-not $match.Success) {
        throw "Nao foi possivel encontrar a versao em $tauriConfigPath."
    }

    return $match.Groups[1].Value
}

function Get-NextVersion([string]$current, [string]$partName) {
    $match = [regex]::Match($current, '^(\d+)\.(\d+)\.(\d+)$')
    if (-not $match.Success) {
        throw "A versao atual '$current' nao esta no formato MAJOR.MINOR.PATCH."
    }

    $major = [int]$match.Groups[1].Value
    $minor = [int]$match.Groups[2].Value
    $patch = [int]$match.Groups[3].Value

    switch ($partName) {
        'major' { $major++; $minor = 0; $patch = 0 }
        'minor' { $minor++; $patch = 0 }
        default { $patch++ }
    }

    return "$major.$minor.$patch"
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $content, $encoding)
}

$currentVersion = Read-ProjectVersion
$nextVersion = if ($Version) { $Version.Trim() } else { Get-NextVersion $currentVersion $Part }

if (-not [regex]::IsMatch($nextVersion, '^\d+\.\d+\.\d+$')) {
    throw "A nova versao '$nextVersion' deve seguir o formato MAJOR.MINOR.PATCH."
}

if ([version]$nextVersion -le [version]$currentVersion) {
    throw "A nova versao $nextVersion precisa ser maior que a atual $currentVersion."
}

$tauriContent = [System.IO.File]::ReadAllText($tauriConfigPath)
$cargoContent = [System.IO.File]::ReadAllText($cargoPath)
$tauriUpdated = $tauriContent -replace '("version"\s*:\s*")[^\"]+("),', ('${1}' + $nextVersion + '${2},')
$cargoUpdated = $cargoContent -replace '(?m)^(version\s*=\s*")[^\"]+(")', ('${1}' + $nextVersion + '${2}')

if ($tauriUpdated -eq $tauriContent -or $cargoUpdated -eq $cargoContent) {
    throw 'Nao foi possivel sincronizar a versao nos arquivos do aplicativo.'
}

Write-Utf8NoBom $tauriConfigPath $tauriUpdated
Write-Utf8NoBom $cargoPath $cargoUpdated
Write-Host "Versao atualizada: $currentVersion -> $nextVersion"

if (-not $SkipBuild) {
    & (Join-Path $desktopRoot 'Build-Release.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gerar o instalador (codigo $LASTEXITCODE)."
    }
}

$installerPath = Join-Path $desktopRoot "src-tauri\target\release\bundle\nsis\DANFE Workspace_${nextVersion}_x64-setup.exe"
$signaturePath = "$installerPath.sig"

if (-not (Test-Path -LiteralPath $installerPath) -or -not (Test-Path -LiteralPath $signaturePath)) {
    throw "Os artefatos da versao $nextVersion nao foram encontrados."
}

if ($Publish) {
    if ([string]::IsNullOrWhiteSpace($Notes)) {
        throw 'Informe -Notes ao publicar uma versao.'
    }

    $curlArgs = @(
        '-sS', '-X', 'POST',
        '-F', "version=$nextVersion",
        '-F', "notes=$Notes",
        '-F', "installer=@$installerPath",
        '-F', "signature=@$signaturePath",
        'http://127.0.0.1:3000/api/dev/release/publish'
    )
    $response = & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel publicar. Confirme se o backend local esta online e em modo dev.'
    }

    Write-Host "Resposta da publicacao: $response"
}

Write-Host "Instalador: $installerPath"
Write-Host "Assinatura: $signaturePath"
