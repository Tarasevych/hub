<#
.SYNOPSIS
  Haalt de nieuwste VERSLEUTELDE back-up van mijn-ruimte-webserver op naar R:\ (pull-model).

.DESCRIPTION
  - Zoekt op de VM de nieuwste map /srv/backups/mijn-ruimte/<JJJJMMDD-UUMMSS>/ met KLAAR.
  - Weigert mappen met onversleutelde bestanden (database.dump / uploads.tar.gz zonder .age).
  - Kopieert met scp naar een tijdelijke map onder C:\Users\t (scp mag niet op T:\/R:\ schrijven
    door Controlled Folder Access), controleert SHA256SUMS en verplaatst daarna met PowerShell naar
    R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>\ (KLAAR als laatste).
  - Al aanwezig en in orde? Dan wordt niets gedaan.
  - Schrijft een regel per run naar <Doel>\ophalen.log.
  - Daarna (ook als ophalen mislukt) scripts\cloud\cloud-reservekopie.ps1: de versleutelde back-ups
    naar Google Drive. Niet gekoppeld (cloud-koppelen.ps1 nog niet gedaan) = alleen een logregel.
    Overslaan met -ZonderCloud.
  Ontsleutelen gebeurt hier NIET; daarvoor is de offline herstelsleutel nodig (zie HERSTEL.md).

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\reservekopie-ophalen.ps1
#>
[CmdletBinding()]
param(
  [string]$Vm = 'beheer@203.0.113.10',
  [string]$Sleutel = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver',
  [string]$BronMap = '/srv/backups/mijn-ruimte',
  [string]$Doel = 'R:\mijn-ruimte-reservekopie\vm-back-ups',
  [string]$Tussenmap = (Join-Path $env:USERPROFILE 'mr-ophalen'),
  [switch]$ZonderCloud
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$log = Join-Path $Doel 'ophalen.log'
function Schrijf-Log([string]$tekst) {
  $regel = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $tekst
  Write-Output $regel
  try { Add-Content -LiteralPath $log -Value $regel -Encoding UTF8 } catch { Write-Warning "log niet schrijfbaar: $_" }
}
function Ssh-Opdracht([string]$opdracht) {
  # Alleen enkele aanhalingstekens in $opdracht: PowerShell 5.1 haalt dubbele weg bij native argumenten.
  $uit = & ssh.exe -i $Sleutel -o BatchMode=yes -o ConnectTimeout=15 $Vm $opdracht
  if ($LASTEXITCODE -ne 0) { throw "ssh mislukt (code $LASTEXITCODE): $opdracht" }
  return @($uit)
}
function Lees-Sommen([string]$map) {
  $sommen = @{}
  foreach ($r in Get-Content -LiteralPath (Join-Path $map 'SHA256SUMS')) {
    if ($r -match '^([0-9a-f]{64}) [ *]?(\S+)$') { $sommen[$Matches[2]] = $Matches[1] }
    elseif ($r.Trim()) { throw "onverwachte regel in SHA256SUMS: $r" }
  }
  if ($sommen.Count -eq 0) { throw 'SHA256SUMS is leeg' }
  return $sommen
}
function Controleer-Map([string]$map) {
  $sommen = Lees-Sommen $map
  foreach ($naam in $sommen.Keys) {
    $pad = Join-Path $map $naam
    if (-not (Test-Path -LiteralPath $pad)) { throw "ontbreekt: $naam" }
    $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $pad).Hash.ToLower()
    if ($h -ne $sommen[$naam]) { throw "hash wijkt af: $naam" }
  }
  foreach ($vereist in 'database.dump.age', 'uploads.tar.gz.age') {
    if (-not $sommen.ContainsKey($vereist)) { throw "geen $vereist in SHA256SUMS (onversleutelde back-up?)" }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $map 'KLAAR'))) { throw 'KLAAR ontbreekt' }
}

