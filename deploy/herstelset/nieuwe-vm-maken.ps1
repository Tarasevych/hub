#Requires -RunAsAdministrator
<#
  Maakt op een NIEUWE pc de VM mijn-ruimte-webserver opnieuw aan (zelfde opzet als het origineel):
  generatie 2, Secure Boot (Microsoft UEFI CA, nodig voor Ubuntu), 2 CPU's, vast 6 GB RAM, schijf 120 GB,
  eigen intern netwerk <NatNet>/24 met NAT (pc = <VM-IP>, VM = <VM-IP>), VM kan de pc en het
  thuisnetwerk niet bereiken.
  Voorbeeld (PowerShell ALS ADMINISTRATOR, in de map van de herstelset):
    .\scripts\nieuwe-vm-maken.ps1 -Basis E:\mijn-ruimte-vm -Iso E:\ubuntu-24.04.5-live-server-amd64.iso
#>
param(
  [string]$Basis,
  [string]$Iso,
  [Parameter(Mandatory)][string]$PcIp,
  [Parameter(Mandatory)][string]$NatNet,
  [string]$IsoSha256,
  [string]$Naam = 'mijn-ruimte-webserver',
  [int]$GeheugenGB = 6,
  [switch]$AlleenNetwerk   # alleen netwerk maken (bijv. voor Import-VM van een export)
)
$ErrorActionPreference = 'Stop'
$Schakelaar = 'mijn-ruimte-netwerk'
if (-not (Get-Command New-VM -ErrorAction SilentlyContinue)) { throw 'Hyper-V is niet aan. Eerst: Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All  (daarna herstarten)' }
if (-not $AlleenNetwerk -and (-not $Basis -or -not $Iso)) { throw 'Geef -Basis <map voor de VM> en -Iso <pad naar Ubuntu-ISO> op.' }
if (-not $AlleenNetwerk -and -not (Test-Path -LiteralPath $Iso)) { throw "ISO niet gevonden: $Iso" }
if ($IsoSha256) {
  $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $Iso).Hash
  if ($h -ne $IsoSha256.ToUpper()) { throw "ISO-controlesom klopt niet: $h" }
  'ISO-controlesom OK.'
}

'Netwerk (intern + NAT)...'
if (-not (Get-VMSwitch -Name $Schakelaar -ErrorAction SilentlyContinue)) { New-VMSwitch -Name $Schakelaar -SwitchType Internal | Out-Null }
$adapter = Get-NetAdapter | Where-Object { $_.Name -like "*($Schakelaar)*" }
if (-not (Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress $PcIp -ErrorAction SilentlyContinue)) {
  New-NetIPAddress -InterfaceIndex $adapter.ifIndex -IPAddress $PcIp -PrefixLength 24 | Out-Null
}
if (-not (Get-NetNat -Name 'mijn-ruimte-nat' -ErrorAction SilentlyContinue)) {
  New-NetNat -Name 'mijn-ruimte-nat' -InternalIPInterfaceAddressPrefix $NatNet | Out-Null
}
Get-NetFirewallRule -DisplayName 'Mijn Ruimte VM*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'Mijn Ruimte VM - blokkeer pc en thuisnetwerk' -Direction Inbound -InterfaceAlias $adapter.Name `
  -LocalAddress '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16' -Action Block | Out-Null

if ($AlleenNetwerk) { 'Netwerk klaar (alleen netwerk gevraagd).'; return }
if (Get-VM -Name $Naam -ErrorAction SilentlyContinue) { throw "VM $Naam bestaat al; niets gewijzigd." }
New-Item -ItemType Directory -Force "$Basis\schijven", "$Basis\configuratie" | Out-Null
'VM aanmaken...'
New-VM -Name $Naam -Generation 2 -MemoryStartupBytes ($GeheugenGB * 1GB) -SwitchName $Schakelaar `
  -NewVHDPath "$Basis\schijven\$Naam.vhdx" -NewVHDSizeBytes 120GB -Path "$Basis\configuratie" | Out-Null
Set-VMProcessor -VMName $Naam -Count 2
Set-VMMemory -VMName $Naam -DynamicMemoryEnabled $false -StartupBytes ($GeheugenGB * 1GB)
Set-VMFirmware -VMName $Naam -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority
Add-VMDvdDrive -VMName $Naam -Path $Iso
Set-VMFirmware -VMName $Naam -FirstBootDevice (Get-VMDvdDrive -VMName $Naam)
Disable-VMIntegrationService -VMName $Naam -Name 'Guest Service Interface' -ErrorAction SilentlyContinue
Set-VM -Name $Naam -AutomaticCheckpointsEnabled $false -CheckpointType Production -AutomaticStartAction Start -AutomaticStopAction ShutDown
Start-VM -Name $Naam
Start-Process vmconnect.exe -ArgumentList 'localhost', $Naam
'KLAAR. Het installatievenster van Ubuntu is geopend (zie de handleiding, stap Ubuntu installeren).'
