[CmdletBinding()]
param(
    [switch]$Doctor,
    [switch]$InstallOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AtriumRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$AtriumUrl = 'http://127.0.0.1:4173'
$AtriumHealthUrl = "$AtriumUrl/api/auth/status"
$RequiredNodeMajor = 24
$RequiredPnpm = '11.19.0'

function Write-Section([string]$Text) {
    Write-Host ''
    Write-Host "== $Text ==" -ForegroundColor DarkYellow
}

function Write-Ok([string]$Text) {
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Warn([string]$Text) {
    Write-Host "[AVISO] $Text" -ForegroundColor Yellow
}

function Stop-WithError([string]$Text, [int]$Code = 1) {
    Write-Host "[ERRO] $Text" -ForegroundColor Red
    exit $Code
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machinePath, $userPath) -join ';'
}

function Get-NodeMajor {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return $null }
    $version = (& node -p "process.versions.node" 2>$null | Select-Object -First 1)
    if (-not $version -or $version -notmatch '^(\d+)\.') { return $null }
    return [int]$Matches[1]
}

function Install-OfficialNodeLts([AllowNull()][object]$CurrentMajor = $null) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Stop-WithError 'O Node.js 24 ou superior não foi encontrado e o winget não está disponível. Instale o App Installer da Microsoft Store ou o Node.js LTS oficial em https://nodejs.org/ e execute o ATRIUM novamente.'
    }

    $description = if ($null -eq $CurrentMajor) { 'não foi encontrado' } else { "major $CurrentMajor é anterior ao mínimo 24" }
    Write-Warn "O Node.js $description."
    $answer = Read-Host 'Deseja instalar ou atualizar para o Node.js LTS oficial pelo Windows Package Manager (winget)? [S/n]'
    if ($answer -and $answer -notmatch '^[sS]') {
        Stop-WithError 'Instalação cancelada. Obtenha o Node.js apenas em https://nodejs.org/ ou pelo pacote OpenJS.NodeJS.LTS do winget.'
    }

    Write-Section 'Instalando ou atualizando Node.js LTS oficial'
    $verb = if ($null -eq $CurrentMajor) { 'install' } else { 'upgrade' }
    & winget $verb --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0 -and $verb -eq 'upgrade') {
        Write-Warn 'O upgrade direto não foi concluído; tentando a instalação oficial forçada do pacote LTS.'
        & winget install --id OpenJS.NodeJS.LTS --exact --source winget --force --accept-package-agreements --accept-source-agreements
    }
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "O winget não concluiu a instalação/atualização do Node.js (código $LASTEXITCODE)."
    }
    Refresh-ProcessPath
}

function Get-DependencyFingerprint {
    return (Get-FileHash -LiteralPath (Join-Path $AtriumRoot 'pnpm-lock.yaml') -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-DependenciesReady {
    $modulesManifest = Join-Path $AtriumRoot 'node_modules\.modules.yaml'
    $installStamp = Join-Path $AtriumRoot 'node_modules\.atrium-install.json'
    if (-not (Test-Path -LiteralPath $modulesManifest) -or -not (Test-Path -LiteralPath $installStamp)) { return $false }
    try {
        $stamp = Get-Content -LiteralPath $installStamp -Raw | ConvertFrom-Json
        return $stamp.lockfileSha256 -eq (Get-DependencyFingerprint) -and $stamp.pnpmVersion -eq $RequiredPnpm
    } catch {
        return $false
    }
}

function Save-DependencyStamp {
    $installStamp = Join-Path $AtriumRoot 'node_modules\.atrium-install.json'
    [pscustomobject]@{
        lockfileSha256 = Get-DependencyFingerprint
        pnpmVersion = $RequiredPnpm
        preparedAt = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $installStamp -Encoding UTF8
}

function Get-AtriumServerState {
    try {
        $response = Invoke-RestMethod -Uri $AtriumHealthUrl -Method Get -TimeoutSec 2
        if ($null -ne $response.configured -and $null -ne $response.authenticated) { return 'atrium' }
        return 'other'
    } catch {
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $connect = $client.ConnectAsync('127.0.0.1', 4173)
            if ($connect.Wait(350) -and $client.Connected) {
                $client.Dispose()
                return 'other'
            }
            $client.Dispose()
        } catch {}
        return 'free'
    }
}

function Test-ChromiumReady {
    if (-not (Test-Path -LiteralPath (Join-Path $AtriumRoot 'node_modules'))) { return $false }
    & node --input-type=module -e "import { existsSync } from 'node:fs'; import { chromium } from 'playwright'; process.exit(existsSync(chromium.executablePath()) ? 0 : 1);" 2>$null
    return $LASTEXITCODE -eq 0
}

function Assert-RequiredFiles {
    $required = @('package.json', 'pnpm-lock.yaml', 'server.mjs', 'index.html', 'scripts\windows\atrium-server.ps1')
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $AtriumRoot $_)) })
    if ($missing.Count -gt 0) {
        Stop-WithError ("Arquivos obrigatórios ausentes: " + ($missing -join ', ') + '. Extraia novamente o ZIP completo da release.')
    }
    Write-Ok 'Arquivos essenciais da distribuição encontrados.'
}

