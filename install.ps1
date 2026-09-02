[CmdletBinding()]
param(
    [string]$ReleaseTag = 'v2.0.0',
    [string]$InstallDirectory = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ATRIUM')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repository = 'ricarossetto/Atrium-Senda'
$ArchiveUrl = "https://github.com/$Repository/archive/refs/tags/$ReleaseTag.zip"
$ResolvedInstallDirectory = [System.IO.Path]::GetFullPath($InstallDirectory)
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("atrium-install-" + [Guid]::NewGuid().ToString('N'))

function Stop-Install([string]$Message) {
    Write-Host "[ERRO] $Message" -ForegroundColor Red
    throw $Message
}

if ($ReleaseTag -notmatch '^v\d+\.\d+\.\d+$') {
    Stop-Install 'Informe uma tag estável no formato v2.0.0.'
}

if (Test-Path -LiteralPath $ResolvedInstallDirectory) {
    Write-Host "Já existe uma instalação em $ResolvedInstallDirectory." -ForegroundColor Yellow
    $Confirmation = Read-Host 'Deseja atualizar somente os arquivos do aplicativo, preservando .env e data? [s/N]'
    if ($Confirmation -notmatch '^[sS]$') { Stop-Install 'Atualização cancelada; nenhum arquivo foi alterado.' }
}

New-Item -ItemType Directory -Path $TemporaryDirectory -Force | Out-Null
try {
    $ArchivePath = Join-Path $TemporaryDirectory 'atrium.zip'
    Write-Host "Baixando ATRIUM $ReleaseTag do repositório oficial..." -ForegroundColor DarkYellow
    Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath -UseBasicParsing
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $TemporaryDirectory -Force

    $SourceDirectory = Get-ChildItem -LiteralPath $TemporaryDirectory -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'ATRIUM.bat') } |
        Select-Object -First 1
    if (-not $SourceDirectory) { Stop-Install 'O pacote baixado não contém uma distribuição válida do ATRIUM.' }

    New-Item -ItemType Directory -Path $ResolvedInstallDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath $SourceDirectory.FullName -Force | ForEach-Object {
        if ($_.Name -in @('.env', '.env.collector', 'data')) { return }
        Copy-Item -LiteralPath $_.FullName -Destination $ResolvedInstallDirectory -Recurse -Force
    }

    $Bootstrap = Join-Path $ResolvedInstallDirectory 'scripts\windows\atrium-bootstrap.ps1'
    if (-not (Test-Path -LiteralPath $Bootstrap)) { Stop-Install 'O inicializador do Windows não foi encontrado no pacote.' }
    Write-Host 'Arquivos instalados. Preparando dependências e iniciando o ATRIUM...' -ForegroundColor Green
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Bootstrap
    exit $LASTEXITCODE
} finally {
    if (Test-Path -LiteralPath $TemporaryDirectory) {
        Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
