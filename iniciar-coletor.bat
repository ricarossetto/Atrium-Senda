@echo off
chcp 65001 > nul
title ATRIUM — Agente Coletor Judicial
cls

echo ===============================================================
echo   ATRIUM — AGENTE COLETOR JUDICIAL (A1 + TRIBUNAIS)
echo ===============================================================
echo.
echo Verificando ambiente de execução...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js não foi encontrado no seu computador.
    pause
    exit /b 1
)

echo [OK] Iniciando sincronização do acervo com navegadores isolados...
echo.
node collector/agent.mjs
echo.
echo Sincronização finalizada com sucesso.
pause
