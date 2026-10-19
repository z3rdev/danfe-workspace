param(
  [switch] $OpenBrowserPage
)

$ErrorActionPreference = 'Stop'

$resourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $resourceRoot 'EXTENSAO'
$destination = Join-Path $env:LOCALAPPDATA 'DANFE Workspace\BrowserExtension'

if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json'))) {
  throw "Extensao do navegador nao encontrada: $source"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $source -Force |
  Where-Object { $_.Name -notin @('README.md') } |
  ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
  }

$manifest = Get-Content -LiteralPath (Join-Path $destination 'manifest.json') -Raw | ConvertFrom-Json
$installState = [ordered]@{
  name = $manifest.name
  version = $manifest.version
  path = $destination
  installedAt = [DateTime]::Now.ToString('o')
}

$statePath = Join-Path $env:LOCALAPPDATA 'DANFE Workspace\browser-extension.json'
$installState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

if ($OpenBrowserPage) {
  $progId = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -Name ProgId -ErrorAction SilentlyContinue).ProgId
  $browserPath = $null
  $extensionsUrl = switch -Regex ($progId) {
    '^ChromeHTML' {
      $browserPath = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
      ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      'chrome://extensions'
      break
    }
    '^MSEdgeHTM' {
      $browserPath = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
      ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      'edge://extensions'
      break
    }
    '^BraveHTML' {
      $browserPath = @(
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe"
      ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
      'brave://extensions'
      break
    }
    default { $null }
  }

  if (-not $extensionsUrl) {
    $edge = @(
      "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
      "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    $chrome = @(
      "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
      "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

    if ($edge) {
      $browserPath = $edge
      $extensionsUrl = 'edge://extensions'
    } elseif ($chrome) {
      $browserPath = $chrome
      $extensionsUrl = 'chrome://extensions'
    }
  }

  if ($extensionsUrl) {
    if ($browserPath) {
      Start-Process -FilePath $browserPath -ArgumentList $extensionsUrl
    } else {
      Start-Process -FilePath $extensionsUrl
    }
  }
}

Write-Host "Extensao instalada em: $destination"
