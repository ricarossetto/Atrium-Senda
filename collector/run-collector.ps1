$ErrorActionPreference = 'Stop'
$ProjectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectDirectory
$env:COLLECTOR_HEADLESS = 'true'
$env:COLLECTOR_INTERACTIVE = 'false'
$env:LOGIN_WAIT_SECONDS = '0'

$NodeCommand = Get-Command node -ErrorAction Stop
$CentralStatusUrl = 'http://127.0.0.1:4173/api/auth/status'
$CentralReady = $false
try {
  $CentralReady = (Invoke-WebRequest -UseBasicParsing -Uri $CentralStatusUrl -TimeoutSec 3).StatusCode -eq 200
} catch { $CentralReady = $false }

if (-not $CentralReady) {
  Start-Process -FilePath $NodeCommand.Source -ArgumentList (Join-Path $ProjectDirectory 'server.mjs') -WorkingDirectory $ProjectDirectory -WindowStyle Hidden
  for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      if ((Invoke-WebRequest -UseBasicParsing -Uri $CentralStatusUrl -TimeoutSec 2).StatusCode -eq 200) { $CentralReady = $true; break }
    } catch { $CentralReady = $false }
  }
}

if (-not $CentralReady) { throw 'A Central local não iniciou a tempo para receber a coleta.' }
& $NodeCommand.Source (Join-Path $PSScriptRoot 'agent.mjs')
if ($LASTEXITCODE -ne 0) { throw "O coletor terminou com código $LASTEXITCODE." }
