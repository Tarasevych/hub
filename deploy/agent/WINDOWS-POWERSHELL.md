# PowerShell на Windows-ПК через «Термінал» сайту / PowerShell op een Windows-pc via de «Terminal» van de site

Агент 0.8.0 (`deploy/agent/agent.mjs`) працює й на Windows під Node.js. У режимі `--powershell` кожен рядок, набраний у «Терміналі»
технічного профілю, виконується на ПК як **одна** фіксована програма: `powershell.exe -NoProfile -NonInteractive -Command <текст>`
(без `cmd.exe`, без `shell:true`; увесь рядок — один аргумент). Усередині PowerShell текст довільний, тому сайт **підтверджує кожну
команду** перед виконанням; вивід записується (`app.terminal_opdrachten`). Той самий шлях для ШІ через конектор
(`uitvoeren_opdracht` → `machine_exec` з `command: "powershell"`): та сама вбудована команда, те саме підтвердження на сайті —
завжди, навіть якщо для цього пристрою ввімкнено дозвіл ШІ «завжди» (сервер не пропускає PowerShell без кліку).

## Українська

### 1. Node.js на Windows
1. Завантажте Node.js **22 LTS або новіший** з nodejs.org (інсталятор .msi, стандартні налаштування).
2. Перевірте в PowerShell: `node -v` → `v22.x` (або новіше).

### 2. Агент
1. На сайті: **mcp.\<ваш домен\> → Агенти → Пристрої → «Підключити пристрій»**. Увімкніть технічний профіль і оберіть простір
   **«Технічний»** — тоді ПК з’являється в «Терміналі» технічної смуги (разом із сервером). Сайт показує одноразовий код (5 хв).
2. Створіть теку, наприклад `C:\mijn-ruimte-agent`, покладіть туди `agent.mjs` (з розгорнутого випуску: `deploy/agent/agent.mjs`;
   сайт пропонує завантажити його на тій самій сторінці).
3. У PowerShell (у цій теці) — підключення (`pair`; на сайті це зветься «koppelen»):
   ```powershell
   node agent.mjs pair --server https://mcp.<ваш-домен> --code <КОД> --name "Мій ПК" --root "C:\Users\<ви>\Projecten" --allow git
   node agent.mjs terminal-config on --powershell --geen-container
   node agent.mjs run
   ```
   - `--root` (можна кілька) — єдині теки, де працюватимуть команди (робоча тека PowerShell і файлові операції агента);
     `--readonly-root` — лише читання. Диск цілком: `--root "C:\"` (не радимо).
   - `--allow git` — звичайні програми (без оболонки) поряд із PowerShell; можна пропустити, тоді кожен рядок — PowerShell.
     `.cmd`-скрипти (npm, npx) без оболонки не запускаються — пишіть їх як PowerShell-рядок: `npm ls`.
   - `--geen-container` — на Windows контейнерний режим (podman) не потрібен.
4. На сайті: технічний профіль → ⋯ → **Термінал** → у списку пристроїв «PowerShell на Мій ПК». Рядок стану: «підключено як
   \<користувач\>@\<ПК\>, тека C:\…, підтвердження: кожна команда (PowerShell: завжди)».

### 3. Запуск як служба Windows (без сторонніх програм і npm-пакетів)
**Чому не `sc.exe`:** `sc.exe create` реєструє лише справжню службу Windows — програму, що відповідає диспетчеру служб (SCM).
`node.exe` і `powershell.exe` такими не є: служба «не відповідає» і Windows зупиняє її приблизно за 30 с (помилка 1053). Без сторонніх
обгорток (NSSM, WinSW) правильний шлях — **Планувальник завдань**: він запускає агент під час старту Windows, перезапускає після збою
і працює від **вашого** користувача (не від SYSTEM/адміністратора).

