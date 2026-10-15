<#
  Mijn Ruimte: maak en onderteken een uitrolpakket op de PC van de eigenaar (Windows PowerShell 5+ of PowerShell 7).
  Створює й підписує пакет випуску на ПК власника.

  Gebruik / Використання:
    powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 [-Bron C:\pad\naar\repo] [-Sleutel T:\mijn-ruimte\geheim\uitrol-sleutel] [-Uit $env:USERPROFILE\Desktop]

  Resultaat / Результат:
    mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz       (git archive van HEAD + UITROL-VERSIE)
    mijn-ruimte-<JJJJMMDD-UUMMSS>.tar.gz.sig   (ssh-keygen -Y sign, naamruimte mijn-ruimte-uitrol)
    mijn-ruimte-<JJJJMMDD-UUMMSS>.txt          (versie, grootte, sha256: nodig voor rollout_upload_begin)

  Vereist: Git for Windows >= 2.40 (--add-virtual-file) en OpenSSH-client (ssh-keygen, standaard in Windows 10/11).
  De privésleutel verlaat de PC nooit; ssh-keygen vraagt de wachtwoordzin.
#>
param(
  [string]$Bron = (Get-Location).Path,
  [string]$Sleutel = 'T:\mijn-ruimte\geheim\uitrol-sleutel',
  [string]$Uit = (Get-Location).Path
)
$ErrorActionPreference = 'Stop'
function Stop-Met($uk, $nl) { Write-Host "ПОМИЛКА: $uk" -ForegroundColor Red; Write-Host "FOUT: $nl" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Sleutel)) { Stop-Met "Немає ключа $Sleutel (підключіть диск T:)." "Sleutel $Sleutel niet gevonden (is schijf T: gekoppeld?)." }
$gitv = (git --version) -replace '[^0-9.]', ''
$p = $gitv.Split('.'); if ([int]$p[0] -lt 2 -or ([int]$p[0] -eq 2 -and [int]$p[1] -lt 40)) { Stop-Met "Потрібен Git 2.40 або новіший." "Git 2.40 of nieuwer is nodig." }
Push-Location $Bron
try {
  if (git status --porcelain --untracked-files=no) { Stop-Met "Є незакомічені зміни; пакет бере лише HEAD." "Er zijn niet-gecommitte wijzigingen; het pakket bevat alleen HEAD." }
  $versie = Get-Date -Format 'yyyyMMdd-HHmmss'
  $commit = (git rev-parse HEAD).Trim()
  if (-not $env:AUTEUR) { Stop-Met "Встановіть AUTEUR." "Zet AUTEUR." }
  if ($env:AGENT -notmatch '^[a-z][a-z0-9-]{1,31}$') { Stop-Met "Встановіть AGENT (claude/cursor/gpt)." "Zet AGENT." }
  if (-not $env:SAMENVATTING -or $env:SAMENVATTING.Length -lt 20) { Stop-Met "Встановіть SAMENVATTING (>=20)." "Zet SAMENVATTING (>=20)." }
  $naam = "mijn-ruimte-$versie.tar.gz"
  $doel = Join-Path $Uit $naam
  git archive --format=tar.gz --prefix="mijn-ruimte-$versie/" --add-virtual-file="mijn-ruimte-$versie/UITROL-VERSIE:$versie" --add-virtual-file="mijn-ruimte-$versie/BRON-COMMIT:$commit" --add-virtual-file="mijn-ruimte-$versie/AUTEUR:$env:AUTEUR" --add-virtual-file="mijn-ruimte-$versie/AGENT:$env:AGENT" --add-virtual-file="mijn-ruimte-$versie/SAMENVATTING:$env:SAMENVATTING" -o $doel HEAD
  if ($LASTEXITCODE -ne 0) { Stop-Met "git archive не вдався." "git archive mislukt." }
} finally { Pop-Location }

ssh-keygen -Y sign -f $Sleutel -n mijn-ruimte-uitrol $doel
if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$doel.sig")) { Stop-Met "Підписати не вдалося." "Ondertekenen mislukt." }

# Zelfcontrole met de publieke sleutel (zelfde controle als op de server).
$pub = (Get-Content "$Sleutel.pub" -Raw).Trim()
$ond = Join-Path $env:TEMP "uitrol-ondertekenaars-$versie"
Set-Content -Path $ond -Value "uitrol@mijn-ruimte namespaces=`"mijn-ruimte-uitrol,git`" $pub" -Encoding ascii
cmd /c "ssh-keygen -Y verify -f `"$ond`" -I uitrol@mijn-ruimte -n mijn-ruimte-uitrol -s `"$doel.sig`" < `"$doel`""
$ok = $LASTEXITCODE; Remove-Item $ond -Force
if ($ok -ne 0) { Stop-Met "Перевірка підпису не пройшла." "Controle van de handtekening mislukt." }

$bytes = (Get-Item $doel).Length
$sha = (Get-FileHash -Algorithm SHA256 $doel).Hash.ToLower()
$info = Join-Path $Uit "mijn-ruimte-$versie.txt"
@("versie=$versie", "commit=$commit", "bytes=$bytes", "sha256=$sha") | Set-Content -Path $info -Encoding ascii
Write-Host "Готово / Klaar:" -ForegroundColor Green
Write-Host "  $doel"; Write-Host "  $doel.sig"; Write-Host "  $info"
Write-Host "  versie=$versie  bytes=$bytes  sha256=$sha"
