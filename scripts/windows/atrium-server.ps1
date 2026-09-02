[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$AtriumRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Set-Location -LiteralPath $AtriumRoot

Write-Host '==============================================================='
Write-Host '  ATRIUM 2.0.0 — SERVIDOR LOCAL'
Write-Host '==============================================================='
Write-Host 'Mantenha esta janela aberta enquanto estiver usando o ATRIUM.'
Write-Host ''

try {
    & corepack pnpm start
    $serverExitCode = $LASTEXITCODE
} catch {
    Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
    $serverExitCode = 1
}

if ($serverExitCode -ne 0) {
    Write-Host ''
    Write-Host "[ERRO] O servidor ATRIUM terminou com o código $serverExitCode." -ForegroundColor Red
    Read-Host 'Pressione Enter para fechar esta janela'
}

exit $serverExitCode
