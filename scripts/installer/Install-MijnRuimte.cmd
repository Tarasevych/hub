@echo off
rem Mijn Ruimte: helper voor de browserextensie (Windows). Doet GEEN beheerdersrechten nodig, schrijft alleen naar
rem de map die u zelf kiest in het venster (nooit automatisch een systeemmap), controleert het pakket met een SHA-256-controlesom en opent daarna de extensiepagina van de browser.
rem Alles wat dit bestand doet staat leesbaar hieronder (na de markeringsregel). Versie @@VERSION@@.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Get-Content -Raw -Encoding UTF8 '%~f0'; $i=$f.LastIndexOf([Environment]::NewLine+'#'+'PS#'); Invoke-Expression $f.Substring($i+[Environment]::NewLine.Length+4)"
echo.
pause
exit /b
#PS#
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$site = 'https://mcp.tarasevych.com'
$expected = '@@SHA256@@'
# Ви самі обираєте диск і папку: нічого не створюється без вашого вибору.
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = 'Оберіть диск і папку, де зберегти розширення (усередині буде створено підпапку MijnRuimte-extension). Цю папку не видаляйте.'
$dlg.ShowNewFolderButton = $true
if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK -or -not $dlg.SelectedPath) { Write-Host 'Папку не обрано: встановлення скасовано, нічого не створено.'; return }
$dir = Join-Path $dlg.SelectedPath 'MijnRuimte-extension'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$zip = Join-Path $dir 'mijn-ruimte-extension.zip'

Write-Host ''
Write-Host 'Mijn Ruimte: встановлення розширення браузера' -ForegroundColor Cyan
Write-Host '1/4 Завантажуємо розширення з ' $site
Invoke-WebRequest -UseBasicParsing -Uri "$site/downloads/mijn-ruimte-extension.zip" -OutFile $zip

Write-Host '2/4 Перевіряємо контрольну суму (SHA-256)'
$hash = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
if ($hash -ne $expected) {
  Remove-Item $zip -Force
  throw "Контрольна сума не збігається (очікувалась $expected, отримано $hash). Встановлення скасовано: файл міг бути змінений."
}

Write-Host '3/4 Розпаковуємо в' $dir
Expand-Archive -Path $zip -DestinationPath $dir -Force
Remove-Item $zip -Force
Set-Clipboard -Value $dir

Write-Host '4/4 Відкриваємо сторінку розширень браузера'
$chrome = $null
foreach ($p in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")) { if (Test-Path $p) { $chrome = $p; break } }
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if ($chrome) { Start-Process $chrome 'chrome://extensions' } elseif (Test-Path $edge) { Start-Process $edge 'edge://extensions' } else { Write-Host 'Браузер не знайдено: відкрийте chrome://extensions вручну.' -ForegroundColor Yellow }

Write-Host ''
Write-Host 'Залишилось 3 кліки (Chrome не дозволяє встановлювати розширення без вашої участі):' -ForegroundColor Green
Write-Host '  1. Увімкніть «Режим розробника» (перемикач праворуч угорі).'
Write-Host '  2. Натисніть «Завантажити розпаковане» і вставте шлях (Ctrl+V) у поле вибору папки:'
Write-Host "     $dir" -ForegroundColor Yellow
Write-Host '  3. Натисніть «Вибір папки». Розширення саме відкриє сторінку активації на сайті.'
Write-Host '(Шлях уже скопійовано в буфер обміну.)'
