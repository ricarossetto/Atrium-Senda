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
echo.
echo Iniciando servidor local do ATRIUM na porta 4173...
echo Abrindo seu navegador automaticamente...
echo.
echo [Dica] Mantenha esta janela aberta enquanto utiliza o sistema.
echo [Dica] Para encerrar o ATRIUM, basta fechar esta janela ou pressionar Ctrl+C.
echo ===============================================================
echo.

start "" "http://127.0.0.1:4173"
node server.mjs
