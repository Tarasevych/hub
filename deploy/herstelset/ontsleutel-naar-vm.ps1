<#
  Ontsleutelt een .age-bestand uit de herstelset met de herstelsleutel en stuurt de inhoud RECHTSTREEKS via SSH
  naar een stap van herstel-vm.sh op de VM. Er komt niets ontsleuteld op de schijf van de pc.
  (PowerShell 5.1 beschadigt binaire pijpen met |; daarom koppelt dit script de twee processen zelf.)
  Розшифровує .age-файл ключем відновлення і одразу передає вміст через SSH на VM. На диск ПК нічого не пишеться.

  Voorbeelden / приклади (in de map van de herstelset / у папці набору):
    .\scripts\ontsleutel-naar-vm.ps1 -Bestand $g -Sleutel F:\herstelsleutel-age.txt -Stap controle-sleutel
    .\scripts\ontsleutel-naar-vm.ps1 -Bestand $g -Sleutel F:\herstelsleutel-age.txt -Stap geheimen
    .\scripts\ontsleutel-naar-vm.ps1 -Bestand "$b\database.dump.age" -Sleutel F:\herstelsleutel-age.txt -Stap db-terugzetten
  -Stap controle-sleutel: niets naar de VM; toont alleen de SHA256 van de ontsleutelde inhoud (sleuteltest).
#>
param(
  [Parameter(Mandatory)][string]$Bestand,
  [Parameter(Mandatory)][string]$Sleutel,
  [Parameter(Mandatory)][string]$Stap,
  [string]$Vm = $(if ($env:MR_VM_SSH) { $env:MR_VM_SSH } else { 'beheer@mijn-ruimte-vm' }),
  [string]$SshSleutel = (Join-Path $HOME '.ssh\mijn-ruimte-webserver'),
  [string]$OpdrachtOpVm   # alleen voor tests: andere opdracht op de VM dan herstel-vm.sh <Stap>
)
$ErrorActionPreference = 'Stop'
$age = (Resolve-Path (Join-Path $PSScriptRoot '..\programmas\age\age\age.exe')).Path
foreach ($p in $Bestand, $Sleutel) { if (-not (Test-Path -LiteralPath $p)) { throw "niet gevonden: $p" } }
function Start-Proces([string]$exe, [string]$argumenten, [bool]$invoer) {
  $si = New-Object Diagnostics.ProcessStartInfo
  $si.FileName = $exe; $si.Arguments = $argumenten; $si.UseShellExecute = $false
  $si.RedirectStandardOutput = -not $invoer; $si.RedirectStandardInput = $invoer
  return [Diagnostics.Process]::Start($si)
}
$q = { param($s) '"' + $s + '"' }
$p1 = Start-Proces $age ('-d -i ' + (& $q (Resolve-Path -LiteralPath $Sleutel).Path) + ' ' + (& $q (Resolve-Path -LiteralPath $Bestand).Path)) $false
if ($Stap -eq 'controle-sleutel') {
  $sha = [Security.Cryptography.SHA256]::Create()
  $h = ($sha.ComputeHash($p1.StandardOutput.BaseStream) | ForEach-Object { $_.ToString('x2') }) -join ''
  $p1.WaitForExit()
  if ($p1.ExitCode -ne 0) { Write-Output 'FOUT / ПОМИЛКА: ontsleutelen mislukt (verkeerde sleutel?) / не вдалося розшифрувати (не той ключ?)'; exit 1 }
  Write-Output "OK: ontsleuteld / розшифровано. SHA256 = $h"
  exit 0
}
$opdracht = if ($OpdrachtOpVm) { $OpdrachtOpVm } else { "sudo -n bash herstel/scripts/herstel-vm.sh $Stap" }
$p2 = Start-Proces 'ssh.exe' ('-i ' + (& $q $SshSleutel) + " -o BatchMode=yes $Vm $opdracht") $true
try { $p1.StandardOutput.BaseStream.CopyTo($p2.StandardInput.BaseStream) } finally { $p2.StandardInput.Close() }
$p1.WaitForExit(); $p2.WaitForExit()
if ($p1.ExitCode -ne 0) { Write-Output "FOUT: age gaf code $($p1.ExitCode) (verkeerde sleutel?)"; exit 1 }
if ($p2.ExitCode -ne 0) { Write-Output "FOUT: stap '$Stap' op de VM gaf code $($p2.ExitCode)"; exit 1 }
Write-Output "OK: $Stap"
