param(
  [string]$TaskName = 'Keller Central - Coleta diaria',
  [string]$DailyAt = '06:30'
)

$ErrorActionPreference = 'Stop'
$Runner = Join-Path $PSScriptRoot 'run-collector.ps1'
if (-not (Test-Path -LiteralPath $Runner)) { throw "Executor não encontrado: $Runner" }

$At = [datetime]::ParseExact($DailyAt, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $At
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
Write-Host "Agendamento '$TaskName' criado para $DailyAt. Ele usa apenas a sessão local do Windows."
