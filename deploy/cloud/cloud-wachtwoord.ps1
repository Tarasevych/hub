<#
  Hulpje voor rclone (--password-command / RCLONE_PASSWORD_COMMAND): geeft het wachtwoord waarmee
  rclone.conf versleuteld is. Het wachtwoord staat DPAPI-versleuteld in config-wachtwoord.dpapi en is
  alleen te ontsleutelen door gebruiker t op DEZE pc (Windows-gebruikersprofiel). Niet zelf starten.
#>
param([string]$Bestand = (Join-Path $env:LOCALAPPDATA 'mijn-ruimte\rclone\config-wachtwoord.dpapi'))
$ErrorActionPreference = 'Stop'
$ss = (Get-Content -LiteralPath $Bestand -Raw).Trim() | ConvertTo-SecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) + "`n") }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
