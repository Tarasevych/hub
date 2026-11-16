# nat-bewaker.ps1 - Mijn Ruimte (NAT-001)
# Bewaakt de Windows-NAT van de webserver-VM (standaard 'mijn-ruimte-nat', 10.77.0.0/24).
# Probleem (16-11-2026): na een (onverwachte) herstart start WinNAT soms voordat
# Wi-Fi/Ethernet een adres heeft. De NAT heeft dan geen extern adres, de VM heeft
# geen internet, cloudflared kan Cloudflare niet bereiken -> Cloudflare-fout 1033.
# Oplossing: als het IPv4-adres van de standaardroute ontbreekt in de externe
# adressen van de NAT, de driver winnat herstarten (net stop / net start).
# Gezond = niets doen en niets loggen. Herstel hoogstens eens per 10 minuten.
# Draait als SYSTEM via de geplande taak 'Mijn Ruimte - NAT-bewaker'
# (zie installeer-nat-bewaker.ps1). Wijzigt geen configuratie van NAT, switch, VM of tunnel.
# Let op: 'Restart-Service winnat' werkt NIET (winnat is een kernel-driver); net stop/start wel.

param(
    [string]$NatNaam = 'mijn-ruimte-nat',
    [string]$LogMap  = (Join-Path $PSScriptRoot 'logboek'),
    [int]$MinMinutenTussenHerstel = 10,
    [switch]$AlleenControle   # alleen meten en loggen, niets herstarten (voor tests)
)

$ErrorActionPreference = 'Continue'
$LogBestand    = Join-Path $LogMap 'nat-bewaker.log'
$StatusBestand = Join-Path $LogMap 'nat-bewaker.laatste-herstel.txt'

function Log([string]$tekst) {
    try {
        if (-not (Test-Path $LogMap)) { New-Item -ItemType Directory -Path $LogMap -Force | Out-Null }
        $regel = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $tekst
        Add-Content -Path $LogBestand -Value $regel -Encoding UTF8
        # log klein houden: bij meer dan 2500 regels de laatste 2000 bewaren
        $alle = Get-Content -Path $LogBestand -Encoding UTF8
        if ($alle.Count -gt 2500) { $alle | Select-Object -Last 2000 | Set-Content -Path $LogBestand -Encoding UTF8 }
    } catch { }
}

function Get-StandaardIPv4 {
    # IPv4-adres van de fysieke interface met de goedkoopste standaardroute (Wi-Fi of Ethernet)
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -notlike 'vEthernet*' } |
        Sort-Object { $_.RouteMetric + (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).InterfaceMetric } |
        Select-Object -First 1
    if (-not $route) { return $null }
    $ip = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
    if ($ip) { return [pscustomobject]@{ IP = $ip.IPAddress; Interface = $route.InterfaceAlias } }
    return $null
}

function Get-NatExterneAdressen {
    @(Get-NetNatExternalAddress -ErrorAction SilentlyContinue |
        Where-Object { $_.NatName -eq $NatNaam } | Select-Object -ExpandProperty IPAddress)
}

$nat = Get-NetNat -Name $NatNaam -ErrorAction SilentlyContinue
if (-not $nat) { Log "FOUT: NAT '$NatNaam' bestaat niet. Niets gedaan (handmatig controleren)."; exit 2 }

$std = Get-StandaardIPv4
if (-not $std) { Log "WACHT: nog geen netwerk met standaardroute; volgende ronde opnieuw."; exit 0 }

$extern = Get-NatExterneAdressen
if ($extern -contains $std.IP) {
    if ($AlleenControle) { Log "OK: NAT heeft extern adres $($std.IP) ($($std.Interface))." }
    exit 0
}

Log "PROBLEEM: NAT '$NatNaam' mist extern adres $($std.IP) ($($std.Interface)). Huidige adressen: $(($extern | Sort-Object -Unique) -join ', ')"
if ($AlleenControle) { Log "AlleenControle: niet herstart."; exit 1 }

# niet vaker dan eens per $MinMinutenTussenHerstel minuten herstarten
if (Test-Path $StatusBestand) {
    try {
        $vorige = [datetime]::Parse((Get-Content $StatusBestand -Raw).Trim())
        if (((Get-Date) - $vorige).TotalMinutes -lt $MinMinutenTussenHerstel) {
            Log "Laatste herstel om $vorige; te recent, wacht."; exit 1
        }
    } catch { }
}

Set-Content -Path $StatusBestand -Value (Get-Date -Format 'o') -Encoding UTF8
$stop  = (& net.exe stop winnat 2>&1 | Out-String).Trim()
Start-Sleep -Seconds 2
$start = (& net.exe start winnat 2>&1 | Out-String).Trim()
Log "winnat herstart. stop: $stop | start: $start"

Start-Sleep -Seconds 5
$extern2 = Get-NatExterneAdressen
if ($extern2 -contains $std.IP) { Log "HERSTELD: NAT heeft nu extern adres $($std.IP)."; exit 0 }
Log "NOG NIET HERSTELD: adressen na herstart: $(($extern2 | Sort-Object -Unique) -join ', '). Volgende ronde opnieuw."
exit 1
