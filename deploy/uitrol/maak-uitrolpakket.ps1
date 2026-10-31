<#
  Mijn Ruimte: maak en onderteken een uitrolpakket op de PC van de eigenaar (Windows PowerShell 5+ of PowerShell 7).
  Створює й підписує пакет випуску на ПК власника.

  Gebruik / Використання:
    powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 [-Bron C:\pad\naar\repo] [-Sleutel T:\mijn-ruimte\geheim\uitrol-sleutel] [-Uit $env:USERPROFILE\Desktop] [-ZonderGit "reden"]

  Regel 3 (deploy/REGELS-UITROLPAKKET.md): BRON-COMMIT is verplicht — normaal HEAD van git. Alleen buiten git met -ZonderGit "reden"
  (minstens 5 tekens): BRON-COMMIT = «zonder-git:<reden>», zichtbaar als waarschuwing op de site. Zonder git en zonder -ZonderGit stopt
  dit script, want de server weigert zo'n pakket (GEEN_BRON_COMMIT).

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
  [string]$Uit = (Get-Location).Path,
  [string]$ZonderGit = ''
)
$ErrorActionPreference = 'Stop'
function Stop-Met($uk, $nl) { Write-Host "ПОМИЛКА: $uk" -ForegroundColor Red; Write-Host "FOUT: $nl" -ForegroundColor Red; exit 1 }