function Assert-Toolchain([switch]$AllowNodeInstall) {
    $nodeMajor = Get-NodeMajor
    if (($null -eq $nodeMajor -or $nodeMajor -lt $RequiredNodeMajor) -and $AllowNodeInstall) {
        Install-OfficialNodeLts -CurrentMajor $nodeMajor
        $nodeMajor = Get-NodeMajor
    }
    if ($null -eq $nodeMajor) {
        Stop-WithError 'Node.js não encontrado. O ATRIUM requer Node.js 24 ou superior.'
    }
    if ($nodeMajor -lt $RequiredNodeMajor) {
        Stop-WithError "Node.js $nodeMajor detectado após a tentativa de atualização. O ATRIUM requer Node.js 24 ou superior."
    }
    Write-Ok "Node.js $(& node -p 'process.versions.node') detectado."

    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        Stop-WithError 'Corepack não encontrado. Use a distribuição oficial do Node.js 24 e confirme que o comando corepack está no PATH.'
    }
    $pnpmVersion = (& corepack pnpm --version 2>$null | Select-Object -First 1)
    if ($pnpmVersion -ne $RequiredPnpm -and $AllowNodeInstall) {
        & corepack enable
        if ($LASTEXITCODE -ne 0) { Stop-WithError 'Não foi possível habilitar o Corepack para esta instalação do Node.js.' }
        & corepack prepare "pnpm@$RequiredPnpm" --activate
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Não foi possível preparar pnpm $RequiredPnpm pelo Corepack." }
        $pnpmVersion = (& corepack pnpm --version 2>$null | Select-Object -First 1)
    }
    if ($pnpmVersion -ne $RequiredPnpm) {
        Stop-WithError "pnpm $RequiredPnpm não está preparado. Execute ATRIUM.bat --install-only para concluir a instalação."
    }
    Write-Ok "Corepack $(& corepack --version) detectado."
    Write-Ok "pnpm $RequiredPnpm preparado pelo Corepack."
}

function Install-AtriumDependencies {
    $needsInstall = -not (Test-DependenciesReady)
    if ($needsInstall) {
        Write-Section 'Instalando dependências verificadas pelo lockfile'
        & corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Falha na instalação das dependências (código $LASTEXITCODE)." }
        Save-DependencyStamp
        Write-Ok 'Dependências instaladas sem alterar o lockfile.'
    } else {
        Write-Ok 'Dependências já estão preparadas.'
    }

    if (-not (Test-ChromiumReady)) {
        Write-Section 'Preparando Chromium local do Playwright'
        & corepack pnpm exec playwright install chromium
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Falha ao preparar o Chromium (código $LASTEXITCODE)." }
        Write-Ok 'Chromium local preparado.'
    } else {
        Write-Ok 'Chromium local do Playwright já está disponível.'
    }
}

