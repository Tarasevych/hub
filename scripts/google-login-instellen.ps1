<#
.SYNOPSIS
  Zet de Google-login (OAuth-client voor id.tarasevych.com) op de webserver-VM.
  Встановлює вхід через Google (OAuth-клієнт для id.tarasevych.com) на VM вебсервера.

.DESCRIPTION
  1. vraagt de Client ID (zichtbaar) en controleert het formaat
  2. vraagt het Client secret (onzichtbaar, Read-Host -AsSecureString)
  3. stuurt beide als twee regels via de STDIN van ssh (nooit als argument, dus niet zichtbaar in
     procestabellen of logboeken) naar /usr/local/sbin/google-login-zetten op de VM (als root via sudo)
  4. toont alleen OK of mislukt; waarden worden nooit getoond of op schijf gezet
  1. запитує Client ID (видимий) і перевіряє формат
  2. запитує Client secret (невидимий)
  3. передає обидва рядки через STDIN ssh (не в аргументах) на VM
  4. показує лише OK або помилку; значення ніколи не показуються і не записуються на диск
  Vooraf op de VM (eenmalig, als root) / Заздалегідь на VM:
    install -o root -g root -m 0755 deploy/google-login-zetten.sh /usr/local/sbin/google-login-zetten
  Gewone PowerShell (NIET als administrator) / Звичайний PowerShell (НЕ адміністратор):
    powershell -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\google-login-instellen.ps1
#>
[CmdletBinding()]
param(
  [string]$Vm = 'beheer@10.77.0.10',
  [string]$Sleutel = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver',
  [string]$OpdrachtOpVm = 'sudo -n /usr/local/sbin/google-login-zetten'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
function Zeg([string]$ua, [string]$nl, [string]$kleur = 'Cyan') { Write-Host $ua -ForegroundColor $kleur; if ($nl) { Write-Host "  $nl" -ForegroundColor DarkGray } }

$id = $null; $geheim = $null; $ss = $null
try {
  if (-not (Test-Path -LiteralPath $Sleutel)) { throw "SSH-sleutel niet gevonden / SSH-ключ не знайдено: $Sleutel" }

  # 1. Client ID (geen geheim, mag zichtbaar zijn).
  $id = (Read-Host 'Client ID (видно / zichtbaar)').Trim()
  if ($id -notmatch '^[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com$') {
    Zeg 'ПОМИЛКА: Client ID має неправильний формат (очікується <цифри>-<код>.apps.googleusercontent.com).' 'FOUT: client-ID heeft een ongeldig formaat (verwacht <cijfers>-<code>.apps.googleusercontent.com).' 'Red'
    exit 1
  }

  # 2. Client secret (onzichtbaar; alleen kort als gewone tekst in het geheugen).
  $ss = Read-Host 'Client secret (не видно під час введення / onzichtbaar)' -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  try { $geheim = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  $geheim = $geheim.Trim()
  if ($geheim.Length -lt 20 -or $geheim.Length -gt 200 -or $geheim -notmatch '^[A-Za-z0-9_-]+$') {
    Zeg 'ПОМИЛКА: Client secret має неправильний формат (20–200 символів: A-Z a-z 0-9 _ -).' 'FOUT: client-secret heeft een ongeldig formaat (20–200 tekens: A-Z a-z 0-9 _ -).' 'Red'
    exit 1
  }

  # 3. Via de STDIN van ssh naar de VM (PowerShell 5.1 knoeit met pijpen naar native programma's;
  #    daarom zelf het proces starten en de invoer schrijven).
  $si = New-Object Diagnostics.ProcessStartInfo
  $si.FileName = 'ssh.exe'
  $si.Arguments = '-i "' + $Sleutel + '" -o BatchMode=yes -o ConnectTimeout=15 ' + $Vm + ' ' + $OpdrachtOpVm
  $si.UseShellExecute = $false
  $si.RedirectStandardInput = $true; $si.RedirectStandardOutput = $true; $si.RedirectStandardError = $true
  $si.StandardOutputEncoding = [Text.Encoding]::UTF8; $si.StandardErrorEncoding = [Text.Encoding]::UTF8
  Zeg 'Надсилаю на VM…' 'Versturen naar de VM…' 'DarkGray'
  $p = [Diagnostics.Process]::Start($si)
  $uitTaak = $p.StandardOutput.ReadToEndAsync(); $foutTaak = $p.StandardError.ReadToEndAsync()
  $invoer = New-Object IO.StreamWriter($p.StandardInput.BaseStream, (New-Object Text.UTF8Encoding($false)))
  $invoer.NewLine = "`n"
  $invoer.WriteLine($id); $invoer.WriteLine($geheim); $invoer.Flush(); $invoer.Close()
  $geheim = $null
  if (-not $p.WaitForExit(180000)) { try { $p.Kill() } catch { }; throw 'time-out (180 s)' }
  $p.WaitForExit()
  $uit = $uitTaak.Result; $fouten = $foutTaak.Result

  # 4. Alleen OK / mislukt. De VM toont nooit waarden; bij een fout zijn regels zonder waarden nuttig.
  if ($p.ExitCode -eq 0 -and $uit -match '(?m)^OK:') {
    Zeg 'OK: вхід через Google налаштовано, сайт працює (HTTP 200).' 'OK: Google-login ingesteld, site draait (HTTP 200).' 'Green'
    exit 0
  }
  Zeg "НЕ ВДАЛОСЯ (код $($p.ExitCode))." "MISLUKT (code $($p.ExitCode))." 'Red'
  foreach ($regel in (($fouten + "`n" + $uit) -split "`r?`n")) { if ($regel.Trim()) { Write-Host "  $regel" -ForegroundColor DarkGray } }
  if ($p.ExitCode -eq 255) { Zeg 'Не вдалося підключитися через SSH (ключ, мережа, VM увімкнена?).' 'SSH-verbinding mislukt (sleutel, netwerk, staat de VM aan?).' 'Yellow' }
  exit 1
} catch {
  Zeg "НЕ ВДАЛОСЯ: $($_.Exception.Message)" "MISLUKT: $($_.Exception.Message)" 'Red'
  exit 1
} finally {
  $geheim = $null; $id = $null
  if ($ss) { $ss.Dispose() }
  [GC]::Collect()
}