function Haal-Op {
  if (-not (Test-Path -LiteralPath $Doel)) { New-Item -ItemType Directory -Path $Doel | Out-Null }

  # 1. Nieuwste volledige back-up op de VM.
  $stempel = (Ssh-Opdracht ('cd ' + $BronMap + ' && for d in 2*/; do d=${d%/}; [ -f $d/KLAAR ] && echo $d; done | sort | tail -n 1') | Select-Object -Last 1)
  if (-not $stempel) { throw "geen back-up met KLAAR gevonden in $BronMap" }
  $stempel = $stempel.Trim()
  if ($stempel -notmatch '^\d{8}-\d{6}$') { throw "onverwachte mapnaam: $stempel" }

  # 2. Alleen versleutelde back-ups.
  $bestanden = Ssh-Opdracht ('ls -1 ' + $BronMap + '/' + $stempel)
  $bestanden = @($bestanden | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  foreach ($verboden in 'database.dump', 'uploads.tar.gz') {
    if ($bestanden -contains $verboden) { throw "$stempel bevat onversleuteld $verboden; niet opgehaald" }
  }
  foreach ($vereist in 'database.dump.age', 'uploads.tar.gz.age', 'SHA256SUMS', 'KLAAR') {
    if ($bestanden -notcontains $vereist) { throw "$stempel mist $vereist; niet opgehaald" }
  }

  # 3. Al aanwezig?
  $eind = Join-Path $Doel $stempel
  if (Test-Path -LiteralPath (Join-Path $eind 'KLAAR')) {
    Controleer-Map $eind
    Schrijf-Log "OK $stempel was al aanwezig en klopt; niets te doen"
    return
  }

  # 4. Ophalen naar de tussenmap (C:\Users\t), controleren, verplaatsen.
  $tmp = Join-Path $Tussenmap $stempel
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  & scp.exe -i $Sleutel -o BatchMode=yes -o ConnectTimeout=15 -p -r ($Vm + ':' + $BronMap + '/' + $stempel + '/*') ($tmp + '\')
  if ($LASTEXITCODE -ne 0) { throw "scp mislukt (code $LASTEXITCODE)" }
  Controleer-Map $tmp

  if (Test-Path -LiteralPath $eind) { Remove-Item -LiteralPath $eind -Recurse -Force }  # half-afgemaakt (geen KLAAR)
  New-Item -ItemType Directory -Path $eind | Out-Null
  Get-ChildItem -LiteralPath $tmp | Where-Object { $_.Name -ne 'KLAAR' } | Move-Item -Destination $eind
  Move-Item -LiteralPath (Join-Path $tmp 'KLAAR') -Destination $eind
  Remove-Item -LiteralPath $tmp -Recurse -Force
  Controleer-Map $eind

  $grootte = [math]::Round(((Get-ChildItem -LiteralPath $eind | Measure-Object Length -Sum).Sum / 1KB), 1)
  Schrijf-Log "OK $stempel opgehaald naar $eind ($grootte KB, SHA256SUMS gecontroleerd)"
}

$code = 0
try { Haal-Op } catch { Schrijf-Log "FOUT $($_.Exception.Message)"; $code = 1 }

# Daarna: versleutelde back-ups naar Google Drive (eigen log: R:\mijn-ruimte-reservekopie\cloud\cloud.log).
$cloud = Join-Path $PSScriptRoot 'cloud\cloud-reservekopie.ps1'
if (-not $ZonderCloud -and (Test-Path -LiteralPath $cloud)) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cloud | Out-Null
  switch ($LASTEXITCODE) {
    0 { Schrijf-Log 'OK cloud: Google Drive bijgewerkt (zie ..\cloud\cloud.log)' }
    3 { Schrijf-Log 'cloud: nog niet gekoppeld (scripts\cloud\cloud-koppelen.ps1)' }
    default { Schrijf-Log "FOUT cloud-upload (code $LASTEXITCODE), zie ..\cloud\cloud.log"; $code = 1 }
  }
}
exit $code