function Wait-AtriumHealthy([System.Diagnostics.Process]$ServerProcess, [int]$TimeoutSeconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ((Get-AtriumServerState) -eq 'atrium') { return $true }
        if ($ServerProcess.HasExited) {
            Stop-WithError "O processo do ATRIUM terminou antes do health check (código $($ServerProcess.ExitCode))."
        }
        Start-Sleep -Milliseconds 500
    }
    Stop-WithError "O ATRIUM não respondeu em $AtriumHealthUrl dentro de $TimeoutSeconds segundos. Revise a janela do servidor."
}

function Start-AtriumServerProcess {
    $serverLauncher = Join-Path $PSScriptRoot 'atrium-server.ps1'
    if (-not (Test-Path -LiteralPath $serverLauncher)) {
        Stop-WithError 'O launcher interno do servidor não foi encontrado.'
    }
    $quotedLauncher = '"' + $serverLauncher.Replace('"', '""') + '"'
    return Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedLauncher
    ) -WorkingDirectory $AtriumRoot -WindowStyle Normal -PassThru
}

function Invoke-Doctor {
    Write-Section 'Diagnóstico não destrutivo'
    Assert-RequiredFiles
    Assert-Toolchain
    if (Test-ChromiumReady) { Write-Ok 'Chromium local do Playwright disponível.' } else { Write-Warn 'Chromium ausente; execute ATRIUM.bat --install-only para prepará-lo.' }

    $serverState = Get-AtriumServerState
    if ($serverState -eq 'atrium') { Write-Ok 'ATRIUM já responde com saúde na porta 4173.' }
    elseif ($serverState -eq 'free') { Write-Ok 'Porta 4173 disponível para o ATRIUM.' }
    else { Write-Warn 'A porta 4173 está ocupada por outro serviço. Encerre-o ou configure outra porta manualmente.' }

    Write-Host ''
    Write-Host 'Diagnóstico concluído. Nenhum servidor foi iniciado e nenhum dado foi alterado.'
}

Write-Host '==============================================================='
Write-Host '  ATRIUM 2.0.0 — ESCRITÓRIO INTEGRADO'
Write-Host '==============================================================='

if (-not [Environment]::OSVersion.Platform.ToString().StartsWith('Win')) {
    Stop-WithError 'Este inicializador é exclusivo para Windows. Em outros sistemas, use corepack pnpm start.'
}

Set-Location -LiteralPath $AtriumRoot

if ($Doctor) {
    Invoke-Doctor
    exit 0
}

Assert-RequiredFiles
Assert-Toolchain -AllowNodeInstall
Install-AtriumDependencies

if ($InstallOnly) {
    Write-Host ''
    Write-Ok 'Instalação local concluída. Nenhum servidor foi iniciado e os dados existentes foram preservados.'
    exit 0
}

$serverState = Get-AtriumServerState
if ($serverState -eq 'atrium') {
    Write-Ok 'O ATRIUM já está em execução. Abrindo o navegador sem iniciar outro servidor.'
    Start-Process $AtriumUrl
    exit 0
}
if ($serverState -eq 'other') {
    Stop-WithError 'A porta 4173 está ocupada por outro serviço. Encerre-o ou use PORT em uma execução manual.'
}

Write-Section 'Iniciando o ATRIUM'
Write-Host 'Os segredos locais ausentes serão gerados pelo servidor sem sobrescrever o arquivo .env.'
$serverProcess = Start-AtriumServerProcess
Wait-AtriumHealthy -ServerProcess $serverProcess -TimeoutSeconds 90 | Out-Null
Write-Ok 'Servidor saudável em http://127.0.0.1:4173/api/auth/status.'
Start-Process $AtriumUrl
Write-Ok 'Navegador aberto automaticamente. A janela do servidor deve permanecer aberta durante o uso.'
exit 0
