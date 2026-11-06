<#
.SYNOPSIS
  EENMALIG (Pavlo): koppelt rclone aan Google Drive met de beperkte scope drive.file.
  ОДНОРАЗОВО (Власник): підключає rclone до Google Drive з обмеженим доступом drive.file.

.DESCRIPTION
  Vooraf: een eigen OAuth-client (type "Desktop app") in Google Cloud, zie scripts\cloud\UITLEG-LEESMIJ.txt.
  Заздалегідь: власний OAuth-клієнт (тип "Desktop app") у Google Cloud, див. UITLEG-LEESMIJ.txt.
  1. controleert rclone.exe (SHA256)
  2. maakt %LOCALAPPDATA%\mijn-ruimte\rclone\ met ACL alleen voor t
  3. maakt een willekeurig config-wachtwoord, DPAPI-versleuteld (alleen t op deze pc)
  4. maakt een lege VERSLEUTELDE rclone.conf
  5. vraagt Client ID + Client secret en start: rclone config create gdrive drive scope=drive.file ...
     -> de browser opent; log in bij Google en klik "Toestaan / Allow"
  6. test: map mijn-ruimte-reservekopie op Drive aanmaken en zien
  7. biedt aan om meteen de eerste upload te doen
  Gewone PowerShell (NIET als administrator):
    powershell -NoProfile -ExecutionPolicy Bypass -File T:\mijn-ruimte\scripts\cloud\cloud-koppelen.ps1
#>
[CmdletBinding()]
param(
  [string]$Project = 'T:\mijn-ruimte',
  [string]$Reserve = 'R:\mijn-ruimte-reservekopie',
  [string]$ConfigMap = (Join-Path $env:LOCALAPPDATA 'mijn-ruimte\rclone'),
  [string]$Naam = 'gdrive',
  [string]$Map = 'mijn-ruimte-reservekopie',
  [switch]$Opnieuw
)
$ErrorActionPreference = 'Stop'
$RcloneSha256 = '033eee51c9ad47c2de2624b6674d355274bcd6cf0027a5f85db4437ba24ae81c'
$Rclone = Join-Path $Project 'hulpmiddelen\rclone\rclone.exe'
$Config = Join-Path $ConfigMap 'rclone.conf'
$WwBlob = Join-Path $ConfigMap 'config-wachtwoord.dpapi'
$WwScript = Join-Path $PSScriptRoot 'cloud-wachtwoord.ps1'
function Zeg([string]$ua, [string]$nl, [string]$kleur = 'Cyan') { Write-Host $ua -ForegroundColor $kleur; if ($nl) { Write-Host "  $nl" -ForegroundColor DarkGray } }
function Rc { $oud = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $Rclone @args } finally { $ErrorActionPreference = $oud } }
function Log([string]$t) {
  $pad = Join-Path $Reserve 'cloud'
  try { New-Item -ItemType Directory -Force -Path $pad | Out-Null; Add-Content -LiteralPath (Join-Path $pad 'cloud.log') -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $t) -Encoding UTF8 } catch { }
}

