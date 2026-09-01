param(
  [string]$TaskName = 'ATRIUM - Cobertura judicial gerenciada',
  [int]$CadenceMinutes = 30
)

$ErrorActionPreference = 'Stop'
$Runner = Join-Path $PSScriptRoot 'run-collector.ps1'
if (-not (Test-Path -LiteralPath $Runner)) { throw "Executor não encontrado: $Runner" }

$CadenceMinutes = [Math]::Max(30, [Math]::Min(360, $CadenceMinutes))
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $CadenceMinutes)
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances IgnoreNew -RestartCount 0
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
Write-Host "Agendamento '$TaskName' criado com cadência conservadora de $CadenceMinutes minutos. Backoff e intervenção humana são respeitados pelo coletor."
