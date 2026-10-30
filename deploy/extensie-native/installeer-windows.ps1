<#
  Mijn Ruimte — lokaal kanaal van de browserextensie (0.5.0) installeren op Windows, alleen voor de huidige gebruiker (HKCU,
  geen beheerdersrechten nodig).

    powershell -ExecutionPolicy Bypass -File .\installeer-windows.ps1
    powershell -ExecutionPolicy Bypass -File .\installeer-windows.ps1 -ClaudeDesktop          # ook claude_desktop_config.json bijwerken
    powershell -ExecutionPolicy Bypass -File .\installeer-windows.ps1 -NodePad 'D:\node\node.exe'

  Wat het doet:
   1. zoekt node.exe (>= 18);
   2. kopieert mr-native-gemeen.mjs, mr-native-host.mjs en mr-native-mcp.mjs naar %LOCALAPPDATA%\MijnRuimte\extensie-native;
   3. maakt mr-native-host.cmd (Chrome start op Windows alleen .exe/.cmd/.bat) en com.tarasevych.mijnruimte.json;
   4. registreert de host voor Chrome, Edge en Chromium onder HKCU\Software\...\NativeMessagingHosts\com.tarasevych.mijnruimte;
   5. maakt %USERPROFILE%\.mijn-ruimte met toegang alleen voor u (en SYSTEM) — daar zet de host bij elke start een nieuw token;
   6. toont de MCP-instelling voor Claude Desktop en Claude Code.
  Het verandert niets aan de extensie zelf: «Нативні повідомлення» zet u aan in de opties van de extensie, en de lokale agent werkt
  pas na een passkey-ontgrendeling op de site met «локальний агент» aangevinkt.
#>
[CmdletBinding()]
param(
  [string]$NodePad = '',
  [string]$Doelmap = (Join-Path $env:LOCALAPPDATA 'MijnRuimte\extensie-native'),
  [switch]$ClaudeDesktop
)
$ErrorActionPreference = 'Stop'
$HostNaam = 'com.tarasevych.mijnruimte'
$Bron = $PSScriptRoot
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Stop-Met([string]$tekst) { Write-Host "ПОМИЛКА: $tekst" -ForegroundColor Red; exit 1 }

# ---- 1. node.exe zoeken
function Zoek-Node {
  if ($NodePad) { return $NodePad }
  $c = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  $kandidaten = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    $(if ($env:NVM_SYMLINK) { Join-Path $env:NVM_SYMLINK 'node.exe' }),
    $(if ($env:VOLTA_HOME) { Join-Path $env:VOLTA_HOME 'bin\node.exe' }),
    (Join-Path $env:LOCALAPPDATA 'Volta\bin\node.exe')
  ) | Where-Object { $_ }
  foreach ($k in $kandidaten) { if (Test-Path -LiteralPath $k) { return $k } }
  return $null
}
$node = Zoek-Node
if (-not $node -or -not (Test-Path -LiteralPath $node)) { Stop-Met 'node.exe не знайдено. Встановіть Node.js 18+ (https://nodejs.org) або вкажіть -NodePad.' }
$node = (Resolve-Path -LiteralPath $node).Path
$versie = (& $node -e "process.stdout.write(process.versions.node)") 2>$null
if (-not $versie -or [int]($versie.Split('.')[0]) -lt 18) { Stop-Met "потрібен Node.js 18 або новіший (знайдено: '$versie' у $node)" }
Write-Host "Node.js $versie : $node"

# ---- 2. bestanden kopiëren
foreach ($f in 'mr-native-gemeen.mjs', 'mr-native-host.mjs', 'mr-native-mcp.mjs', 'com.tarasevych.mijnruimte.json') {
  if (-not (Test-Path -LiteralPath (Join-Path $Bron $f))) { Stop-Met "файл $f відсутній поруч зі скриптом ($Bron)" }
}
New-Item -ItemType Directory -Force -Path $Doelmap | Out-Null
foreach ($f in 'mr-native-gemeen.mjs', 'mr-native-host.mjs', 'mr-native-mcp.mjs') { Copy-Item -LiteralPath (Join-Path $Bron $f) -Destination (Join-Path $Doelmap $f) -Force }

