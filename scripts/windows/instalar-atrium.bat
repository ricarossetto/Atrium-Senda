@echo off
setlocal
chcp 65001 >nul
title ATRIUM 2.1 DEV — Instalador e Preparador Completo

cls
echo ===============================================================
echo   ATRIUM 2.1 DEV — INSTALAÇÃO COMPLETA DO SISTEMA
echo ===============================================================
echo.
echo Este assistente irá preparar todo o ambiente do escritório:
echo   1. Validar Node.js 24 LTS e Corepack/pnpm
echo   2. Instalar dependências verificadas do sistema
echo   3. Baixar o Chromium isolado do Playwright para os coletores
echo   4. Preparar o ambiente; o cache cifrado sera criado na primeira inicializacao
echo   5. Gerar chaves locais seguras de criptografia (AES-256-GCM)
echo.
echo Aguarde, isso pode levar alguns instantes...
echo.

call "%~dp0..\..\ATRIUM.bat" --install-only
set "INSTALL_STATUS=%ERRORLEVEL%"

echo.
if "%INSTALL_STATUS%"=="0" (
    echo ===============================================================
    echo   [SUCESSO] ATRIUM E OMNI-COLLECTOR INSTALADOS COM SUCESSO!
    echo ===============================================================
    echo.
    echo Tudo pronto para trabalhar. Para abrir o sistema:
    echo   - Dê um duplo clique no arquivo: ATRIUM.bat na raiz do projeto
    echo.
    echo O servidor será iniciado e seu navegador abrirá em:
    echo   http://127.0.0.1:4173
    echo ===============================================================
) else (
    echo ===============================================================
    echo   [ERRO] Ocorreu uma falha durante a instalação (Código %INSTALL_STATUS%).
    echo   Verifique as mensagens acima para diagnosticar.
    echo ===============================================================
)

echo.
pause
exit /b %INSTALL_STATUS%
