<#
  Mijn Ruimte: ondertekende uitrol-tag maken en naar GitHub sturen (methode 1, GitOps-pull). Windows PowerShell 5+ of PowerShell 7.
  Створює підписаний тег uitrol-РРРРММДД-ГГХХ (час UTC) і надсилає його в GitHub. Сервер забирає його протягом 5 хвилин.

  Gebruik / Використання:
    powershell -ExecutionPolicy Bypass -File scripts\onderteken-uitrol.ps1 [-Bron C:\pad\naar\repo] [-Sleutel T:\mijn-ruimte\geheim\uitrol-sleutel]
                                                                        [-Remote origin] [-Ref HEAD] [-ZonderPush]

  Wat het doet / Що робить:
    1. controleert: schone werkmap, sleutel + .pub aanwezig, Git >= 2.34 (ssh-ondertekening), ssh-agent draait;
    2. ssh-add -t 600 <sleutel>: de WACHTWOORDZIN vraagt ssh-add zelf; dit script ziet of bewaart hem nooit,
       en de sleutel blijft hooguit 10 minuten in de agent (aan het eind weer verwijderd);
    3. git tag -s uitrol-JJJJMMDD-UUMM (UTC) met gpg.format=ssh en user.signingkey=<sleutel>.pub;
    4. zelfcontrole met git verify-tag (zelfde controle als op de server);
    5. git push <remote> refs/tags/<tag> (met UW eigen git-toegang op deze pc; de server gebruikt alleen een alleen-lezen deploy key).
  De privésleutel verlaat de pc nooit.
#>
param(
  [string]$Bron = (Get-Location).Path,
  [string]$Sleutel = 'T:\mijn-ruimte\geheim\uitrol-sleutel',
  [string]$Remote = 'origin',
  [string]$Ref = 'HEAD',
  [switch]$ZonderPush
)
$ErrorActionPreference = 'Stop'
function Stop-Met($uk, $nl) { Write-Host "ПОМИЛКА: $uk" -ForegroundColor Red; Write-Host "FOUT: $nl" -ForegroundColor Red; exit 1 }
function Zeg($uk, $nl) { Write-Host $uk; Write-Host $nl -ForegroundColor DarkGray }

# Windows-OpenSSH gebruiken (die praat met de Windows-ssh-agent); de ssh-keygen van Git for Windows kan dat niet.
$openssh = Join-Path $env:WINDIR 'System32\OpenSSH'
$sshKeygen = if (Test-Path (Join-Path $openssh 'ssh-keygen.exe')) { Join-Path $openssh 'ssh-keygen.exe' } else { (Get-Command ssh-keygen -ErrorAction SilentlyContinue).Source }
$sshAdd = if (Test-Path (Join-Path $openssh 'ssh-add.exe')) { Join-Path $openssh 'ssh-add.exe' } else { (Get-Command ssh-add -ErrorAction SilentlyContinue).Source }
if (-not $sshKeygen -or -not $sshAdd) { Stop-Met "Немає OpenSSH-клієнта (ssh-keygen, ssh-add)." "OpenSSH-client (ssh-keygen, ssh-add) ontbreekt." }

if (-not (Test-Path $Sleutel)) { Stop-Met "Немає ключа $Sleutel (підключіть диск T:)." "Sleutel $Sleutel niet gevonden (is schijf T: gekoppeld?)." }
$pubPad = "$Sleutel.pub"
if (-not (Test-Path $pubPad)) { Stop-Met "Немає публічного ключа $pubPad." "Publieke sleutel $pubPad ontbreekt." }
$gitv = ((git --version) -replace '[^0-9.]', '').Split('.')
if ([int]$gitv[0] -lt 2 -or ([int]$gitv[0] -eq 2 -and [int]$gitv[1] -lt 34)) { Stop-Met "Потрібен Git 2.34 або новіший." "Git 2.34 of nieuwer is nodig." }