# ---- 3. .cmd-wrapper + manifest
# cmd.exe leest een .cmd in de OEM-codepagina: een pad met bv. Cyrillische letters wordt dan kapot gelezen. Daarom het korte
# 8.3-pad als dat bestaat; %~dp0 (map van de wrapper) lost cmd zelf op en is altijd goed.
$nodeVoorCmd = $node
if ($node -match '[^\u0020-\u007e]') {
  try { $nodeVoorCmd = (New-Object -ComObject Scripting.FileSystemObject).GetFile($node).ShortPath } catch { $nodeVoorCmd = $node }
}
$cmdRegels = @('@echo off')
if ($nodeVoorCmd -match '[^\u0020-\u007e]') { $cmdRegels += 'chcp 65001 >nul' }
$cmdRegels += "`"$nodeVoorCmd`" `"%~dp0mr-native-host.mjs`" %*"
$cmdPad = Join-Path $Doelmap 'mr-native-host.cmd'
[System.IO.File]::WriteAllText($cmdPad, (($cmdRegels -join "`r`n") + "`r`n"), $Utf8)

$manifest = Get-Content -LiteralPath (Join-Path $Bron 'com.tarasevych.mijnruimte.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest.path = $cmdPad
if ($manifest.allowed_origins.Count -ne 1 -or $manifest.allowed_origins[0] -ne 'chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/') { Stop-Met 'allowed_origins у шаблоні змінено — встановлення зупинено' }
$manifestPad = Join-Path $Doelmap "$HostNaam.json"
[System.IO.File]::WriteAllText($manifestPad, ($manifest | ConvertTo-Json -Depth 4), $Utf8)

# ---- 4. register (HKCU): Chrome, Edge, Chromium
$sleutels = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostNaam",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostNaam",
  "HKCU:\Software\Chromium\NativeMessagingHosts\$HostNaam"
)
foreach ($k in $sleutels) {
  New-Item -Path $k -Force | Out-Null
  Set-Item -Path $k -Value $manifestPad
  Write-Host "Зареєстровано: $k"
}

# ---- 5. ~/.mijn-ruimte alleen voor de gebruiker
$dataMap = Join-Path $env:USERPROFILE '.mijn-ruimte'
New-Item -ItemType Directory -Force -Path $dataMap | Out-Null
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $dataMap /inheritance:r /grant:r "*${sid}:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
  Write-Host "Права на $dataMap : лише ви та SYSTEM"
} catch { Write-Warning "icacls не вдалося: $($_.Exception.Message) (папка у вашому профілі все одно недоступна іншим користувачам)" }

# ---- 6. MCP-instelling
$mcpPad = Join-Path $Doelmap 'mr-native-mcp.mjs'
$item = [ordered]@{ command = $node; args = @($mcpPad) }
if ($ClaudeDesktop) {
  $cfgPad = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
  New-Item -ItemType Directory -Force -Path (Split-Path $cfgPad) | Out-Null
  $cfg = if (Test-Path -LiteralPath $cfgPad) { Copy-Item -LiteralPath $cfgPad -Destination "$cfgPad.bak" -Force; Get-Content -LiteralPath $cfgPad -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }
  if (-not $cfg.PSObject.Properties['mcpServers']) { $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) }
  if ($cfg.mcpServers.PSObject.Properties['mijn-ruimte-lokaal']) { $cfg.mcpServers.PSObject.Properties.Remove('mijn-ruimte-lokaal') }
  $cfg.mcpServers | Add-Member -NotePropertyName 'mijn-ruimte-lokaal' -NotePropertyValue ([pscustomobject]$item)
  [System.IO.File]::WriteAllText($cfgPad, ($cfg | ConvertTo-Json -Depth 20), $Utf8)
  Write-Host "Claude Desktop: додано 'mijn-ruimte-lokaal' до $cfgPad (копія: .bak). Перезапустіть Claude Desktop."
}
$json = ([ordered]@{ mcpServers = [ordered]@{ 'mijn-ruimte-lokaal' = $item } } | ConvertTo-Json -Depth 5)
Write-Host ''
Write-Host 'Готово. Далі:' -ForegroundColor Green
Write-Host ' 1. Перезапустіть Chrome/Edge. У налаштуваннях розширення «Мій простір» увімкніть «Нативні повідомлення» (дозвіл nativeMessaging).'
Write-Host ' 2. На сайті розблокуйте розширення своїм passkey і позначте «локальний агент».'
Write-Host ' 3. Claude Desktop (%APPDATA%\Claude\claude_desktop_config.json):'
Write-Host $json
Write-Host ' 4. Claude Code:'
Write-Host "    claude mcp add mijn-ruimte-lokaal -- `"$node`" `"$mcpPad`""
