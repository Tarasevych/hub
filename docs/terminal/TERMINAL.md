# Термінал технічного профілю / Terminal van het technisch profiel (зона G, 22.10.2026)

## Українська

### Що це
«Термінал» у технічній смузі (⋯ → Термінал) має два режими в одному вікні:

1. **Командний термінал** (типово) — відкривається **одразу** на пристрої технічного простору (ваш сервер як користувач
   `beheer`, або Windows-ПК з PowerShell), уже авторизований: рядок стану «під'єднано як beheer@\<хост\>, тека …, дозволено: …,
   ● запис виводу, підтвердження: команди, що змінюють». Один рядок = **одна програма** з дозволеного списку пристрою, без оболонки
   (`| ; && > < $( \`` не працюють — сайт чесно відмовляє; у лапках символи йдуть буквально як аргумент). `cd <тека>` змінює робочу
   теку (лише всередині дозволених тек). Tab — автодоповнення (програми та їхні «читаючі» підкоманди), ↑/↓ — історія,
   Ctrl+L — очистити, кнопка «Копіювати» біля кожного виводу, «Історія» — усі ваші команди з виводом (Аудитор/Власник — усіх).
2. **Контейнер** — як раніше: інтерактивна оболонка в одноразовому контейнері на пристрої з podman (без мережі, лише /werk).

Якщо жодного пристрою немає — замість сухого повідомлення **майстер «Під'єднати сервер як пристрій»** з точною командою
`sudo mijn-ruimte-installeer terminal-inrichten` і кнопкою «Перевірити стан».

### Читання / зміна й підтвердження
Кожна команда класифікується (`shared/terminal-opdrachten.ts`, таблиця `LEZEND`):
- **читання** (одразу): `ls cat tail head df free uptime whoami id stat wc du ps uname pwd grep nproc lscpu lsblk diff cut`,
  `hostname` (без імені), `date` (без `-s`), `find` (без `-exec/-execdir/-ok/-delete/-fprint…`), `sort` (без `-o/--output/--compress-program`),
  `ss` (без `-K`), `ip a|route|link show…` (без `set/add/del/flush/exec…`), `dmesg` (без `-C/-c/-D/-E/-n`), `tree` (без `-o`), `file` (без `-C`),
  `git status|log|diff|show|branch|remote -v|ls-files|reflog|…` (без `--output=`), `systemctl status|is-active|list-units|list-timers|show|cat`,
  `journalctl …` (без --vacuum/--rotate/--flush/--setup-keys), `npm ls|view|outdated|version` (без аргументу), `node -v`,
  `podman ps|images|logs|inspect|stats`, `tar -t…` (без `-I/--checkpoint-action/--to-command`), `mijn-ruimte-installeer lijst|apps-status`,
  `apt list|search|show`;
- **зміна** (спершу підтвердження у вікні): усе інше — `git pull/push/checkout`, `systemctl restart/start/stop/enable`,
  `npm install/run/version patch`, `node script.js`, `podman rm`, `tar -x`, `sed` (завжди: команди `e`/`w` у GNU sed виконують/пишуть),
  `uniq вхід вихід`, невідома програма чи підкоманда (краще зайвий натискання). Правило: усе, що через прапорець запускає код чи пише файл,
  ніколи не «читання» — бо читання йде без натискання.
- **PowerShell** — завжди підтвердження (текст усередині довільний).
У «Налаштуваннях» пристрою (у вікні термінала, зі step-up) можна обрати «кожна команда». Усі команди — у журналі
(`owner.terminal.opdracht`), вивід збережено в `app.terminal_opdrachten` (до 256 КБ на команду).

### Межа безпеки
Агент працює **без sudo** (`NoNewPrivileges`), від користувача `beheer`; ProtectSystem=strict. Отже термінал може рівно стільки, скільки
`beheer` — не більше. `sudo`, оболонки (`bash`, `sh`, `cmd`, `wsl`), `node -e`, `python -c` — ніколи, навіть у allow-списку.
Робоча тека — лише всередині тек агента (`/home/beheer` для запису; `/srv/mijn-ruimte`, `/var/log` — читання; у теці «лише читання»
дозволені лише читаючі команди). Секретні місця (`.ssh`, `.env`, `*.pem`, `.hub-agent`, `geheim/`) недоступні. Читати файли випусків
(`/srv/mijn-ruimte/releases`, 0750 root:mijnruimte) `beheer` не може — це свідомо: випуски й секрети належать root/службі.
Що треба від root (перезапуск служби, `mijn-ruimte-installeer installeren`) — лишається на консолі SSH або в наявних захищених каналах
(passkey-схвалення оновлень, рішення власника). Термінал — для діагностики й керування в межах `beheer`.

