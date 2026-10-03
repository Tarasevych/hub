<#
.SYNOPSIS
  Ververst de offline herstelset (R:\mijn-ruimte-reservekopie\herstelset\) met de nieuwste versleutelde
  back-up, broncode en scripts, en kopieert hem desgewenst naar een externe schijf (-Doel E:\).

.DESCRIPTION
  - Bouwt de set opnieuw op in <Set>.nieuw, controleert alle bronnen (SHA256SUMS), zoekt naar per ongeluk
    meegekomen PRIVESLEUTELS (weigert dan), schrijft SHA256SUMS.txt en wisselt daarna pas om.
  - De age-privesleutel (herstelsleutel-age.txt) en de SSH-privesleutel gaan er NOOIT in.
  - -Doel E:\  : kopieert de set naar E:\mijn-ruimte-herstelset\ en controleert daar alle controlesommen.
  - -HaalEerstOp : haalt eerst de nieuwste back-up van de VM op (reservekopie-ophalen.ps1).

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\herstelset-bijwerken.ps1 -HaalEerstOp -Doel E:\
#>
[CmdletBinding()]
param(
  [string]$Doel,
  [switch]$HaalEerstOp,
  [string]$Project = 'T:\mijn-ruimte',
  [string]$Reserve = 'R:\mijn-ruimte-reservekopie'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$Set = Join-Path $Reserve 'herstelset'
$Bron = Join-Path $Project 'scripts\herstelset'

function Melding([string]$t) { Write-Output ('{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $t) }
function Hash([string]$p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }
function Controleer-Sommen([string]$map, [string]$bestand = 'SHA256SUMS') {
  $pad = Join-Path $map $bestand
  if (-not (Test-Path -LiteralPath $pad)) { throw "geen $bestand in $map" }
  $n = 0
  foreach ($r in Get-Content -LiteralPath $pad) {
    if (-not $r.Trim()) { continue }
    if ($r -notmatch '^([0-9a-fA-F]{64}) [ *]?(.+)$') { throw "onverwachte regel in $pad : $r" }
    $h = $Matches[1].ToLower(); $naam = $Matches[2].Trim()
    $f = Join-Path $map $naam
    if (-not (Test-Path -LiteralPath $f)) { throw "ontbreekt: $f" }
    if ((Hash $f) -ne $h) { throw "controlesom klopt niet: $f" }
    $n++
  }
  if ($n -eq 0) { throw "$pad is leeg" }
  return $n
}
function Nieuwste([string]$map, [string]$filter, [scriptblock]$voorwaarde = { $true }, [switch]$OpNaam) {
  $d = @(Get-ChildItem -LiteralPath $map -Directory -Filter $filter | Where-Object $voorwaarde)
  if ($d.Count -eq 0) { throw "niets gevonden in $map ($filter)" }
  if ($OpNaam) { return ($d | Sort-Object Name | Select-Object -Last 1) }
  return ($d | Sort-Object LastWriteTime | Select-Object -Last 1)
}
function Kopieer-Map([string]$van, [string]$naar) {
  New-Item -ItemType Directory -Force -Path $naar | Out-Null
  Copy-Item -Path (Join-Path $van '*') -Destination $naar -Recurse -Force
}
function Zoek-Privesleutels([string]$map) {
  $fout = @()
  foreach ($f in Get-ChildItem -LiteralPath $map -Recurse -File) {
    if ($f.Name -in @('herstelsleutel-age.txt', 'mijn-ruimte-webserver') -or $f.Extension -in @('.pfx', '.pem', '.key')) { $fout += $f.FullName; continue }
    # Alleen tekstachtige bestanden doorzoeken (age.exe bevat het voorvoegsel zelf als constante).
    if ($f.Extension -notin @('', '.txt', '.md', '.ps1', '.sh', '.pub', '.json', '.env', '.yml', '.yaml', '.service', '.timer', '.conf') -or $f.Length -gt 5MB) { continue }
    $tekst = [IO.File]::ReadAllText($f.FullName)
    if ($tekst.Contains('AGE-SECRET-' + 'KEY-1') -or $tekst -match ('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----')) { $fout += $f.FullName }
  }
  return $fout
}
function Schrijf-Sommen([string]$map) {
  $regels = foreach ($f in Get-ChildItem -LiteralPath $map -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | Sort-Object FullName) {
    '{0}  {1}' -f (Hash $f.FullName), $f.FullName.Substring($map.TrimEnd('\').Length + 1)
  }
  [IO.File]::WriteAllLines((Join-Path $map 'SHA256SUMS.txt'), [string[]]$regels, (New-Object Text.UTF8Encoding $false))
  return @($regels).Count
}
function Controleer-Set([string]$map) {
  $lijst = Join-Path $map 'SHA256SUMS.txt'
  $bekend = @{}
  foreach ($r in Get-Content -LiteralPath $lijst -Encoding UTF8) {
    if ($r -notmatch '^([0-9a-f]{64})  (.+)$') { throw "onverwachte regel: $r" }
    $f = Join-Path $map $Matches[2]; $bekend[$Matches[2]] = 1
    if (-not (Test-Path -LiteralPath $f)) { throw "ontbreekt: $f" }
    if ((Hash $f) -ne $Matches[1]) { throw "controlesom klopt niet: $f" }
  }
  $extra = @(Get-ChildItem -LiteralPath $map -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' -and -not $bekend.ContainsKey($_.FullName.Substring($map.TrimEnd('\').Length + 1)) })
  if ($extra.Count) { throw ('onbekende extra bestanden: ' + (($extra | ForEach-Object FullName) -join ', ')) }
  return $bekend.Count
}
function Wissel([string]$nieuw, [string]$doel) {
  $oud = "$doel.oud"
  if (Test-Path -LiteralPath $oud) { Remove-Item -LiteralPath $oud -Recurse -Force }
  if (Test-Path -LiteralPath $doel) { Rename-Item -LiteralPath $doel -NewName (Split-Path $oud -Leaf) }
  Rename-Item -LiteralPath $nieuw -NewName (Split-Path $doel -Leaf)
  if (Test-Path -LiteralPath $oud) { Remove-Item -LiteralPath $oud -Recurse -Force }
}

# 0. Eventueel eerst de nieuwste back-up ophalen.
if ($HaalEerstOp) {
  Melding 'nieuwste back-up ophalen van de VM...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Project 'scripts\reservekopie-ophalen.ps1')
  if ($LASTEXITCODE -ne 0) { Write-Warning 'ophalen mislukt; de set wordt gemaakt met de nieuwste back-up die al op R:\ staat' }
}

# 1. Nieuwe set opbouwen.
$nieuw = "$Set.nieuw"
if (Test-Path -LiteralPath $nieuw) { Remove-Item -LiteralPath $nieuw -Recurse -Force }
New-Item -ItemType Directory -Path $nieuw | Out-Null

Melding 'handleidingen en hulpscripts'
foreach ($n in '00-BEGIN-HIER-UA.txt', '00-BEGIN-HIER-UA.pdf', '00-BEGIN-HIER-NL.txt', 'controleer-herstelset.ps1') { Copy-Item -LiteralPath (Join-Path $Bron $n) -Destination $nieuw }

Melding 'programmas\age'
Kopieer-Map (Join-Path $Project 'hulpmiddelen\age') (Join-Path $nieuw 'programmas\age')
[void](Controleer-Sommen (Join-Path $nieuw 'programmas\age'))

$bc = Nieuwste (Join-Path $Project 'broncode\zelf-hosten') '2*' { Test-Path (Join-Path $_.FullName 'SHA256SUMS') }
Melding "broncode: $($bc.Name)"
Kopieer-Map $bc.FullName (Join-Path $nieuw 'broncode')
[void](Controleer-Sommen (Join-Path $nieuw 'broncode'))
$db = Nieuwste (Join-Path $Project 'broncode\dashboard') '2*' { Test-Path (Join-Path $_.FullName 'SHA256SUMS') }
Kopieer-Map $db.FullName (Join-Path $nieuw 'broncode\dashboard')
[void](Controleer-Sommen (Join-Path $nieuw 'broncode\dashboard'))

Melding 'scripts'
$sc = Join-Path $nieuw 'scripts'
New-Item -ItemType Directory -Force -Path $sc, "$sc\vm", "$sc\vtpm" | Out-Null
$dp = Nieuwste (Join-Path $Project 'scripts') 'deploy-*'
$zip = @(Get-ChildItem -LiteralPath $dp.FullName -Filter 'scripts-*.zip')
if ($zip.Count) { [void](Controleer-Sommen $dp.FullName); Expand-Archive -LiteralPath $zip[0].FullName -DestinationPath "$sc\deploy-bestanden" }
else { Kopieer-Map $dp.FullName "$sc\deploy-bestanden" }
[void](Controleer-Sommen "$sc\deploy-bestanden")
Copy-Item -LiteralPath (Join-Path $Project 'HERSTEL.md'), (Join-Path $Project 'scripts\reservekopie-ophalen.ps1'), (Join-Path $Project 'scripts\herstelset-bijwerken.ps1'), (Join-Path $Bron 'nieuwe-vm-maken.ps1'), (Join-Path $Bron 'herstel-vm.sh'), (Join-Path $Bron 'ontsleutel-naar-vm.ps1') -Destination $sc
Get-ChildItem -LiteralPath (Join-Path $Project 'scripts') -File | Where-Object { $_.Extension -in '.sh', '.ps1' -and $_.Name -notin 'reservekopie-ophalen.ps1', 'herstelset-bijwerken.ps1' } | Copy-Item -Destination "$sc\vm"
$vt = @(Get-ChildItem -LiteralPath (Join-Path $Project 'scripts') -Directory -Filter 'vtpm-*' | Sort-Object Name | Select-Object -Last 1)
if ($vt.Count) { Kopieer-Map $vt[0].FullName "$sc\vtpm" }

$bu = Nieuwste (Join-Path $Reserve 'vm-back-ups') '2*' { Test-Path (Join-Path $_.FullName 'KLAAR') } -OpNaam
Melding "back-up: $($bu.Name)"
if (-not (Test-Path (Join-Path $bu.FullName 'database.dump.age'))) { throw "$($bu.Name) is niet versleuteld" }
[void](Controleer-Sommen $bu.FullName)
Kopieer-Map $bu.FullName (Join-Path $nieuw "back-ups\database-en-uploads\$($bu.Name)")
$gh = Nieuwste (Join-Path $Reserve 'geheimen') 'geheimen-*' { Test-Path (Join-Path $_.FullName 'SHA256SUMS') } -OpNaam
Melding "geheimenarchief: $($gh.Name)"
[void](Controleer-Sommen $gh.FullName)
Kopieer-Map $gh.FullName (Join-Path $nieuw "back-ups\geheimen\$($gh.Name)")
Copy-Item -LiteralPath (Join-Path $Bron 'back-ups-UITLEG-LEESMIJ.txt') -Destination (Join-Path $nieuw 'back-ups\UITLEG-LEESMIJ.txt')

Melding 'sleutels (alleen uitleg + publieke sleutel)'
New-Item -ItemType Directory -Force -Path (Join-Path $nieuw 'sleutels') | Out-Null
Copy-Item -LiteralPath (Join-Path $Bron 'sleutels-UITLEG-LEESMIJ.txt') -Destination (Join-Path $nieuw 'sleutels\UITLEG-LEESMIJ.txt')
Copy-Item -LiteralPath (Join-Path $Reserve 'sleutels\herstelsleutel-age.pub.txt') -Destination (Join-Path $nieuw 'sleutels')

$versie = @(
  "Herstelset Mijn Ruimte - gemaakt $(Get-Date -Format 'yyyy-MM-dd HH:mm') (pc-tijd, Kyiv)",
  "broncode:             $($bc.Name)",
  "dashboard:            $($db.Name)",
  "scripts:              $($dp.Name)",
  "back-up (db+uploads): $($bu.Name)",
  "geheimenarchief:      $($gh.Name)",
  'GEEN privesleutels in deze set. De age-herstelsleutel staat apart (USB-stick/papier).'
)
[IO.File]::WriteAllLines((Join-Path $nieuw 'VERSIE.txt'), [string[]]$versie, (New-Object Text.UTF8Encoding $true))

$lek = @(Zoek-Privesleutels $nieuw)
if ($lek.Count) { Remove-Item -LiteralPath $nieuw -Recurse -Force; throw ('PRIVESLEUTEL gevonden, set NIET gemaakt: ' + ($lek -join ', ')) }
$n = Schrijf-Sommen $nieuw
[void](Controleer-Set $nieuw)
Wissel $nieuw $Set
$mb = [math]::Round(((Get-ChildItem -LiteralPath $Set -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Melding "herstelset klaar: $Set ($n bestanden, $mb MB, alle controlesommen OK)"

# 2. Eventueel naar een externe schijf.
if ($Doel) {
  $schijf = ([IO.Path]::GetPathRoot($Doel)).ToUpper()
  if ($schijf -in 'C:\', 'D:\', 'T:\', 'R:\') { throw "-Doel $Doel niet toegestaan (kies de externe schijf, bijv. E:\)" }
  if (-not (Test-Path -LiteralPath $schijf)) { throw "schijf $schijf niet gevonden (is de USB-schijf aangesloten?)" }
  $vrij = (Get-PSDrive -Name $schijf.Substring(0, 1)).Free
  if ($vrij -lt ($mb * 1MB * 2)) { throw "te weinig vrije ruimte op $schijf" }
  $eind = Join-Path $Doel 'mijn-ruimte-herstelset'
  $tmp = "$eind.nieuw"
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
  Melding "kopieren naar $eind ..."
  Kopieer-Map $Set $tmp
  $c = Controleer-Set $tmp
  Wissel $tmp $eind
  Melding "OK: $eind ($c bestanden gecontroleerd). Werp de schijf veilig uit voordat je hem loskoppelt."
}