$agent = Get-Service ssh-agent -ErrorAction SilentlyContinue
if (-not $agent) { Stop-Met "Служби ssh-agent немає (встановіть OpenSSH-клієнт Windows)." "De dienst ssh-agent bestaat niet (installeer de Windows OpenSSH-client)." }
if ($agent.Status -ne 'Running') {
  try { Start-Service ssh-agent } catch {
    Stop-Met "ssh-agent не запущено. Один раз у PowerShell від імені адміністратора: Set-Service ssh-agent -StartupType Manual; Start-Service ssh-agent" `
             "ssh-agent draait niet. Eenmalig in PowerShell als beheerder: Set-Service ssh-agent -StartupType Manual; Start-Service ssh-agent"
  }
}

Push-Location $Bron
$tmp = $null
try {
  if (git status --porcelain --untracked-files=no) { Stop-Met "Є незакомічені зміни; підписується лише коміт." "Er zijn niet-gecommitte wijzigingen; alleen een commit wordt ondertekend." }
  $commit = (git rev-parse --verify "$Ref^{commit}").Trim()
  if ($LASTEXITCODE -ne 0) { Stop-Met "Невідомий коміт $Ref." "Onbekende commit $Ref." }
  $tag = 'uitrol-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm')
  git rev-parse -q --verify "refs/tags/$tag" *> $null
  if ($LASTEXITCODE -eq 0) { Stop-Met "Тег $tag уже є; зачекайте хвилину." "Tag $tag bestaat al; wacht een minuut." }
  if (-not $ZonderPush -and (git ls-remote --tags $Remote "refs/tags/$tag")) { Stop-Met "Тег $tag уже є на $Remote." "Tag $tag bestaat al op $Remote." }

  Zeg "Введіть пароль ключа (його запитує ssh-add, скрипт його не бачить і не зберігає)." "Voer de wachtwoordzin van de sleutel in (ssh-add vraagt erom; dit script ziet of bewaart hem niet)."
  & $sshAdd -t 600 $Sleutel
  if ($LASTEXITCODE -ne 0) { Stop-Met "ssh-add не вдався (неправильний пароль?)." "ssh-add mislukt (verkeerde wachtwoordzin?)." }

  git -c gpg.format=ssh -c "user.signingkey=$pubPad" -c "gpg.ssh.program=$sshKeygen" tag -s $tag -m "Uitrol $tag ($commit)" $commit
  if ($LASTEXITCODE -ne 0) { Stop-Met "Підписати тег не вдалося." "Ondertekenen van de tag mislukt." }

  # Zelfcontrole met hetzelfde soort ondertekenaarsbestand als op de server.
  $pub = (Get-Content $pubPad -Raw).Trim().Split(' ')
  $tmp = Join-Path $env:TEMP "uitrol-ondertekenaars-$tag"
  Set-Content -Path $tmp -Value "uitrol@mijn-ruimte namespaces=`"mijn-ruimte-uitrol,git`" $($pub[0]) $($pub[1])" -Encoding ascii
  # verify-tag schrijft naar stderr; in Windows PowerShell 5.1 mag dat met 2>&1 geen afbrekende fout worden.
  $ErrorActionPreference = 'Continue'
  $uit = git -c gpg.format=ssh -c "gpg.ssh.allowedSignersFile=$tmp" -c "gpg.ssh.program=$sshKeygen" verify-tag --raw $tag 2>&1 | Out-String
  $verifyCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($verifyCode -ne 0 -or $uit -notmatch 'Good "git" signature for uitrol@mijn-ruimte') {
    git tag -d $tag | Out-Null
    Stop-Met "Перевірка підпису тегу не пройшла; тег видалено." "Controle van de tag-handtekening mislukt; tag verwijderd."
  }

  if ($ZonderPush) {
    Zeg "Тег $tag створено локально (без надсилання)." "Tag $tag lokaal gemaakt (niet gepusht)."
  } else {
    git push $Remote "refs/tags/${tag}:refs/tags/${tag}"
    if ($LASTEXITCODE -ne 0) { Stop-Met "Надіслати тег не вдалося." "Pushen van de tag mislukt." }
    Write-Host "Готово / Klaar: $tag → $commit" -ForegroundColor Green
    Zeg "Сервер встановить його протягом ~5 хвилин (якщо GitOps увімкнено). Стан: сайт → MCP → «Керування сервером»." `
        "De server installeert hem binnen ~5 minuten (als GitOps aan staat). Stand: site → MCP → 'Serverbeheer'."
  }
} finally {
  if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force }
  $ErrorActionPreference = 'Continue'
  & $sshAdd -d $pubPad 2>$null | Out-Null   # sleutel weer uit de agent
  Pop-Location
}
