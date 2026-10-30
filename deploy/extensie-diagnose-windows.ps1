<#
  Mijn Ruimte — diagnose «extensie verdwijnt na herstart van Chrome» (UI-011 / BUG-005). ALLEEN LEZEN.
  Verandert niets: geen register, geen Chrome-bestanden, geen rechten. Sluit Chrome NIET af nodig.
  Schrijft een kort rapport (zonder wachtwoorden, cookies of geschiedenis) naar het bureaublad: MijnRuimte-extensie-diagnose.txt
  Gebruik (PowerShell, gewone gebruiker):  powershell -ExecutionPolicy Bypass -File .\extensie-diagnose-windows.ps1
#>
param([string]$Id = 'ofpffonakgjioahgfejmiblfmbkobmmi')
$ErrorActionPreference = 'Continue'
$uit = New-Object System.Collections.Generic.List[string]
function R($t) { $uit.Add($t) | Out-Null; Write-Host $t }
R "Mijn Ruimte extensie-diagnose $(Get-Date -Format s)  (id $Id)"
R "Windows: $([Environment]::OSVersion.VersionString)  gebruiker: $env:USERNAME"

$basis = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
if (-not (Test-Path $basis)) { R "Chrome-profielmap niet gevonden: $basis" }
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { R "Chrome: $chrome  versie $((Get-Item $chrome).VersionInfo.ProductVersion)" }

# 1. Profielen (verandert het profiel tussen starts?)
try {
  $ls = Get-Content (Join-Path $basis 'Local State') -Raw -Encoding UTF8 | ConvertFrom-Json
  R "Laatst gebruikt profiel: $($ls.profile.last_used)"
  foreach ($p in $ls.profile.info_cache.PSObject.Properties) { R "  profiel $($p.Name): naam '$($p.Value.name)'" }
} catch { R "Local State niet leesbaar: $($_.Exception.Message)" }

# 2. Per profiel: staat de extensie geregistreerd, waar, en bestaat die map nog?
function Schijfsoort($pad) {
  try {
    $letter = (Split-Path $pad -Qualifier)
    $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$letter'" -ErrorAction Stop
    $soort = @{0='onbekend';1='geen root';2='VERWISSELBAAR (USB)';3='lokaal';4='NETWERK';5='cd/dvd';6='RAM-schijf'}[[int]$d.DriveType]
    $subst = (subst) -match "^$letter"
    return "$letter = $soort$(if ($subst) { ' (SUBST-schijf: ' + $subst + ')' })"
  } catch { return "schijf onbekend" }
}
$gevonden = $false
Get-ChildItem $basis -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' } | ForEach-Object {
  $prof = $_.FullName
  foreach ($bestand in 'Secure Preferences', 'Preferences') {
    $f = Join-Path $prof $bestand
    if (-not (Test-Path $f)) { continue }
    try { $j = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json } catch { R "  $($_.Name)/$bestand niet leesbaar"; continue }
    if ($bestand -eq 'Preferences') { R "[$(Split-Path $prof -Leaf)] ontwikkelaarsmodus: $($j.extensions.ui.developer_mode)" }
    $e = $j.extensions.settings.$Id
    if ($e) {
      $gevonden = $true
      $loc = @{1='intern (Web Store/CRX)';3='extern beleid';4='UITGEPAKT (Load unpacked)';5='beleid (force-install)';8='opdrachtregel'}[[int]$e.location]
      R "[$(Split-Path $prof -Leaf)] $bestand : location=$($e.location) ($loc) state=$($e.state) disable_reasons=$($e.disable_reasons) from_webstore=$($e.from_webstore)"
      if ($e.path) {
        $pad = [string]$e.path
        R "   map: $pad"
        R "   map bestaat: $(Test-Path $pad)   manifest.json: $(Test-Path (Join-Path $pad 'manifest.json'))   $(Schijfsoort $pad)"
        if ($pad -like "$env:TEMP*" -or $pad -like '*\Temp\*' -or $pad -like '*Temp1_*') { R '   !!! map staat in een TIJDELIJKE map (Windows/opschoning wist die)' }
        if ($pad -like "$env:USERPROFILE\Downloads*") { R '   !  map staat in Downloads (Opslaginzicht/opruimprogramma’s kunnen die wissen)' }
        if ($pad -like '*OneDrive*') { R '   !  map staat in OneDrive (bestanden op aanvraag kunnen bij de start ontbreken)' }
      }
    }
  }
}
if (-not $gevonden) { R "De extensie $Id staat in GEEN profiel geregistreerd (Chrome heeft het record verwijderd of het is een ander profiel)." }

# 3. Beleid (policy) dat extensies kan blokkeren of verwijderen
foreach ($sleutel in 'HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKCU:\SOFTWARE\Policies\Google\Chrome') {
  if (Test-Path $sleutel) {
    R "Beleid $sleutel :"
    (Get-ItemProperty $sleutel).PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { R "   $($_.Name) = $($_.Value)" }
    foreach ($sub in 'ExtensionInstallBlocklist', 'ExtensionInstallAllowlist', 'ExtensionInstallForcelist', 'ExtensionInstallSources') {
      $s = Join-Path $sleutel $sub
      if (Test-Path $s) { (Get-ItemProperty $s).PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { R "   $sub[$($_.Name)] = $($_.Value)" } }
    }
  }
}
# 4. Opslaginzicht (Storage Sense) — wist het Downloads/Temp?
$ss = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy'
if (Test-Path $ss) { $p = Get-ItemProperty $ss; R "Opslaginzicht aan: $($p.'01')  Downloads wissen na dagen: $($p.'512')  tijdelijke bestanden: $($p.'04')" }
# 5. Gebeurtenissen van Chrome (laatste 14 dagen, alleen bron Chrome)
try { Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='Chrome'; StartTime=(Get-Date).AddDays(-14)} -MaxEvents 20 -ErrorAction Stop | ForEach-Object { R "event $($_.TimeCreated): $($_.Message.Substring(0,[Math]::Min(200,$_.Message.Length)))" } } catch { R 'Geen Chrome-gebeurtenissen in het logboek (normaal).' }

$doel = Join-Path ([Environment]::GetFolderPath('Desktop')) 'MijnRuimte-extensie-diagnose.txt'
$uit | Set-Content -Path $doel -Encoding UTF8
R "Rapport opgeslagen: $doel"
