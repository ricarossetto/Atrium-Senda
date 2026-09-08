@echo off
setlocal
chcp 65001 >nul
title ATRIUM 2.1 DEV — Escritório Integrado

cls
echo ===============================================================
echo   ATRIUM 2.1 DEV — INICIALIZANDO ESCRITÓRIO INTEGRADO
echo ===============================================================
echo.
echo Verificando integridade do ambiente e iniciando servidores locais...
echo.

call "%~dp0..\..\ATRIUM.bat" %*
exit /b %ERRORLEVEL%
