<#
  Mijn Ruimte — lokaal kanaal van de browserextensie verwijderen (Windows, huidige gebruiker).

    powershell -ExecutionPolicy Bypass -File .\verwijder-windows.ps1
    powershell -ExecutionPolicy Bypass -File .\verwijder-windows.ps1 -ClaudeDesktop   # ook uit claude_desktop_config.json

  Verwijdert de registersleutels (Chrome, Edge, Chromium), de map %LOCALAPPDATA%\MijnRuimte\extensie-native en het token.
  De extensie zelf en %USERPROFILE%\.mijn-ruimte (kan ook door de pc-agent gebruikt worden) blijven staan.
#>
[CmdletBinding()]
param(
  [string]$Doelmap = (Join-Path $env:LOCALAPPDATA 'MijnRuimte\extensie-native'),
  [switch]$ClaudeDesktop
)
$ErrorActionPreference = 'Stop'
$HostNaam = 'com.tarasevych.mijnruimte'
$Utf8 = New-Object System.Text.UTF8Encoding $false

foreach ($k in "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostNaam", "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostNaam", "HKCU:\Software\Chromium\NativeMessagingHosts\$HostNaam") {
  if (Test-Path $k) { Remove-Item -Path $k -Recurse -Force; Write-Host "Видалено: $k" }
}
if (Test-Path -LiteralPath $Doelmap) { Remove-Item -LiteralPath $Doelmap -Recurse -Force; Write-Host "Видалено: $Doelmap" }
$token = Join-Path $env:USERPROFILE '.mijn-ruimte\extensie-token'
if (Test-Path -LiteralPath $token) { Remove-Item -LiteralPath $token -Force; Write-Host "Видалено: $token" }

if ($ClaudeDesktop) {
  $cfgPad = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
  if (Test-Path -LiteralPath $cfgPad) {
    $cfg = Get-Content -LiteralPath $cfgPad -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($cfg.PSObject.Properties['mcpServers'] -and $cfg.mcpServers.PSObject.Properties['mijn-ruimte-lokaal']) {
      Copy-Item -LiteralPath $cfgPad -Destination "$cfgPad.bak" -Force
      $cfg.mcpServers.PSObject.Properties.Remove('mijn-ruimte-lokaal')
      [System.IO.File]::WriteAllText($cfgPad, ($cfg | ConvertTo-Json -Depth 20), $Utf8)
      Write-Host "Claude Desktop: 'mijn-ruimte-lokaal' прибрано (копія: .bak)."
    }
  }
}
Write-Host 'Готово. Claude Code: claude mcp remove mijn-ruimte-lokaal' -ForegroundColor Green
Write-Host 'У налаштуваннях розширення можна також вимкнути «Нативні повідомлення».'
