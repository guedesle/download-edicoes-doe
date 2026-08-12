[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $SkipBuild) {
  Write-Host 'Executando testes...'
  & npm test
  if ($LASTEXITCODE -ne 0) { throw 'npm test falhou.' }

  Write-Host 'Gerando build de produção...'
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'npm run build falhou.' }
}

$dist = Join-Path $repoRoot 'dist'
$manifestPath = Join-Path $dist 'manifest.json'
if (-not (Test-Path $manifestPath)) {
  throw 'dist\manifest.json não encontrado. Execute npm run build antes de empacotar.'
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$versionName = [string]$manifest.version_name
if ([string]::IsNullOrWhiteSpace($versionName)) {
  $versionName = "v$($manifest.version)"
}

# O documento offscreen só deve usar chrome.runtime. Se storage aparecer no bundle,
# a build não é apta para implantação corporativa.
$offscreenJs = Join-Path $dist 'offscreen.js'
if (-not (Test-Path $offscreenJs)) {
  throw 'dist\offscreen.js não encontrado.'
}
$offscreenText = Get-Content $offscreenJs -Raw
$storageMatch = [regex]::Match($offscreenText, 'chrome\.storage')
if ($storageMatch.Success) {
  $start = [Math]::Max(0, $storageMatch.Index - 220)
  $length = [Math]::Min(520, $offscreenText.Length - $start)
  $snippet = $offscreenText.Substring($start, $length)
  Write-Host ''
  Write-Host 'Trecho encontrado em dist\offscreen.js:' -ForegroundColor Yellow
  Write-Host $snippet
  Write-Host ''
  throw 'Build rejeitada: dist\offscreen.js contém referência a chrome.storage. Corrija antes de implantar.'
}

$safeVersion = ($versionName -replace '[^A-Za-z0-9._+-]', '-')
$releaseRoot = Join-Path $repoRoot 'release'
$staging = Join-Path $releaseRoot "download-edicoes-doe-$safeVersion"
$extensionDir = Join-Path $staging 'extension'
$zipPath = Join-Path $releaseRoot "download-edicoes-doe-$safeVersion.zip"
$hashPath = "$zipPath.sha256.txt"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $hashPath) { Remove-Item $hashPath -Force }

New-Item -ItemType Directory -Path $extensionDir -Force | Out-Null
Copy-Item (Join-Path $dist '*') $extensionDir -Recurse -Force

$gitSha = (& git rev-parse HEAD).Trim()
$generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')

@"
Download de Edições DOE
Versão: $versionName
Commit: $gitSha
Empacotado em: $generatedAt

CONTEÚDO
- extension\ : extensão Chrome já compilada; não requer Node/npm.

INSTALAÇÃO MANUAL NO CHROME
1. Extraia este ZIP para uma pasta permanente no perfil do usuário da estação.
2. Abra chrome://extensions.
3. Ative Modo do desenvolvedor.
4. Clique em Carregar sem compactação.
5. Selecione a pasta extension deste pacote.
6. Confira a versão exibida pelo badge da extensão.

Não mova nem apague a pasta extension depois de carregá-la.
Se o Chrome corporativo bloquear Modo do desenvolvedor ou Carregar sem compactação,
a instalação exige política corporativa administrada pela TI.
"@ | Set-Content (Join-Path $staging 'INSTALAR.txt') -Encoding UTF8

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -CompressionLevel Optimal
$hash = Get-FileHash $zipPath -Algorithm SHA256
"$($hash.Hash)  $([IO.Path]::GetFileName($zipPath))" | Set-Content $hashPath -Encoding ASCII

Write-Host ''
Write-Host 'Pacote pronto:'
Write-Host "  $zipPath"
Write-Host 'SHA-256:'
Write-Host "  $($hash.Hash)"
Write-Host "Versão: $versionName"
Write-Host "Commit: $gitSha"