try {
  # 1. rclone.exe
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Rclone).Hash.ToLower() -ne $RcloneSha256) { throw "rclone.exe wijkt af van de gecontroleerde versie / rclone.exe змінено: $Rclone" }
  Zeg '1/6 rclone.exe перевірено (SHA256 OK)' 'rclone.exe gecontroleerd'

  # 2. Map met ACL alleen voor t.
  New-Item -ItemType Directory -Force -Path $ConfigMap, (Join-Path $ConfigMap 'cache'), (Join-Path $ConfigMap 'tmp') | Out-Null
  $ik = "$env:USERDOMAIN\$env:USERNAME"
  & icacls.exe $ConfigMap /inheritance:r /grant:r "${ik}:(OI)(CI)F" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls mislukt op $ConfigMap" }
  $uitleg = Join-Path $PSScriptRoot 'config-UITLEG-LEESMIJ.txt'
  if (Test-Path -LiteralPath $uitleg) { Copy-Item -LiteralPath $uitleg -Destination (Join-Path $ConfigMap 'UITLEG-LEESMIJ.txt') -Force }
  Zeg "2/6 тека налаштувань: $ConfigMap (доступ лише $ik)" "configmap met ACL alleen voor $ik"

  # 3. DPAPI-wachtwoord voor de config.
  if (-not (Test-Path -LiteralPath $WwBlob)) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ConvertTo-SecureString ([Convert]::ToBase64String($bytes)) -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $WwBlob -Encoding ASCII
    [Array]::Clear($bytes, 0, $bytes.Length)
  }
  $env:RCLONE_CONFIG = $Config
  $env:RCLONE_PASSWORD_COMMAND = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $WwScript -Bestand $WwBlob"
  $env:RCLONE_ASK_PASSWORD = 'false'

  # 4. Lege, versleutelde rclone.conf.
  if (-not (Test-Path -LiteralPath $Config)) {
    Rc config encryption set | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'rclone config encryption set mislukt' }
  }
  if ((Get-Content -LiteralPath $Config -TotalCount 3) -notcontains 'RCLONE_ENCRYPT_V0:') { throw "$Config is niet versleuteld; gestopt" }
  Zeg '3/6 файл налаштувань rclone зашифровано (пароль захищено Windows DPAPI)' 'rclone.conf versleuteld (wachtwoord via DPAPI)'

  # 5. Google-login.
  $bestaand = @(Rc listremotes) -contains "${Naam}:"
  if ($bestaand -and -not $Opnieuw) {
    Zeg "4/6 '$Naam' вже підключено; пропускаю вхід (для повторного входу: -Opnieuw)" "'$Naam' bestaat al; login overgeslagen (opnieuw: -Opnieuw)" 'Yellow'
  } else {
    if ($bestaand) { Rc config delete $Naam | Out-Null }
    Zeg '4/6 Вставте дані OAuth-клієнта з Google Cloud (тип Desktop app).' 'Plak de gegevens van de OAuth-client (Desktop app) uit Google Cloud.'
    $id = (Read-Host 'Client ID (...apps.googleusercontent.com)').Trim()
    if ($id -notmatch '^[0-9]+-[0-9a-z]+\.apps\.googleusercontent\.com$') { throw 'dit lijkt geen Client ID / це не схоже на Client ID' }
    $ss = Read-Host 'Client secret (не видно під час введення / onzichtbaar)' -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
    try { $geheim = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    if (-not $geheim.Trim()) { throw 'leeg client secret' }
    Zeg '5/6 Зараз відкриється браузер: увійдіть у свій Google-акаунт і натисніть «Дозволити/Allow».' 'De browser opent: log in bij Google en klik op Toestaan/Allow.'
    Zeg '    Якщо браузер не відкрився - відкрийте посилання http://127.0.0.1:53682/auth?... з цього вікна.' 'Opent er niets: open de link http://127.0.0.1:53682/auth?... uit dit venster.'
    Rc config create $Naam drive "client_id=$id" "client_secret=$($geheim.Trim())" 'scope=drive.file'
    $code = $LASTEXITCODE; $geheim = $null
    if ($code -ne 0) { throw "rclone config create mislukt (code $code)" }
  }

  # 6. Test.
  Rc mkdir "${Naam}:$Map"
  if ($LASTEXITCODE -ne 0) { throw 'map op Google Drive aanmaken mislukt' }
  $zie = @(Rc lsf "${Naam}:" --dirs-only)
  if ($zie -notcontains "$Map/") { throw "map $Map niet zichtbaar op Drive" }
  Zeg "6/6 OK: Google Drive підключено, тека '$Map' існує (rclone бачить лише свої файли)." "OK: gekoppeld, map '$Map' bestaat (rclone ziet alleen zijn eigen bestanden)." 'Green'
  Log "GEKOPPELD: ${Naam}: (drive.file) door $ik"

  $a = Read-Host 'Зробити перше вивантаження зараз? / Nu de eerste upload doen? (J/n)'
  if ($a -notmatch '^(n|nee|н|ні)$') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'cloud-reservekopie.ps1') -Project $Project -Reserve $Reserve -ConfigMap $ConfigMap -Remote "${Naam}:$Map"
    if ($LASTEXITCODE -eq 0) { Zeg 'Готово. Далі все відбувається автоматично щодня о 09:00.' 'Klaar. Vanaf nu automatisch elke dag na 09:00.' 'Green' }
    else { Zeg "Вивантаження з помилкою (код $LASTEXITCODE), див. $Reserve\cloud\cloud.log" "Upload met fout, zie cloud.log" 'Red' }
  }
} catch {
  Zeg "ПОМИЛКА / FOUT: $($_.Exception.Message)" '' 'Red'
  exit 1
} finally {
  Remove-Item Env:RCLONE_CONFIG, Env:RCLONE_PASSWORD_COMMAND, Env:RCLONE_ASK_PASSWORD -ErrorAction SilentlyContinue
}
