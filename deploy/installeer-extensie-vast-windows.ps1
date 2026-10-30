<#
  Mijn Ruimte — extensie in een VASTE, lokale map zetten (UI-011 / BUG-005). Verandert niets in Chrome en niets in het register.
  Waarom: een «uitgepakte» extensie blijft alleen bestaan zolang haar map bij de start van Chrome bestaat. Staat de map in Temp,
  Downloads, OneDrive, op een netwerk-, USB-, SUBST- of versleutelde schijf die later wordt gekoppeld, dan haalt Chrome de extensie
  bij de volgende start weg (bewezen in echte Chrome 156, zie RELEASE-NOTITIES-UI011.md).
  Doelmap: %LOCALAPPDATA%\MijnRuimte\extensie (lokale schijf, per gebruiker, wordt door niets opgeschoond).
  Gebruik:  powershell -ExecutionPolicy Bypass -File .\installeer-extensie-vast-windows.ps1 -Zip "$env:USERPROFILE\Downloads\mijn-ruimte-extension.zip" [-Sha256 <som>]
  Bijwerken = hetzelfde opnieuw draaien (zelfde map) en daarna in chrome://extensions op ↻ klikken. Het id blijft gelijk (vaste `key` in manifest).
#>
param([Parameter(Mandatory=$true)][string]$Zip, [string]$Sha256 = '', [string]$Doelmap = (Join-Path $env:LOCALAPPDATA 'MijnRuimte\extensie'))
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $Zip)) { throw "ZIP niet gevonden: $Zip" }
if ($Sha256) { $h = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower(); if ($h -ne $Sha256.ToLower()) { throw "Controlesom klopt niet ($h)" } }
$tijd = Join-Path $env:TEMP ("mr-ext-" + [guid]::NewGuid())
Expand-Archive -Path $Zip -DestinationPath $tijd -Force
$manifest = Get-ChildItem $tijd -Recurse -Filter manifest.json | Select-Object -First 1
if (-not $manifest) { throw 'Geen manifest.json in de ZIP' }
$m = Get-Content $manifest.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $m.key) { throw 'manifest.json heeft geen vaste key: het id zou veranderen. Gebruik het officiële pakket.' }
New-Item -ItemType Directory -Force -Path $Doelmap | Out-Null
# Alleen de bestanden van de extensie vervangen (de map zelf blijft dezelfde: Chrome kent haar pad).
# Veiligheid: alleen leegmaken als de map leeg is of al DEZE extensie bevat (zelfde key) — nooit een willekeurige map wissen.
$oud = Join-Path $Doelmap 'manifest.json'
$inhoud = @(Get-ChildItem $Doelmap -Force)
if ($inhoud.Count -gt 0) {
  if (-not (Test-Path $oud)) { throw "De map $Doelmap is niet leeg en bevat geen extensie. Kies een lege map." }
  $mo = Get-Content $oud -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($mo.key -ne $m.key) { throw "In $Doelmap staat een andere extensie. Niets gewijzigd." }
  $inhoud | Remove-Item -Recurse -Force
}
Copy-Item -Path (Join-Path $manifest.DirectoryName '*') -Destination $Doelmap -Recurse -Force
Remove-Item $tijd -Recurse -Force
Write-Host "Klaar: versie $($m.version) staat in $Doelmap"
Write-Host 'Eerste keer: chrome://extensions → Ontwikkelaarsmodus aan → «Uitgepakt laden» → kies precies deze map.'
Write-Host 'Bijwerken: in chrome://extensions op ↻ bij «Mijn Ruimte» klikken (of Chrome herstarten).'
