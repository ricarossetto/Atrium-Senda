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
    echo Por favor, instale o Node.js v20+ em https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detectado com sucesso.

if not exist node_modules (
    echo.
    echo [Instalação Inicial] Configurando o ATRIUM pela primeira vez no seu computador...
    echo [Instalação Inicial] Instalando dependências necessárias (isso leva menos de 1 minuto)...
    echo.
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependências do ATRIUM.
        pause
        exit /b 1
    )
    echo [OK] Dependências instaladas com sucesso!
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

node server.mjs
