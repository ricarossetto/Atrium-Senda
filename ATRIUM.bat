@echo off
setlocal
chcp 65001 >nul
title ATRIUM 2.0.0 — Escritório Integrado

pushd "%~dp0" >nul
set "ATRIUM_MODE="

if /I "%~1"=="--doctor" set "ATRIUM_MODE=-Doctor"
if /I "%~1"=="--install-only" set "ATRIUM_MODE=-InstallOnly"
if not "%~1"=="" if not defined ATRIUM_MODE (
  echo [ERRO] Opção desconhecida: %~1
  echo Use ATRIUM.bat, ATRIUM.bat --doctor ou ATRIUM.bat --install-only.
  popd >nul
  exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\atrium-bootstrap.ps1" %ATRIUM_MODE%
set "ATRIUM_EXIT=%ERRORLEVEL%"

if not "%ATRIUM_EXIT%"=="0" (
  echo.
  echo [ERRO] O ATRIUM não pôde concluir a operação. Revise a mensagem acima.
  pause
)

popd >nul
exit /b %ATRIUM_EXIT%
