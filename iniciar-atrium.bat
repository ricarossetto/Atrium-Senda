@echo off
chcp 65001 > nul
title ATRIUM — Escritório Integrado
cls

echo ===============================================================
echo   ATRIUM — ESCRITÓRIO INTEGRADO (MODO DESKTOP LOCAL)
echo ===============================================================
echo.
echo Verificando ambiente de execução...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js não foi encontrado no seu computador.
    echo O ATRIUM requer Node.js 24 ou superior. Instale a versão atual em https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "ATRIUM_NODE_MAJOR=%%V"
if not defined ATRIUM_NODE_MAJOR (
    echo [ERRO] Não foi possível identificar a versão do Node.js instalada.
    pause
    exit /b 1
)

if %ATRIUM_NODE_MAJOR% LSS 24 (
    echo [ERRO] O ATRIUM requer Node.js 24 ou superior.
    echo Atualize o Node.js em https://nodejs.org e tente novamente.
    pause
    exit /b 1
)

echo [OK] Node.js 24 ou superior detectado.
echo Preparando o gerenciador de dependências do ATRIUM...

call corepack --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Corepack não está disponível neste terminal.
    echo O Node.js foi detectado corretamente, mas o Corepack precisa estar acessível no PATH.
    pause
    exit /b 1
)

call corepack pnpm --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Corepack foi encontrado, mas não conseguiu executar o pnpm 11.19.0.
    echo Verifique sua conexão e a configuração do Corepack; o Node.js não precisa ser reinstalado.
    pause
    exit /b 1
)

if not exist node_modules (
    echo.
    echo [Instalação Inicial] Configurando o ATRIUM pela primeira vez no seu computador...
    echo [Instalação Inicial] Instalando dependências necessárias (isso leva menos de 1 minuto)...
    echo.
    call corepack pnpm install --frozen-lockfile
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependências do ATRIUM.
        pause
        exit /b 1
    )
    echo [OK] Dependências instaladas com sucesso!
)

node --input-type=module -e "import { existsSync } from 'node:fs'; import { chromium } from 'playwright'; process.exit(existsSync(chromium.executablePath()) ? 0 : 1);" >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [Instalação Inicial] Preparando o Chromium local usado pelas integrações judiciais...
    call corepack pnpm exec playwright install chromium
    if %errorlevel% neq 0 (
        echo [ERRO] Não foi possível preparar o Chromium local do Playwright.
        echo Verifique sua conexão e tente novamente; não é necessário executar como administrador.
        pause
        exit /b 1
    )
    echo [OK] Chromium local preparado com sucesso!
)

echo.
echo Iniciando servidor seguro do ATRIUM em http://127.0.0.1:4173...
echo.
echo [Dica] Mantenha esta janela aberta enquanto utiliza o sistema.
echo [Dica] Para encerrar o ATRIUM, basta fechar esta janela ou pressionar Ctrl+C.
echo ===============================================================
echo.

:: Dispara rotina em background que aguarda o servidor responder HTTP 200 antes de abrir o navegador
start /b "" powershell.exe -NoProfile -NonInteractive -Command "for ($i=0; $i -lt 35; $i++) { Start-Sleep -Milliseconds 400; try { $res = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/api/auth/status' -UseBasicParsing -TimeoutSec 1; if ($res.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:4173'; break } } catch {} }"

call corepack pnpm start
