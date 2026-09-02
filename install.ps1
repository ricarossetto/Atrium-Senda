[CmdletBinding()]
param(
    [string]$ReleaseTag = 'v2.0.0',
    [string]$SourceRef = '',
    [string]$InstallDirectory = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ATRIUM')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repository = 'ricarossetto/Atrium-Senda'
$ResolvedInstallDirectory = [System.IO.Path]::GetFullPath($InstallDirectory)
$TemporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("atrium-install-" + [Guid]::NewGuid().ToString('N'))

function Stop-Install([string]$Message) {
    Write-Host "[ERRO] $Message" -ForegroundColor Red
    throw $Message
}

function Resolve-OfficialArchive {
    if ($SourceRef) {
        if ($SourceRef -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$' -or
            $SourceRef.Contains('..') -or $SourceRef.Contains('//') -or
            $SourceRef.StartsWith('/') -or $SourceRef.EndsWith('/')) {
            Stop-Install 'SourceRef inválido. Use somente o nome de uma branch do repositório oficial.'
        }
        return [pscustomobject]@{
            Label = "branch $SourceRef"
            Url = "https://github.com/$Repository/archive/refs/heads/$SourceRef.zip"
            ExpectedVersion = $null
        }
    }

    if ($ReleaseTag -notmatch '^v\d+\.\d+\.\d+$') {
        Stop-Install 'Informe uma tag estável no formato v2.0.0.'
    }
    return [pscustomobject]@{
        Label = "release $ReleaseTag"
        Url = "https://github.com/$Repository/archive/refs/tags/$ReleaseTag.zip"
        ExpectedVersion = $ReleaseTag.Substring(1)
    }
}

function Assert-DownloadedPackage([string]$SourceDirectory, [AllowNull()][string]$ExpectedVersion) {
    foreach ($relativePath in @('ATRIUM.bat', 'package.json', 'pnpm-lock.yaml', 'server.mjs', 'index.html', 'scripts\windows\atrium-bootstrap.ps1', 'scripts\windows\atrium-server.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $SourceDirectory $relativePath))) {
            Stop-Install "O pacote oficial está incompleto: $relativePath não foi encontrado."
        }
    }
    try {
        $package = Get-Content -LiteralPath (Join-Path $SourceDirectory 'package.json') -Raw | ConvertFrom-Json
    } catch {
        Stop-Install 'O package.json do pacote oficial é inválido.'
    }
    if ($package.name -ne 'atrium' -or $package.version -notmatch '^\d+\.\d+\.\d+$') {
        Stop-Install 'O pacote baixado não foi reconhecido como uma distribuição do ATRIUM.'
    }
    if ($ExpectedVersion -and $package.version -ne $ExpectedVersion) {
        Stop-Install "A versão do pacote ($($package.version)) não corresponde à tag solicitada ($ExpectedVersion)."
    }
}

function New-AtriumShortcut([string]$ShortcutPath) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = Join-Path $ResolvedInstallDirectory 'ATRIUM.bat'
    $shortcut.WorkingDirectory = $ResolvedInstallDirectory
    $shortcut.Description = 'ATRIUM — Escritório Integrado'
    $shortcut.WindowStyle = 1
    $shortcut.IconLocation = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe,0"
    $shortcut.Save()
}

function Install-AtriumShortcuts {
    $desktopDirectory = [Environment]::GetFolderPath('Desktop')
    $startMenuDirectory = [Environment]::GetFolderPath('Programs')
    if ([string]::IsNullOrWhiteSpace($desktopDirectory) -or [string]::IsNullOrWhiteSpace($startMenuDirectory)) {
        Stop-Install 'O Windows não informou os diretórios da Área de Trabalho e do Menu Iniciar.'
    }
    New-AtriumShortcut (Join-Path $desktopDirectory 'ATRIUM.lnk')
    New-AtriumShortcut (Join-Path $startMenuDirectory 'ATRIUM.lnk')
    Write-Host '[OK] Atalhos ATRIUM criados na Área de Trabalho e no Menu Iniciar.' -ForegroundColor Green
    Write-Host '[INFO] Como o pacote não inclui um .ico oficial, os atalhos usam o ícone nativo do Windows PowerShell.' -ForegroundColor DarkGray
}

$source = Resolve-OfficialArchive
$installRoot = [System.IO.Path]::GetPathRoot($ResolvedInstallDirectory)
if ($ResolvedInstallDirectory.TrimEnd('\') -eq $installRoot.TrimEnd('\')) {
    Stop-Install 'O diretório de instalação não pode ser a raiz de uma unidade.'
}

if (Test-Path -LiteralPath $ResolvedInstallDirectory) {
    Write-Host "Já existe uma instalação em $ResolvedInstallDirectory." -ForegroundColor Yellow
    $confirmation = Read-Host 'Deseja atualizar somente os arquivos do aplicativo, preservando .env, .env.collector e data? [s/N]'
    if ($confirmation -notmatch '^[sS]$') { Stop-Install 'Atualização cancelada; nenhum arquivo foi alterado.' }
}

New-Item -ItemType Directory -Path $TemporaryDirectory -Force | Out-Null
try {
    $archivePath = Join-Path $TemporaryDirectory 'atrium.zip'
    Write-Host "Baixando ATRIUM ($($source.Label)) do repositório oficial..." -ForegroundColor DarkYellow
    Invoke-WebRequest -Uri $source.Url -OutFile $archivePath -UseBasicParsing
    if (-not (Test-Path -LiteralPath $archivePath) -or (Get-Item -LiteralPath $archivePath).Length -lt 1024) {
        Stop-Install 'O download do pacote oficial está vazio ou incompleto.'
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $TemporaryDirectory -Force

    $sourceDirectory = Get-ChildItem -LiteralPath $TemporaryDirectory -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'ATRIUM.bat') } |
        Select-Object -First 1
    if (-not $sourceDirectory) { Stop-Install 'O pacote baixado não contém uma distribuição válida do ATRIUM.' }
    Assert-DownloadedPackage $sourceDirectory.FullName $source.ExpectedVersion

    New-Item -ItemType Directory -Path $ResolvedInstallDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath $sourceDirectory.FullName -Force | ForEach-Object {
        if ($_.Name -in @('.env', '.env.collector', 'data')) { return }
        Copy-Item -LiteralPath $_.FullName -Destination $ResolvedInstallDirectory -Recurse -Force
    }

    $bootstrap = Join-Path $ResolvedInstallDirectory 'scripts\windows\atrium-bootstrap.ps1'
    if (-not (Test-Path -LiteralPath $bootstrap)) { Stop-Install 'O inicializador do Windows não foi encontrado no pacote instalado.' }

    Write-Host 'Arquivos validados. Preparando dependências do ATRIUM...' -ForegroundColor Green
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $bootstrap -InstallOnly
    if ($LASTEXITCODE -ne 0) { Stop-Install "A preparação do ATRIUM falhou com o código $LASTEXITCODE." }

    Install-AtriumShortcuts

    Write-Host 'Iniciando o ATRIUM e aguardando o servidor ficar saudável...' -ForegroundColor DarkYellow
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $bootstrap
    if ($LASTEXITCODE -ne 0) { Stop-Install "O ATRIUM não iniciou corretamente (código $LASTEXITCODE)." }

    Write-Host ''
    Write-Host 'ATRIUM instalado com sucesso. O navegador foi aberto automaticamente.' -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $TemporaryDirectory) {
        Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
