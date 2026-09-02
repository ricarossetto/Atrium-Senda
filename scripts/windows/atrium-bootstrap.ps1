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

function Install-OfficialNodeLts {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Stop-WithError 'O Node.js 24 ou superior não foi encontrado. Instale a versão LTS oficial em https://nodejs.org/ e execute o ATRIUM novamente.'
    }

    Write-Warn 'O Node.js 24 ou superior não foi encontrado.'
    $answer = Read-Host 'Deseja instalar o Node.js LTS oficial pelo Windows Package Manager (winget)? [S/n]'
    if ($answer -and $answer -notmatch '^[sS]') {
        Stop-WithError 'Instalação cancelada. Obtenha o Node.js apenas em https://nodejs.org/ ou pelo pacote OpenJS.NodeJS.LTS do winget.'
    }

    Write-Section 'Instalando Node.js LTS oficial'
    & winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "O winget não concluiu a instalação do Node.js (código $LASTEXITCODE)."
    }
    Refresh-ProcessPath
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
    $required = @('package.json', 'pnpm-lock.yaml', 'server.mjs', 'index.html')
    $missing = @($required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $AtriumRoot $_)) })
    if ($missing.Count -gt 0) {
        Stop-WithError ("Arquivos obrigatórios ausentes: " + ($missing -join ', ') + '. Extraia novamente o ZIP completo da release.')
    }
    Write-Ok 'Arquivos essenciais da distribuição encontrados.'
}

function Assert-Toolchain([switch]$AllowNodeInstall) {
    $nodeMajor = Get-NodeMajor
    if ($null -eq $nodeMajor -and $AllowNodeInstall) {
        Install-OfficialNodeLts
        $nodeMajor = Get-NodeMajor
    }
    if ($null -eq $nodeMajor) {
        Stop-WithError 'Node.js não encontrado. O ATRIUM requer Node.js 24 ou superior.'
    }
    if ($nodeMajor -lt $RequiredNodeMajor) {
        Stop-WithError "Node.js $nodeMajor detectado. Instale o Node.js 24 ou superior em https://nodejs.org/."
    }
    Write-Ok "Node.js $(& node -p 'process.versions.node') detectado."

    if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
        Stop-WithError 'Corepack não encontrado. Use a distribuição oficial do Node.js 24 e confirme que o comando corepack está no PATH.'
    }
    Write-Ok "Corepack $(& corepack --version) detectado."

    $pnpmVersion = (& corepack pnpm --version 2>$null | Select-Object -First 1)
    if ($pnpmVersion -ne $RequiredPnpm) {
        Stop-WithError "Não foi possível preparar pnpm $RequiredPnpm pelo Corepack. Verifique a conexão e execute novamente."
    }
    Write-Ok "pnpm $RequiredPnpm preparado pelo Corepack."
}

function Install-AtriumDependencies {
    $modulesManifest = Join-Path $AtriumRoot 'node_modules\.modules.yaml'
    $lockfile = Join-Path $AtriumRoot 'pnpm-lock.yaml'
    $needsInstall = -not (Test-Path -LiteralPath $modulesManifest)
    if (-not $needsInstall) {
        $needsInstall = (Get-Item -LiteralPath $lockfile).LastWriteTimeUtc -gt (Get-Item -LiteralPath $modulesManifest).LastWriteTimeUtc
    }
    if ($needsInstall) {
        Write-Section 'Instalando dependências verificadas pelo lockfile'
        & corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { Stop-WithError "Falha na instalação das dependências (código $LASTEXITCODE)." }
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
Write-Host 'Mantenha esta janela aberta. Para encerrar, pressione Ctrl+C.'

$browserJob = Start-Job -ArgumentList $AtriumHealthUrl, $AtriumUrl -ScriptBlock {
    param($HealthUrl, $AppUrl)
    for ($attempt = 0; $attempt -lt 75; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 1
            if ($null -ne $response.configured -and $null -ne $response.authenticated) {
                Start-Process $AppUrl
                return
            }
        } catch {}
        Start-Sleep -Milliseconds 400
    }
}

try {
    & corepack pnpm start
    exit $LASTEXITCODE
} finally {
    Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
    Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
}
