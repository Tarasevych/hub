<#
.SYNOPSIS
  Zet de VERSLEUTELDE back-ups van Mijn Ruimte dagelijks op Google Drive (rclone, scope drive.file).

.DESCRIPTION
  Draait na reservekopie-ophalen.ps1 (dezelfde geplande taak, 09:00). Uploadt naar
  <Remote> = gdrive:mijn-ruimte-reservekopie:
    dagelijks\<JJJJMMDD-UUMMSS>\   database.dump.age, uploads.tar.gz.age, SHA256SUMS
    geheimen\geheimen-<stempel>\   *.tar.age, *.sha256, SHA256SUMS
    herstelset\                    herstelset-<stempel>.zip.age (+ .sha256): de hele offline
                                   herstelset als age-versleuteld zip (wekelijks of bij wijziging)
  Regels:
  - ALLEEN *.age (met echte age-header), SHA256SUMS en *.sha256. Al het andere wordt overgeslagen
    (info.txt, KLAAR, INFO.txt) of de map wordt GEWEIGERD (onbekend/onversleuteld bestand).
  - Nooit herstelsleutel-age.txt, SSH-sleutels, *.pfx/*.pem/*.key, rclone.conf; niets uit R:\...\sleutels.
  - Na elke upload: grootte + SHA256 (of MD5) op Drive vergeleken met het lokale bestand.
  - Bewaren op Drive: de nieuwste 30 dagelijkse back-ups + per kalendermaand de nieuwste, 12 maanden.
    Verwijderen alleen binnen <Remote>/dagelijks/<stempel> en <Remote>/herstelset/herstelset-*.zip.age(.sha256),
    max. 5 mappen per run, en alleen als de nieuwste back-up in deze run goed op Drive staat.
    Drive zet verwijderde mappen eerst 30 dagen in de prullenbak.
  - rclone schrijft NIETS op T:\ of R:\ (Controlled Folder Access): config/token/cache staan in
    %LOCALAPPDATA%\mijn-ruimte\rclone (ACL alleen t, config versleuteld met een DPAPI-wachtwoord).
    Logboeken schrijft PowerShell naar R:\mijn-ruimte-reservekopie\cloud\.
  Exitcodes: 0 = OK, 1 = fout, 3 = nog niet gekoppeld (cloud-koppelen.ps1 nog niet gedaan).

.EXAMPLE
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\cloud\cloud-reservekopie.ps1
  ... -DryRun          laat zien wat er zou gebeuren, verandert niets op Drive
  ... -TestRetentie    test alleen de bewaarregels (zonder netwerk)
#>
[CmdletBinding()]
param(
  [string]$Project = 'T:\mijn-ruimte',
  [string]$Reserve = 'R:\mijn-ruimte-reservekopie',
  [string]$Remote = 'gdrive:mijn-ruimte-reservekopie',
  [string]$ConfigMap = (Join-Path $env:LOCALAPPDATA 'mijn-ruimte\rclone'),
  [string]$LogMap,
  [int]$Dagelijks = 30,
  [int]$Maandelijks = 12,
  [int]$HerstelsetVersies = 4,
  [int]$HerstelsetDagen = 7,
  [int]$MaxVerwijderen = 5,
  [switch]$DryRun,
  [switch]$ZonderHerstelset,
  [switch]$ZonderHerstelsetVernieuwen,
  [switch]$TestRetentie
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# rclone v1.75.1 windows-amd64, PGP-gecontroleerd (zie hulpmiddelen\rclone\VERIFICATIE.txt).
$RcloneSha256 = '033eee51c9ad47c2de2624b6674d355274bcd6cf0027a5f85db4437ba24ae81c'
$Rclone    = Join-Path $Project 'hulpmiddelen\rclone\rclone.exe'
$Age       = Join-Path $Project 'hulpmiddelen\age\age\age.exe'
$Ontvanger = Join-Path $Project 'hulpmiddelen\age\backup-ontvanger.age.pub'
if (-not $LogMap) { $LogMap = Join-Path $Reserve 'cloud' }
$Config    = Join-Path $ConfigMap 'rclone.conf'
$WwBlob    = Join-Path $ConfigMap 'config-wachtwoord.dpapi'
$WwScript  = Join-Path $PSScriptRoot 'cloud-wachtwoord.ps1'
$Tmp       = Join-Path $ConfigMap 'tmp'
$Log       = Join-Path $LogMap 'cloud.log'
$RcLog     = Join-Path $LogMap 'cloud-rclone.log'
$StatusPad = Join-Path $LogMap 'status.json'
$Stempel   = '^\d{8}-\d{6}$'
$Utf8      = New-Object Text.UTF8Encoding $false

# ---------------------------------------------------------------- bewaarregels (puur, testbaar)
function Kies-Bewaren([string[]]$stempels, [datetime]$nu, [int]$dag, [int]$maand) {
  $geldig = @($stempels | Where-Object { $_ -match $Stempel } | Sort-Object -Unique -Descending)
  $bewaar = @{}
  foreach ($s in ($geldig | Select-Object -First $dag)) { $bewaar[$s] = 'dag' }
  for ($i = 0; $i -lt $maand; $i++) {
    $m = $nu.AddMonths(-$i).ToString('yyyyMM')
    $n = @($geldig | Where-Object { $_.Substring(0, 6) -eq $m } | Select-Object -First 1)
    if ($n.Count -and -not $bewaar.ContainsKey($n[0])) { $bewaar[$n[0]] = 'maand' }
  }
  return $bewaar
}

if ($TestRetentie) {
  $nu = Get-Date '2026-10-03 09:00'
  $alle = 0..400 | ForEach-Object { $nu.AddDays(-$_).ToString('yyyyMMdd') + '-033000' }
  $b = Kies-Bewaren $alle $nu 30 12
  $dag = @($b.Keys | Where-Object { $b[$_] -eq 'dag' }).Count; $mnd = @($b.Keys | Where-Object { $b[$_] -eq 'maand' } | Sort-Object)
  "401 dagelijkse back-ups -> bewaard: $($b.Count) ($dag dagelijks + $($mnd.Count) maandelijks: $($mnd -join ', '))"
  $fout = 0
  if ($dag -ne 30) { 'FOUT: verwacht 30 dagelijkse'; $fout++ }
  if (@($b.Keys | Where-Object { $_ -lt '20251101' }).Count) { 'FOUT: iets ouder dan 12 maanden bewaard'; $fout++ }
  if (-not $b.ContainsKey($alle[0])) { 'FOUT: nieuwste niet bewaard'; $fout++ }
  $b2 = Kies-Bewaren @('20261003-033000', 'onzin', '../../x', '20261002-033000') $nu 30 12
  if ($b2.Count -ne 2) { 'FOUT: ongeldige namen niet genegeerd'; $fout++ }
  $b3 = Kies-Bewaren @() $nu 30 12
  if ($b3.Count -ne 0) { 'FOUT: lege lijst'; $fout++ }
  if ($fout) { exit 1 }; 'OK: bewaarregels kloppen'; exit 0
}

# ---------------------------------------------------------------- hulpfuncties
function Schrijf-Log([string]$tekst) {
  $regel = '{0} {1}{2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $(if ($DryRun) { '[proef] ' } else { '' }), $tekst
  Write-Output $regel
  try { Add-Content -LiteralPath $Log -Value $regel -Encoding UTF8 } catch { Write-Warning "log niet schrijfbaar: $_" }
}
function Draai-Log([string]$pad) {
  if ((Test-Path -LiteralPath $pad) -and (Get-Item -LiteralPath $pad).Length -gt 5MB) { Move-Item -LiteralPath $pad -Destination "$pad.1" -Force }
}
function Hash([string]$p, [string]$alg = 'SHA256') { (Get-FileHash -Algorithm $alg -LiteralPath $p).Hash.ToLower() }
function Q([string]$a) {
  if ($a -eq '') { return '""' }
  if ($a -notmatch '[\s"]') { return $a }
  return '"' + (($a -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}
function Rclone([string[]]$argumenten) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Rclone
  $vast = @('--ask-password=false', '--retries', '3', '--low-level-retries', '10', '--contimeout', '30s', '--timeout', '5m', '--cache-dir', (Join-Path $ConfigMap 'cache'), '--temp-dir', $Tmp)
  $psi.Arguments = (@($argumenten + $vast) | ForEach-Object { Q $_ }) -join ' '
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $Utf8; $psi.StandardErrorEncoding = $Utf8
  $psi.EnvironmentVariables['RCLONE_CONFIG'] = $Config
  if (Test-Path -LiteralPath $WwBlob) {
    $psi.EnvironmentVariables['RCLONE_PASSWORD_COMMAND'] = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $WwScript -Bestand $WwBlob"
  }
  $p = [Diagnostics.Process]::Start($psi)
  $uit = $p.StandardOutput.ReadToEndAsync(); $fout = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $r = [pscustomobject]@{ Code = $p.ExitCode; Uit = $uit.Result; Fout = $fout.Result }
  $kop = '{0} rclone {1} -> {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), ($argumenten -join ' '), $r.Code
  try { Add-Content -LiteralPath $RcLog -Value @($kop, $r.Fout.TrimEnd()) -Encoding UTF8 } catch { }
  return $r
}
function Rclone-Ok([string[]]$argumenten) {
  $r = Rclone $argumenten
  if ($r.Code -ne 0) { throw ("rclone {0} mislukt (code {1}): {2}" -f $argumenten[0], $r.Code, (($r.Fout -split "`n" | Where-Object { $_ -match 'ERROR|CRITICAL|Failed' } | Select-Object -Last 2) -join ' | ')) }
  return $r
}
function Lijst-Remote([string]$pad) {
  # Alle bestanden onder $pad (recursief) met grootte en hashes. Map bestaat niet -> leeg.
  $r = Rclone @('lsjson', '-R', '--files-only', '--hash', $pad)
  if ($r.Code -eq 3) { return @() }
  if ($r.Code -ne 0) { throw "rclone lsjson $pad mislukt (code $($r.Code)): $($r.Fout.Trim())" }
  if (-not $r.Uit.Trim()) { return @() }
  # PowerShell 5.1 geeft een JSON-array als EEN object door; foreach pakt hem uit (ook een lege []).
  return @(foreach ($x in (ConvertFrom-Json $r.Uit)) { $x })
}

# --- veiligheidscontroles op wat er naar buiten gaat
$Verboden = '(?i)(herstelsleutel|\.pfx$|\.p12$|\.pem$|\.key$|\.ppk$|^id_|mijn-ruimte-webserver|\.env$|rclone\.conf|\.dpapi$)'
$Overslaan = @('info.txt', 'INFO.txt', 'KLAAR')
function Is-Age([string]$pad) {
  $kop = [Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`n")
  $fs = [IO.File]::OpenRead($pad)
  try { $buf = New-Object byte[] $kop.Length; $n = $fs.Read($buf, 0, $buf.Length) } finally { $fs.Dispose() }
  if ($n -ne $kop.Length) { return $false }
  for ($i = 0; $i -lt $kop.Length; $i++) { if ($buf[$i] -ne $kop[$i]) { return $false } }
  return $true
}
function Is-Sommenbestand([string]$pad) {
  if ((Get-Item -LiteralPath $pad).Length -gt 64KB) { return $false }
  $regels = @([IO.File]::ReadAllLines($pad) | Where-Object { $_.Trim() })
  if ($regels.Count -eq 0) { return $false }
  foreach ($r in $regels) { if ($r -notmatch '^[0-9a-f]{64} [ *]?\S') { return $false } }
  return $true
}
function Kies-Bestanden([string]$map) {
  # Geeft de te uploaden bestandsnamen (*.age eerst, sommen als laatste) of gooit een fout (map GEWEIGERD).
  $vol = (Resolve-Path -LiteralPath $map).ProviderPath.TrimEnd('\') + '\'
  $toegestaan = @((Join-Path $Reserve 'vm-back-ups'), (Join-Path $Reserve 'geheimen'), (Join-Path $LogMap 'herstelset-upload')) | ForEach-Object { $_.TrimEnd('\') + '\' }
  if (-not ($toegestaan | Where-Object { $vol.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) { throw "GEWEIGERD: $map ligt buiten de toegestane mappen" }
  if ($vol.StartsWith((Join-Path $Reserve 'sleutels'), [StringComparison]::OrdinalIgnoreCase)) { throw "GEWEIGERD: $map is de sleutelmap" }
  $data = @(); $sommen = @()
  foreach ($f in Get-ChildItem -LiteralPath $map -Force) {
    if ($f.PSIsContainer) { throw "GEWEIGERD: $map bevat een submap ($($f.Name))" }
    if ($f.Name -match $Verboden) { throw "GEWEIGERD (BEVEILIGING): $map bevat $($f.Name)" }
    if ($Overslaan -ccontains $f.Name) { continue }
    if ($f.Name -like '*.age') {
      if (-not (Is-Age $f.FullName)) { throw "GEWEIGERD: $($f.Name) heeft geen age-header (onversleuteld?)" }
      $data += $f.Name
    } elseif ($f.Name -eq 'SHA256SUMS' -or $f.Name -like '*.sha256') {
      if (-not (Is-Sommenbestand $f.FullName)) { throw "GEWEIGERD: $($f.Name) is geen zuiver controlesommenbestand" }
      $sommen += $f.Name
    } else { throw "GEWEIGERD: onbekend bestand $($f.Name) in $map (mogelijk onversleuteld)" }
  }
  if ($data.Count -eq 0) { throw "GEWEIGERD: geen .age-bestanden in $map" }
  if ($sommen.Count -eq 0) { throw "GEWEIGERD: geen SHA256SUMS/.sha256 in $map" }
  # Elke .age moet in een sommenbestand staan met de juiste hash.
  $bekend = @{}
  foreach ($s in $sommen) {
    foreach ($r in [IO.File]::ReadAllLines((Join-Path $map $s))) { if ($r -match '^([0-9a-f]{64}) [ *]?(\S+)') { $bekend[$Matches[2]] = $Matches[1] } }
  }
  foreach ($d in $data) {
    if (-not $bekend.ContainsKey($d)) { throw "GEWEIGERD: $d staat niet in SHA256SUMS" }
    if ((Hash (Join-Path $map $d)) -ne $bekend[$d]) { throw "GEWEIGERD: controlesom van $d klopt niet (beschadigd?)" }
  }
  return [pscustomobject]@{ Data = $data; Sommen = $sommen }
}
function Upload-Map([string]$map, [string]$doel) {
  $keuze = Kies-Bestanden $map
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
  # Eerst de .age-bestanden, daarna de sommen (sommen op Drive = map compleet).
  foreach ($groep in @(, $keuze.Data) + @(, $keuze.Sommen)) {
    $lijst = Join-Path $Tmp ('lijst-' + [guid]::NewGuid().ToString('N') + '.txt')
    [IO.File]::WriteAllLines($lijst, [string[]]$groep, $Utf8)
    try {
      $arg = @('copy', $map, $doel, '--files-from-raw', $lijst, '--no-traverse', '--immutable', '-v')
      if ($DryRun) { $arg += '--dry-run' }
      [void](Rclone-Ok $arg)
    } finally { Remove-Item -LiteralPath $lijst -Force -ErrorAction SilentlyContinue }
  }
  if ($DryRun) { return 0 }
  # Controle op Drive: grootte + SHA256 (of MD5 als Drive geen SHA256 geeft).
  $remote = @{}; foreach ($o in (Lijst-Remote $doel)) { $remote[$o.Path] = $o }
  $totaal = 0
  foreach ($n in @($keuze.Data + $keuze.Sommen)) {
    $lok = Join-Path $map $n
    if (-not $remote.ContainsKey($n)) { throw "na upload niet op Drive: $doel/$n" }
    $o = $remote[$n]
    if ([int64]$o.Size -ne (Get-Item -LiteralPath $lok).Length) { throw "grootte wijkt af op Drive: $doel/$n" }
    $sha = $null; $md5 = $null
    $h = $o.PSObject.Properties['Hashes']
    if ($h -and $h.Value) {
      foreach ($p in $h.Value.PSObject.Properties) {
        $k = $p.Name.ToLower().Replace('-', '')
        if ($k -eq 'sha256' -and $p.Value) { $sha = [string]$p.Value } elseif ($k -eq 'md5' -and $p.Value) { $md5 = [string]$p.Value }
      }
    }
    if ($sha) { if ($sha.ToLower() -ne (Hash $lok)) { throw "SHA256 wijkt af op Drive: $doel/$n" } }
    elseif ($md5) { if ($md5.ToLower() -ne (Hash $lok 'MD5')) { throw "MD5 wijkt af op Drive: $doel/$n" } }
    else { throw "Drive gaf geen hash voor $doel/$n" }
    $totaal += (Get-Item -LiteralPath $lok).Length
  }
  return $totaal
}
function Lees-Status {
  if (Test-Path -LiteralPath $StatusPad) { try { return (Get-Content -LiteralPath $StatusPad -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { } }
  return [pscustomobject]@{ laatsteSucces = ''; herstelsetVingerafdruk = ''; herstelsetBestand = '' }
}
function Schrijf-Status($s) {
  if ($DryRun) { return }
  [IO.File]::WriteAllText($StatusPad, ($s | ConvertTo-Json), $Utf8)
}
function Versleutel([string]$bron, [string]$uit) {
  # age.exe mag niet op R:\ schrijven (Controlled Folder Access): PowerShell schrijft de uitvoer.
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $Age; $psi.Arguments = '-R ' + (Q $Ontvanger) + ' ' + (Q $bron)
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  $fout = $p.StandardError.ReadToEndAsync()
  $fs = [IO.File]::Create($uit)
  try { $p.StandardOutput.BaseStream.CopyTo($fs) } finally { $fs.Dispose() }
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { Remove-Item -LiteralPath $uit -Force -ErrorAction SilentlyContinue; throw "age mislukt (code $($p.ExitCode)): $($fout.Result.Trim())" }
  if (-not (Is-Age $uit)) { throw "versleuteld bestand heeft geen age-header: $uit" }
}
function Zoek-Privesleutels([string]$map) {
  $fout = @()
  foreach ($f in Get-ChildItem -LiteralPath $map -Recurse -File -Force) {
    if ($f.Name -in @('herstelsleutel-age.txt', 'mijn-ruimte-webserver', 'rclone.conf') -or $f.Extension -in @('.pfx', '.p12', '.pem', '.key', '.ppk', '.dpapi', '.env')) { $fout += $f.FullName; continue }
    if ($f.Extension -notin @('', '.txt', '.md', '.ps1', '.sh', '.pub', '.json', '.yml', '.yaml', '.service', '.timer', '.conf') -or $f.Length -gt 5MB) { continue }
    $t = [IO.File]::ReadAllText($f.FullName)
    if ($t -cmatch ('AGE-SECRET-' + 'KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{50,}') -or $t -match ('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----')) { $fout += $f.FullName }
  }
  return $fout
}

# ---------------------------------------------------------------- hoofdprogramma
$mutex = New-Object Threading.Mutex($false, 'Local\MijnRuimte-cloud-reservekopie')
if (-not $mutex.WaitOne(0)) { Write-Output 'cloud-reservekopie loopt al; gestopt'; exit 0 }
$fouten = 0
try {
  New-Item -ItemType Directory -Force -Path $LogMap | Out-Null
  Draai-Log $Log; Draai-Log $RcLog

  if (-not (Test-Path -LiteralPath $Rclone)) { throw "rclone.exe ontbreekt: $Rclone" }
  if ((Hash $Rclone) -ne $RcloneSha256) { throw "rclone.exe wijkt af van de gecontroleerde versie (SHA256); NIET gestart" }
  if ($Remote -notmatch '^[A-Za-z0-9_-]+:(.*[/\\])?mijn-ruimte-reservekopie$') { throw "onverwacht -Remote $Remote (moet eindigen op mijn-ruimte-reservekopie)" }
  if (-not (Test-Path -LiteralPath $Config)) {
    Schrijf-Log 'NIET GEKOPPELD: nog geen rclone-configuratie. Eenmalig: scripts\cloud\cloud-koppelen.ps1 (zie UITLEG-LEESMIJ.txt)'
    exit 3
  }
  $naam = $Remote.Split(':')[0] + ':'
  $rl = Rclone-Ok @('listremotes')
  if (@($rl.Uit -split "`r?`n") -notcontains $naam) {
    Schrijf-Log "NIET GEKOPPELD: remote $naam staat niet in de configuratie (cloud-koppelen.ps1)"
    exit 3
  }
  if (-not $DryRun) { foreach ($sub in 'dagelijks', 'geheimen', 'herstelset') { [void](Rclone-Ok @('mkdir', "$Remote/$sub")) } }
  $status = Lees-Status

  # 1. Dagelijkse back-ups (database + uploads).
  $nieuwsteOk = $false
  try {
    $lokaal = @{}
    foreach ($d in Get-ChildItem -LiteralPath (Join-Path $Reserve 'vm-back-ups') -Directory) {
      if ($d.Name -match $Stempel -and (Test-Path -LiteralPath (Join-Path $d.FullName 'KLAAR'))) { $lokaal[$d.Name] = $d.FullName }
    }
    $remoteBestanden = Lijst-Remote "$Remote/dagelijks"
    $compleet = @{}; $remoteMappen = @{}
    foreach ($o in $remoteBestanden) {
      $delen = $o.Path -split '/'
      if ($delen.Count -eq 2 -and $delen[0] -match $Stempel) { $remoteMappen[$delen[0]] = 1; if ($delen[1] -eq 'SHA256SUMS') { $compleet[$delen[0]] = 1 } }
    }
    $alle = @(@($lokaal.Keys) + @($remoteMappen.Keys) | Sort-Object -Unique)
    $bewaar = Kies-Bewaren $alle (Get-Date) $Dagelijks $Maandelijks
    $nieuwsteLokaal = @($lokaal.Keys | Sort-Object -Descending | Select-Object -First 1)
    if (-not $nieuwsteLokaal.Count) { throw 'geen lokale back-up met KLAAR in vm-back-ups' }
    foreach ($s in @($lokaal.Keys | Sort-Object)) {
      if (-not $bewaar.ContainsKey($s)) { continue }      # te oud om nog te bewaren
      if ($compleet.ContainsKey($s)) { if ($s -eq $nieuwsteLokaal[0]) { $nieuwsteOk = $true }; continue }
      try {
        $bytes = Upload-Map $lokaal[$s] "$Remote/dagelijks/$s"
        Schrijf-Log ('OK dagelijks/{0} geupload en op Drive gecontroleerd ({1:N1} KB)' -f $s, ($bytes / 1KB))
        if ($s -eq $nieuwsteLokaal[0]) { $nieuwsteOk = $true }
      } catch { Schrijf-Log "FOUT dagelijks/$s : $($_.Exception.Message)"; $fouten++ }
    }
    if ($nieuwsteOk) { Schrijf-Log "OK nieuwste back-up $($nieuwsteLokaal[0]) staat op Drive" }
    $oud = (New-TimeSpan -Start ([datetime]::ParseExact($nieuwsteLokaal[0], 'yyyyMMdd-HHmmss', $null)) -End (Get-Date)).TotalHours
    if ($oud -gt 36) { Schrijf-Log ('WAARSCHUWING nieuwste lokale back-up is {0:N0} uur oud (ophalen van de VM mislukt?)' -f $oud) }

    # Opruimen op Drive (alleen als de nieuwste back-up er goed staat).
    $weg = @($remoteMappen.Keys | Where-Object { -not $bewaar.ContainsKey($_) } | Sort-Object)
    if ($weg.Count) {
      if (-not $nieuwsteOk) { Schrijf-Log "OPRUIMEN overgeslagen: nieuwste back-up staat (nog) niet op Drive ($($weg.Count) oude mappen blijven)" }
      elseif ($weg.Count -gt $MaxVerwijderen) { Schrijf-Log "WAARSCHUWING OPRUIMEN geweigerd: $($weg.Count) mappen zouden weg moeten (> $MaxVerwijderen); controleer met de hand"; $fouten++ }
      elseif (@($remoteMappen.Keys).Count - $weg.Count -lt [Math]::Min($Dagelijks, @($remoteMappen.Keys).Count)) { Schrijf-Log 'WAARSCHUWING OPRUIMEN geweigerd: er zouden te weinig back-ups overblijven'; $fouten++ }
      else {
        foreach ($s in $weg) {
          if ($s -notmatch $Stempel) { continue }
          if ($DryRun) { Schrijf-Log "zou verwijderen: dagelijks/$s"; continue }
          [void](Rclone-Ok @('purge', "$Remote/dagelijks/$s", '--drive-use-trash=true'))
          Schrijf-Log "OPGERUIMD dagelijks/$s (Drive-prullenbak, 30 dagen terug te halen)"
        }
      }
    }
  } catch { Schrijf-Log "FOUT dagelijks: $($_.Exception.Message)"; $fouten++ }

  # 2. Versleutelde geheimenarchieven (klein; allemaal bewaren).
  try {
    $remoteG = @{}
    foreach ($o in (Lijst-Remote "$Remote/geheimen")) { $d = $o.Path -split '/'; if ($d.Count -eq 2 -and $d[1] -eq 'SHA256SUMS') { $remoteG[$d[0]] = 1 } }
    foreach ($g in Get-ChildItem -LiteralPath (Join-Path $Reserve 'geheimen') -Directory -Filter 'geheimen-*' | Sort-Object Name) {
      if ($g.Name -notmatch '^geheimen-\d{8}-\d{6}$') { continue }
      if ($remoteG.ContainsKey($g.Name)) { continue }
      try {
        $bytes = Upload-Map $g.FullName "$Remote/geheimen/$($g.Name)"
        Schrijf-Log ('OK geheimen/{0} geupload en gecontroleerd ({1:N1} KB)' -f $g.Name, ($bytes / 1KB))
      } catch { Schrijf-Log "FOUT geheimen/$($g.Name) : $($_.Exception.Message)"; $fouten++ }
    }
  } catch { Schrijf-Log "FOUT geheimen: $($_.Exception.Message)"; $fouten++ }

  # 3. Herstelset (wekelijks verversen; uploaden als hij veranderd is).
  if (-not $ZonderHerstelset) {
    try {
      $set = Join-Path $Reserve 'herstelset'
      if (-not (Test-Path -LiteralPath (Join-Path $set 'SHA256SUMS.txt'))) { throw "geen herstelset in $set" }
      $leeftijd = (New-TimeSpan -Start (Get-Item -LiteralPath (Join-Path $set 'VERSIE.txt')).LastWriteTime -End (Get-Date)).TotalDays
      if ($leeftijd -ge $HerstelsetDagen -and -not $ZonderHerstelsetVernieuwen -and -not $DryRun) {
        Schrijf-Log ('herstelset is {0:N0} dagen oud; verversen met herstelset-bijwerken.ps1' -f $leeftijd)
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Project 'scripts\herstelset-bijwerken.ps1') -Project $Project -Reserve $Reserve | Out-Null
        if ($LASTEXITCODE -ne 0) { Schrijf-Log "WAARSCHUWING herstelset-bijwerken mislukt (code $LASTEXITCODE); de bestaande set wordt gebruikt" }
      }
      $vinger = Hash (Join-Path $set 'SHA256SUMS.txt')
      $remoteH = @(Lijst-Remote "$Remote/herstelset" | ForEach-Object { $_.Path } | Where-Object { $_ -match '^herstelset-\d{8}-\d{6}\.zip\.age(\.sha256)?$' })
      $bestand = [string]$status.herstelsetBestand
      if ($status.herstelsetVingerafdruk -eq $vinger -and $bestand -and ($remoteH -contains $bestand) -and ($remoteH -contains "$bestand.sha256")) {
        Schrijf-Log "herstelset ongewijzigd; staat al op Drive als herstelset/$bestand"
      } elseif ($DryRun) {
        Schrijf-Log 'zou de herstelset versleutelen en uploaden (veranderd of nog niet op Drive)'
      } else {
        # Controleren, inpakken, versleutelen (alleen het .age-bestand blijft staan).
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $set 'controleer-herstelset.ps1') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'herstelset klopt niet (controleer-herstelset.ps1); niet geupload' }
        $lek = @(Zoek-Privesleutels $set)
        if ($lek.Count) { throw ('BEVEILIGING: privesleutel in de herstelset, niet geupload: ' + ($lek -join ', ')) }
        $up = Join-Path $LogMap 'herstelset-upload'
        if (Test-Path -LiteralPath $up) { Remove-Item -LiteralPath $up -Recurse -Force }
        New-Item -ItemType Directory -Path $up | Out-Null
        $zip = Join-Path $LogMap 'herstelset-inpakken.zip'
        if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
        Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
        $za = [IO.Compression.ZipFile]::Open($zip, 'Create')
        try {
          foreach ($f in Get-ChildItem -LiteralPath $set -Recurse -File) {
            $rel = $f.FullName.Substring($set.TrimEnd('\').Length + 1).Replace('\', '/')
            [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($za, $f.FullName, "mijn-ruimte-herstelset/$rel", [IO.Compression.CompressionLevel]::Optimal)
          }
        } finally { $za.Dispose() }
        $naamH = 'herstelset-{0}.zip.age' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
        try { Versleutel $zip (Join-Path $up $naamH) } finally { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
        [IO.File]::WriteAllText((Join-Path $up "$naamH.sha256"), ('{0}  {1}' -f (Hash (Join-Path $up $naamH)), $naamH) + "`n", $Utf8)
        $bytes = Upload-Map $up "$Remote/herstelset"
        Schrijf-Log ('OK herstelset/{0} geupload en gecontroleerd ({1:N1} MB)' -f $naamH, ($bytes / 1MB))
        $status = [pscustomobject]@{ laatsteSucces = [string]$status.laatsteSucces; herstelsetVingerafdruk = $vinger; herstelsetBestand = $naamH }
        Schrijf-Status $status
        # Oude versies op Drive: alleen herstelset-<stempel>.zip.age(.sha256), nieuwste $HerstelsetVersies blijven.
        $versies = @(@($remoteH + $naamH) | ForEach-Object { $_ -replace '\.sha256$', '' } | Sort-Object -Unique -Descending)
        foreach ($v in ($versies | Select-Object -Skip $HerstelsetVersies)) {
          foreach ($n in @($v, "$v.sha256")) {
            if ($n -notmatch '^herstelset-\d{8}-\d{6}\.zip\.age(\.sha256)?$' -or ($remoteH -notcontains $n)) { continue }
            [void](Rclone-Ok @('deletefile', "$Remote/herstelset/$n", '--drive-use-trash=true'))
          }
          Schrijf-Log "OPGERUIMD herstelset/$v (Drive-prullenbak)"
        }
      }
    } catch { Schrijf-Log "FOUT herstelset: $($_.Exception.Message)"; $fouten++ }
  }

  if ($fouten -eq 0) {
    $status = Lees-Status
    $status.laatsteSucces = (Get-Date -Format 's')
    Schrijf-Status $status
    Schrijf-Log 'KLAAR zonder fouten'
    exit 0
  }
  Schrijf-Log "KLAAR met $fouten fout(en); zie $RcLog"
  exit 1
} catch {
  Schrijf-Log "FOUT $($_.Exception.Message)"
  exit 1
} finally {
  $mutex.ReleaseMutex(); $mutex.Dispose()
}