### Сервер як пристрій: `sudo mijn-ruimte-installeer terminal-inrichten`
Один крок на консолі (SSH як beheer). Інсталятор (root):
1. як **дієвий користувач служби** (`systemd-run -p User=mijnruimte`, секрети служби) запускає `dist-server/apparaat-koppelcode.mjs`:
   та сама одноразова кодова зв’язка, що й на mcp.* → Пристрої (5 хв, у базі лише хеш, простір «технічний», для облікового запису
   OWNER_EMAIL — він має бути хоч раз увійти на сайт);
2. передає код **через stdin** (`agent.mjs pair --code -`; ніколи як аргумент, ніколи в журнал) агенту від імені `beheer`
   з теками `/home/beheer` (запис), `/srv/mijn-ruimte`, `/var/log` (читання) і списком `STANDAARD_ALLOW_SERVER`;
3. `terminal-config on --opdrachten --geen-container`;
4. пише `mijn-ruimte-apparaat.service` із шаблону `deploy/mijn-ruimte-apparaat.service` (User=beheer, NoNewPrivileges, ProtectSystem=strict,
   ReadWritePaths лише ~/.hub-agent і теки для запису) і запускає; стару unit `mijn-ruimte-agent-beheer.service` (beheer-koppelen) вимикає.
Той самий крок виконується **автоматично й тихо** наприкінці `mijn-ruimte-installeer installeren` — лише якщо ще не налаштовано й користувач
`beheer` існує; помилка там ніколи не зупиняє встановлення (попередження з підказкою).
Опції: `--gebruiker <ім’я>`, `--naam`, `--allow a,b,c`, `--root DIR`, `--readonly-root DIR`, `--server https://mcp.<домен>`, `--opnieuw`,
`--status`, `--uit`.

**Чому не повністю без консолі:** зв’язка прив’язує пристрій до облікового запису власника й дає сайту команди на власному хості; таке
рішення має ухвалювати той, хто має root на машині (та сама межа, що й у passkey-схвалення оновлень, яке перевіряє root). Один крок —
і далі все на сайті.

### Windows-ПК (PowerShell)
Повна інструкція: `deploy/agent/WINDOWS-POWERSHELL.md` (Node на Windows, `pair` з кодом із mcp.* → Пристрої у технічному просторі,
`terminal-config on --powershell --geen-container`, запуск через Планувальник завдань — `sc.exe` не підходить, бо Node/PowerShell не є службою Windows). У терміналі — вибір пристрою «сервер / ПК»,
рядок стану «PowerShell на \<ПК\>», підказка `PS C:\…>`. Через конектор ШІ (`uitvoeren_opdracht`, `command: "powershell"`) — той самий
фіксований запуск `-NoProfile -NonInteractive -Command`, те саме підтвердження на сайті — **завжди**, навіть якщо для пристрою ввімкнено
дозвіл «завжди» чи матрицю «без підтвердження» (`backend/connectors-opdrachten.ts` → `isPowershellOpdracht`).

### Технічно
- Маршрути: `POST /api/terminal/apparaten` (режими, allow, gebruiker@host, bevestiging), `/opdracht` (повертає `{bevestiging:true}` або
  рядок результату; після 20 с — `{klaar:false,id}` + `/opdracht-stand`), `/opdrachten` (історія), `/instelling` (step-up).
- Сервер → агент: підписана HMAC команда `term.exec` (`connectors-gateway.stuurTerminalOpdracht`), не через чергу ШІ (`app.agent_commands`).
- Агент: `handlers['term.exec']` (0.8.0), `LEZEND` — дзеркало таблиці сайту (тест тримає рівними).
- Міграція `0113_terminal_opdrachten.sql` (RLS: лише власні рядки; запис — лише системна роль).
- Тести: `tests/eenheid/terminal-opdrachten-20261022.test.ts`, `tests/eenheid/apparaat-inrichten-20261022.test.ts`; стенд `terminal-*`.

## Nederlands

### Wat het is
De «Terminal» in de technische band heeft twee modi in één venster:
1. **Opdracht-terminal** (standaard) — opent **meteen** op het apparaat van de technische ruimte (uw server als `beheer`, of een
   Windows-pc met PowerShell), al aangemeld: statusregel «verbonden als beheer@\<host\>, map …, toegestaan: …, ● opname, bevestiging:
   wijzigende opdrachten». Eén regel = **één programma** uit de toegestane lijst, zonder shell (`| ; && > <` werken niet; tussen
   aanhalingstekens gaan tekens letterlijk mee). `cd <map>` binnen de roots. Tab vult aan, ↑/↓ geschiedenis, Ctrl+L wist, «Kopiëren» per
   uitvoer, «Geschiedenis» met uitvoer (Auditor/Eigenaar: van iedereen).
