# installeer-nat-bewaker.ps1 - Mijn Ruimte (NAT-001)
# Eenmalig uitvoeren in PowerShell "Als administrator" op de Windows-host van de VM.
# Maakt (of vervangt) de geplande taak 'Mijn Ruimte - NAT-bewaker':
#  - draait als SYSTEM (nodig om winnat te mogen herstarten);
#  - 1 minuut na het opstarten van Windows en daarna elke 5 minuten;
#  - voert nat-bewaker.ps1 uit de map van dit script uit.
# Verwijderen: Unregister-ScheduledTask -TaskName 'Mijn Ruimte - NAT-bewaker' -Confirm:$false

param(
    [string]$NatNaam = 'mijn-ruimte-nat',
    [string]$LogMap  = ''   # leeg = map 'logboek' naast nat-bewaker.ps1
)

$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'FOUT: open PowerShell met "Als administrator uitvoeren" en probeer opnieuw.' -ForegroundColor Red
    Write-Host 'ПОМИЛКА: відкрийте PowerShell через «Запуск від імені адміністратора» і повторіть.' -ForegroundColor Red
    exit 1
}

$script = Join-Path $PSScriptRoot 'nat-bewaker.ps1'
if (-not (Test-Path $script)) { Write-Host "FOUT: $script niet gevonden." -ForegroundColor Red; exit 1 }
if (-not (Get-NetNat -Name $NatNaam -ErrorAction SilentlyContinue)) {
    Write-Host "FOUT: NAT '$NatNaam' bestaat niet op deze pc. Geef de juiste naam met -NatNaam." -ForegroundColor Red; exit 1
}

$args2 = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -NatNaam `"$NatNaam`""
if ($LogMap) { $args2 += " -LogMap `"$LogMap`"" }

$naam  = 'Mijn Ruimte - NAT-bewaker'
$actie = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $args2

$bijStart = New-ScheduledTaskTrigger -AtStartup
$bijStart.Delay = 'PT1M'
$herhaal = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5)

$wie  = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$inst = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

Register-ScheduledTask -TaskName $naam -Action $actie -Trigger @($bijStart, $herhaal) `
    -Principal $wie -Settings $inst -Description 'Herstart winnat als de NAT voor de Mijn Ruimte-VM geen extern adres heeft (voorkomt Cloudflare-fout 1033 na herstart).' -Force | Out-Null

Write-Host "Taak '$naam' is geregistreerd." -ForegroundColor Green
Start-ScheduledTask -TaskName $naam
Start-Sleep -Seconds 8
$info = Get-ScheduledTaskInfo -TaskName $naam
Write-Host ("Eerste run: {0}, resultaat {1} (0 = in orde)" -f $info.LastRunTime, $info.LastTaskResult)
$lm = if ($LogMap) { $LogMap } else { Join-Path $PSScriptRoot 'logboek' }
Write-Host "Logboek: $(Join-Path $lm 'nat-bewaker.log') (alleen bij problemen of herstel)"
