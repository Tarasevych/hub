<#
  Controleert de herstelset: elk bestand uit SHA256SUMS.txt moet bestaan en dezelfde SHA256 hebben.
  Перевіряє набір відновлення: кожен файл із SHA256SUMS.txt має існувати і мати ту саму SHA256.
  Starten / запуск (у теці набору):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\controleer-herstelset.ps1
#>
$ErrorActionPreference = 'Stop'
$map = $PSScriptRoot
$lijst = Join-Path $map 'SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $lijst)) { Write-Output 'FOUT / ПОМИЛКА: SHA256SUMS.txt ontbreekt / відсутній'; exit 2 }
$goed = 0; $fout = 0; $bekend = @{}
foreach ($r in Get-Content -LiteralPath $lijst -Encoding UTF8) {
  if ($r -notmatch '^([0-9a-f]{64})  (.+)$') { continue }
  $rel = $Matches[2]; $bekend[$rel] = 1
  $f = Join-Path $map $rel
  if (-not (Test-Path -LiteralPath $f)) { Write-Output "ONTBREEKT / ВІДСУТНІЙ: $rel"; $fout++; continue }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash.ToLower() -ne $Matches[1]) { Write-Output "BESCHADIGD / ПОШКОДЖЕНИЙ: $rel"; $fout++ } else { $goed++ }
}
foreach ($f in Get-ChildItem -LiteralPath $map -Recurse -File) {
  $rel = $f.FullName.Substring($map.TrimEnd('\').Length + 1)
  if ($rel -ne 'SHA256SUMS.txt' -and -not $bekend.ContainsKey($rel)) { Write-Output "EXTRA (niet in de lijst / не в списку): $rel" }
}
if ($fout -eq 0) { Write-Output "OK: $goed bestanden in orde / $goed файлів у порядку"; exit 0 }
Write-Output "FOUT / ПОМИЛКА: $fout probleem/проблем, $goed in orde / у порядку"; exit 1