2. **Container** — zoals voorheen: interactieve shell in een wegwerpcontainer op een apparaat met podman.
Zonder apparaat: de wizard «Server als apparaat koppelen» met `sudo mijn-ruimte-installeer terminal-inrichten` en «Stand controleren».

### Lezen / wijzigen en bevestiging
Classificatie in `shared/terminal-opdrachten.ts` (`LEZEND`): lezende opdrachten (ls, cat, df, git status/log/diff, systemctl status,
journalctl, npm ls, podman ps, tar -t, find zonder -exec/-delete, sort zonder -o, ss zonder -K, ip zonder set/add/del, date zonder -s,
hostname zonder naam, mijn-ruimte-installeer lijst, …) lopen meteen; al het andere (git pull, systemctl restart, npm install, node script.js,
sed, uniq met uitvoerbestand, tar -I/--checkpoint-action, onbekend programma of werkwoord) vraagt eerst bevestiging in het venster;
PowerShell altijd. Regel: wat via een vlag code start of een bestand schrijft, is nooit «lezend» (lezen loopt zonder klik).
Per apparaat instelbaar («elke opdracht», met stap-op). Alles in het journaal (`owner.terminal.opdracht`) en in `app.terminal_opdrachten`.

### Veiligheidsgrens
De agent draait **zonder sudo** (`NoNewPrivileges`) als `beheer`, ProtectSystem=strict: de terminal kan precies wat `beheer` kan. Shells
(`bash`, `sh`, `cmd`, `wsl`), `sudo`, `node -e`, `python -c`: nooit. Werkmap alleen binnen de roots (`/home/beheer` schrijven;
`/srv/mijn-ruimte`, `/var/log` lezen; in een alleen-lezen root alleen lezende opdrachten). Geheime plekken nooit. Wat root vereist
(dienst herstarten, `installeren`) blijft op de SSH-console of in de bestaande beveiligde kanalen (passkey-goedkeuring, eigenaarsbesluit).

### De server als apparaat: `sudo mijn-ruimte-installeer terminal-inrichten`
Eén stap op de console. De installer (root) vraagt als dienstgebruiker een koppelcode voor de eigenaar (`dist-server/apparaat-koppelcode.mjs`,
ruimte technisch, 5 min, alleen de hash in de database; de eigenaar moet één keer aangemeld zijn geweest), geeft hem via stdin aan
`agent.mjs pair --code -` als `beheer` (roots `/home/beheer` rw; `/srv/mijn-ruimte`, `/var/log` ro; allow `STANDAARD_ALLOW_SERVER`),
zet `terminal-config on --opdrachten --geen-container` en schrijft/start `mijn-ruimte-apparaat.service` uit het sjabloon
`deploy/mijn-ruimte-apparaat.service` (User=beheer, NoNewPrivileges, ProtectSystem=strict). Dezelfde stap loopt stil mee aan het einde
van `installeren` (alleen de eerste keer; nooit fataal). Opties: `--gebruiker`, `--naam`, `--allow`, `--root`, `--readonly-root`,
`--server`, `--opnieuw`, `--status`, `--uit`.
**Waarom niet volledig zonder console:** de koppeling bindt het apparaat aan het account van de eigenaar en geeft de site opdrachten op
haar eigen host; dat besluit hoort bij wie root heeft op de machine — dezelfde grens als bij de passkey-goedkeuring van updates.

### Windows-pc (PowerShell)
Zie `deploy/agent/WINDOWS-POWERSHELL.md`. In de terminal: apparaatkeuze server/pc, statusregel «PowerShell op \<pc\>», prompt `PS C:\…>`.
Via de AI-connector (`uitvoeren_opdracht`, `command: "powershell"`): dezelfde vaste start `-NoProfile -NonInteractive -Command` en
dezelfde bevestiging op de site — **altijd**, ook met een «altijd»-toestemming of de matrix «zonder bevestiging»
(`backend/connectors-opdrachten.ts` → `isPowershellOpdracht`).

### Technisch
Routes `POST /api/terminal/apparaten | opdracht | opdracht-stand | opdrachten | instelling`; server → agent: ondertekend `term.exec`
(`stuurTerminalOpdracht`), niet via de AI-wachtrij; agent `handlers['term.exec']` (0.8.0) met `LEZEND` als spiegel; migratie
`0113_terminal_opdrachten.sql` (RLS); tests `terminal-opdrachten-20261022`, `apparaat-inrichten-20261022`.