if (-not (Test-Path $Sleutel)) { Stop-Met "Немає ключа $Sleutel (підключіть диск T:)." "Sleutel $Sleutel niet gevonden (is schijf T: gekoppeld?)." }
$ZonderGit = ($ZonderGit -replace '\s+', ' ').Trim()
if ($ZonderGit -and $ZonderGit.Length -lt 5) { Stop-Met "-ZonderGit потребує причини (мінімум 5 символів)." "-ZonderGit vraagt een reden (minstens 5 tekens)." }
if (-not $ZonderGit) {
  $gitv = (git --version) -replace '[^0-9.]', ''
  $p = $gitv.Split('.'); if ([int]$p[0] -lt 2 -or ([int]$p[0] -eq 2 -and [int]$p[1] -lt 40)) { Stop-Met "Потрібен Git 2.40 або новіший." "Git 2.40 of nieuwer is nodig." }
}
Push-Location $Bron
try {
  if (-not $ZonderGit) {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Met "Це не git-репозиторій. Зберіть з git або вкажіть -ZonderGit `"причина`" (deploy/REGELS-UITROLPAKKET.md)." "Geen git-repository. Bouw vanuit git of geef -ZonderGit `"reden`" (deploy/REGELS-UITROLPAKKET.md)." }
    if (git status --porcelain --untracked-files=no) { Stop-Met "Є незакомічені зміни; пакет бере лише HEAD." "Er zijn niet-gecommitte wijzigingen; het pakket bevat alleen HEAD." }
  }
  $versie = Get-Date -Format 'yyyyMMdd-HHmmss'
  if ($ZonderGit) { $commit = "zonder-git:$ZonderGit"; Write-Host "УВАГА / LET OP: пакет збирається ПОЗА git (BRON-COMMIT = $commit)." -ForegroundColor Yellow }
  else { $commit = (git rev-parse HEAD).Trim(); if ($commit -notmatch '^[0-9a-f]{40}$') { Stop-Met "git rev-parse HEAD не дав повного коміту." "git rev-parse HEAD gaf geen volledige commit." } }
  if (-not $env:AUTEUR) { Stop-Met "Встановіть AUTEUR." "Zet AUTEUR." }
  if ($env:AGENT -notmatch '^[a-z][a-z0-9-]{1,31}$') { Stop-Met "Встановіть AGENT (claude/cursor/gpt)." "Zet AGENT." }
  if (-not $env:SAMENVATTING -or $env:SAMENVATTING.Length -lt 20) { Stop-Met "Встановіть SAMENVATTING (>=20)." "Zet SAMENVATTING (>=20)." }
  # ORCH-001 (31.10.2026): UITROL-BASIS — op welke GEÏNSTALLEERDE versie en commit dit pakket is gebouwd (BASIS_VERSIE + BASIS_COMMIT);
  # root weigert een pakket waarvan de basis ouder is dan wat er staat (BASIS_VEROUDERD), en vanaf 20261201-000000 zonder basis (GEEN_BASIS).
  $basisTekst = ''
  if ($env:BASIS_VERSIE -or $env:BASIS_COMMIT) {
    if ($env:BASIS_VERSIE -notmatch '^[0-9]{8}-[0-9]{6}$' -or $env:BASIS_COMMIT -notmatch '^[0-9a-f]{40}$') {
      Stop-Met "BASIS_VERSIE (JJJJMMDD-UUMMSS) і BASIS_COMMIT (40 hex) мають бути задані разом і бути коректними." "BASIS_VERSIE (JJJJMMDD-UUMMSS) en BASIS_COMMIT (40 hex) horen samen en moeten geldig zijn."
    }
    $basisTekst = "versie=$($env:BASIS_VERSIE)`ncommit=$($env:BASIS_COMMIT)"
    if (Test-Path 'orchestratie/regels.lock.json') {
      $lockJson = Get-Content 'orchestratie/regels.lock.json' -Raw -Encoding UTF8 | ConvertFrom-Json
      $basisTekst += "`nregelsVersie=$($lockJson.regelsVersie)`nregelsHash=$($lockJson.hash)"
    }
  } elseif ($versie -ge '20261201-000000') {
    Stop-Met "Встановіть BASIS_VERSIE і BASIS_COMMIT (встановлена база) — root відхилить пакет без UITROL-BASIS (GEEN_BASIS)." "Zet BASIS_VERSIE en BASIS_COMMIT (geïnstalleerde basis) — root weigert pakketten zonder UITROL-BASIS (GEEN_BASIS)."
  }
  $naam = "mijn-ruimte-$versie.tar.gz"
  $doel = Join-Path $Uit $naam
  if (-not $ZonderGit) {
    $gitArgs = @(
      'archive', '--format=tar.gz', "--prefix=mijn-ruimte-$versie/",
      "--add-virtual-file=mijn-ruimte-$versie/UITROL-VERSIE:$versie",
      "--add-virtual-file=mijn-ruimte-$versie/BRON-COMMIT:$commit",
      "--add-virtual-file=mijn-ruimte-$versie/AUTEUR:$env:AUTEUR",
      "--add-virtual-file=mijn-ruimte-$versie/AGENT:$env:AGENT",
      "--add-virtual-file=mijn-ruimte-$versie/SAMENVATTING:$env:SAMENVATTING"
    )
    if ($basisTekst) { $gitArgs += "--add-virtual-file=mijn-ruimte-$versie/UITROL-BASIS:$basisTekst" }
    $gitArgs += @('-o', $doel, 'HEAD')
    & git @gitArgs
    if ($LASTEXITCODE -ne 0) { Stop-Met "git archive не вдався." "git archive mislukt." }
  } else {
    # Buiten git: kopie van de werkmap zonder bouwresten, metadata erbij, één bovenmap; tar.exe zit in Windows 10/11.
    $stage = Join-Path $env:TEMP "mijn-ruimte-stage-$versie"; $binnen = Join-Path $stage "mijn-ruimte-$versie"
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $binnen -Force | Out-Null
    robocopy . $binnen /E /NFL /NDL /NJH /NJS /NP /XD node_modules dist dist-server .git rapporten harness /XF *.bak "mijn-ruimte-*.tar.gz*" | Out-Null
    if ($LASTEXITCODE -ge 8) { Stop-Met "Копіювання не вдалося (robocopy)." "Kopiëren mislukt (robocopy)." }
    $metaParen = @(@('UITROL-VERSIE', $versie), @('BRON-COMMIT', $commit), @('AUTEUR', $env:AUTEUR), @('AGENT', $env:AGENT), @('SAMENVATTING', $env:SAMENVATTING))
    if ($basisTekst) { $metaParen += ,@('UITROL-BASIS', "$basisTekst`n") }
    foreach ($kv in $metaParen) {
      [System.IO.File]::WriteAllText((Join-Path $binnen $kv[0]), [string]$kv[1], (New-Object System.Text.UTF8Encoding($false)))
    }
    tar -czf $doel -C $stage "mijn-ruimte-$versie"
    $rc = $LASTEXITCODE; Remove-Item $stage -Recurse -Force
    if ($rc -ne 0) { Stop-Met "tar не вдався." "tar mislukt." }
  }
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
