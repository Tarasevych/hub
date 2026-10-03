#Requires -RunAsAdministrator
<#
  Stap 1 (ALS ADMINISTRATOR): virtuele TPM aanzetten voor de VM mijn-ruimte-webserver.
  - stopt de VM netjes, controleert Secure Boot, maakt een lokale sleutelbeschermer
    (Set-VMKeyProtector -NewLocalKeyProtector), zet de vTPM aan (Enable-VMTPM) en start de VM weer;
  - biedt aan de Hyper-V-guardiancertificaten (de sleutel van de vTPM) te exporteren naar R:\ (PFX met
    een wachtwoord dat je zelf kiest);
  - opent de VM-console: typ daar de LUKS-wachtwoordzin (nog handmatig; automatisch pas na stap 2).
  Starten: rechtsklik PowerShell > Als administrator uitvoeren, dan:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\vtpm-20261003\stap1-admin.ps1
#>
param([string]$Naam = 'mijn-ruimte-webserver',
      [string]$ExportMap = 'R:\mijn-ruimte-reservekopie\sleutels\hyperv-vtpm')
$ErrorActionPreference = 'Stop'

$vm = Get-VM -Name $Naam
"VM: $($vm.Name), generatie $($vm.Generation), status $($vm.State)"
if ($vm.Generation -ne 2) { throw 'Geen generatie-2-VM: vTPM kan niet.' }
$fw = Get-VMFirmware -VMName $Naam
"Secure Boot: $($fw.SecureBoot); sjabloon: $($fw.SecureBootTemplate)"
if ($fw.SecureBoot -ne 'On') { throw 'Secure Boot staat UIT. Niet doorgaan (PCR 7 zou niets betekenen).' }
if ($fw.SecureBootTemplate -ne 'MicrosoftUEFICertificateAuthority') { Write-Warning 'Sjabloon is niet MicrosoftUEFICertificateAuthority (normaal voor Ubuntu). Controleer dit.' }

$sec = Get-VMSecurity -VMName $Naam
if ($sec.TpmEnabled) {
  'De vTPM staat al aan; niets gewijzigd.'
} else {
  if ($vm.State -ne 'Off') {
    'VM netjes afsluiten (Stop-VM)...'
    Stop-VM -Name $Naam
    $t = 0; while ((Get-VM -Name $Naam).State -ne 'Off') { Start-Sleep 2; $t += 2; if ($t -gt 300) { throw 'VM is na 5 minuten nog niet uit.' } }
  }
  Set-VMKeyProtector -VMName $Naam -NewLocalKeyProtector
  Enable-VMTPM -VMName $Naam
  'vTPM aangezet.'
}
Get-VMSecurity -VMName $Naam | Format-List TpmEnabled, KeyStorageDriveEnabled, EncryptStateAndVmMigrationTraffic, Shielded

# --- Back-up van de sleutelbeschermer (zonder deze certificaten is de vTPM weg na een Windows-herinstallatie) ---
$store = 'Cert:\LocalMachine\Shielded VM Local Certificates'
$certs = @(Get-ChildItem $store -ErrorAction SilentlyContinue)
$certs | Format-Table Subject, Thumbprint, NotAfter, HasPrivateKey -AutoSize
if ($certs.Count -gt 0 -and (Read-Host "Guardiancertificaten nu exporteren naar $ExportMap ? (j/n)") -eq 'j') {
  $pw = Read-Host -AsSecureString 'Kies een wachtwoord voor de PFX-bestanden (opschrijven, NIET hetzelfde als de LUKS-wachtwoordzin)'
  New-Item -ItemType Directory -Force $ExportMap | Out-Null
  foreach ($c in $certs) {
    $soort = if ($c.Subject -match 'Signing') { 'ondertekening' } else { 'versleuteling' }
    $pad = Join-Path $ExportMap ("hyperv-guardian-$soort-" + $c.Thumbprint.Substring(0, 8) + '.pfx')
    try {
      Export-PfxCertificate -Cert $c -FilePath $pad -Password $pw -ChainOption EndEntityCertOnly | Out-Null
      & icacls.exe $pad /inheritance:r /grant:r 'T\t:(F)' | Out-Null
      "geexporteerd: $pad"
    } catch { Write-Warning "export mislukt voor $($c.Subject): $($_.Exception.Message) (VM wordt toch gestart)" }
  }
}

Start-VM -Name $Naam
'VM gestart. In de console: typ de LUKS-wachtwoordzin (nog een keer handmatig).'
Start-Process vmconnect.exe -ArgumentList 'localhost', $Naam