Варіант А — **під час старту Windows, без входу, без вікна** (рекомендовано). PowerShell «від імені адміністратора» потрібен лише, щоб
зареєструвати завдання; саме завдання працює від вашого користувача з обмеженими правами (S4U: пароль не зберігається, вікна немає):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument '"C:\mijn-ruimte-agent\agent.mjs" run' -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtStartup
$wie  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Principal $wie -Settings $set
Start-ScheduledTask -TaskName 'MijnRuimteAgent'
```
S4U не має мережевих облікових даних Windows (спільні теки), але вихідне HTTPS-з’єднання з сайтом працює — агенту більше нічого не треба.

Варіант Б — **лише поки ви ввійшли**, з прихованим вікном (`-WindowStyle Hidden`; консоль може на мить блимнути під час входу):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$node' 'C:\mijn-ruimte-agent\agent.mjs' run`"" -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Settings $set -RunLevel Limited
```
Перевірити: `Get-ScheduledTask MijnRuimteAgent | Get-ScheduledTaskInfo` (LastTaskResult 267009 = працює) і на сайті — «на зв’язку».
Зупинити/видалити: `Stop-ScheduledTask -TaskName MijnRuimteAgent`, `Unregister-ScheduledTask -TaskName MijnRuimteAgent -Confirm:$false`.
Ніколи не ставте `-RunLevel Highest` і не запускайте агент від SYSTEM: тоді кожна PowerShell-команда матиме права адміністратора.

### 4. Що дозволено й що ні
- Дозволено: лише програми з `--allow` (без оболонки, аргументи літерально) і PowerShell як одна фіксована програма.
- `cmd`, `bash`, `wsl`, `runas`, `sudo` та інтерпретатори з кодом у рядку (`node -e`, `python -c`) — ніколи, навіть у `--allow`.
- Робоча тека завжди всередині `--root`; теки з секретами (`.ssh`, `.env`, `*.pem`, `.hub-agent`, …) недоступні агенту.
- PowerShell сам по собі не обмежений: `Remove-Item -Recurse` зробить те, що зробив би ви. Тому кожна команда — підтвердження на
  сайті, запис виводу, журнал (`owner.terminal.opdracht`). Агент працює з правами вашого користувача Windows (не адміністратора,
  якщо ви не запустили його «від імені адміністратора» — не робіть цього).
- Токен агента: `%USERPROFILE%\.hub-agent\config.json`; відкликати — на сайті (Пристрої → Відключити) або `pair` заново.

## Nederlands

### 1. Node.js op Windows
Installeer Node.js **22 LTS of nieuwer** (nodejs.org, .msi); controleer met `node -v`.

### 2. Agent
1. Site: **mcp.\<uw domein\> → Agenten → Apparaten → «Apparaat koppelen»**, technisch profiel aan, ruimte **«Technisch»** (dan staat de pc
   in de «Terminal» van de technische band, naast de server). De site toont een eenmalige code (5 min).
2. Map `C:\mijn-ruimte-agent` met `agent.mjs` (uit de release: `deploy/agent/agent.mjs`).
3. In PowerShell in die map:
   ```powershell
   node agent.mjs pair --server https://mcp.<uw-domein> --code <CODE> --name "Mijn pc" --root "C:\Users\<u>\Projecten" --allow git
   node agent.mjs terminal-config on --powershell --geen-container
   node agent.mjs run
   ```
   `--root` = de enige mappen voor opdrachten; `--readonly-root` = alleen lezen; `--allow` = gewone programma’s naast PowerShell
   (mag leeg: dan is elke regel PowerShell); `.cmd`-scripts (npm) als PowerShell-regel: `npm ls`.
4. Site: technisch profiel → ⋯ → **Terminal** → apparaat «PowerShell op Mijn pc»; statusregel «verbonden als \<gebruiker\>@\<pc\>, map …,
   bevestiging: elke opdracht (PowerShell: altijd)».

### 3. Als Windows-dienst (zonder programma’s of npm-pakketten van derden)
**Waarom niet `sc.exe`:** `sc.exe create` registreert alleen een echte Windows-dienst, een programma dat de dienstenbeheerder (SCM)
antwoordt. `node.exe` en `powershell.exe` doen dat niet: Windows stopt zo’n «dienst» na ongeveer 30 s (fout 1053). Zonder wrappers van
derden (NSSM, WinSW) is de **Taakplanner** de juiste weg: start bij het opstarten van Windows, herstart na een fout en draait als **uw**
gebruiker (niet als SYSTEM of beheerder).

Variant A — **bij het opstarten, zonder aanmelden, zonder venster** (aanbevolen). PowerShell «als administrator» is alleen nodig om de taak
te registreren; de taak zelf draait als uw gebruiker met beperkte rechten (S4U: geen opgeslagen wachtwoord, geen venster):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument '"C:\mijn-ruimte-agent\agent.mjs" run' -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtStartup
$wie  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Principal $wie -Settings $set
Start-ScheduledTask -TaskName 'MijnRuimteAgent'
```
S4U heeft geen Windows-netwerkreferenties (gedeelde mappen), maar de uitgaande HTTPS-verbinding met de site werkt — meer heeft de agent niet nodig.

Variant B — **alleen zolang u aangemeld bent**, met verborgen venster (`-WindowStyle Hidden`; de console kan bij het aanmelden even knipperen):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$node' 'C:\mijn-ruimte-agent\agent.mjs' run`"" -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Settings $set -RunLevel Limited
```
Controleren: `Get-ScheduledTask MijnRuimteAgent | Get-ScheduledTaskInfo` (LastTaskResult 267009 = draait) en op de site «verbonden».
Stoppen/weghalen: `Stop-ScheduledTask -TaskName MijnRuimteAgent`, `Unregister-ScheduledTask -TaskName MijnRuimteAgent -Confirm:$false`.
Nooit `-RunLevel Highest` en nooit als SYSTEM: dan heeft elke PowerShell-opdracht beheerdersrechten.

### 4. Wat mag en wat niet
- Alleen programma’s uit `--allow` (geen shell, argumenten letterlijk) en PowerShell als één vast programma
  (`powershell.exe -NoProfile -NonInteractive -Command <tekst>`, `shell:false`, nooit `cmd.exe`).
- `cmd`, `bash`, `wsl`, `runas`, `sudo`, `node -e`, `python -c`: nooit, ook niet via `--allow`.
- Werkmap altijd binnen `--root`; geheime plekken (`.ssh`, `.env`, `*.pem`, `.hub-agent`, …) nooit.
- PowerShell zelf is ongeremd: daarom elke opdracht bevestigen op de site, uitvoer opgenomen, journaal (`owner.terminal.opdracht`).
  Ook een AI (`uitvoeren_opdracht` met `command: "powershell"`) wacht altijd op uw klik, zelfs met een «altijd»-toestemming.
  De agent draait met de rechten van uw Windows-gebruiker — start hem niet «als administrator».
- Agenttoken: `%USERPROFILE%\.hub-agent\config.json`; intrekken op de site (Apparaten → Loskoppelen) of opnieuw `pair`.
