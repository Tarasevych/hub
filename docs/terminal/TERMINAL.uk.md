> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./TERMINAL.md)) · [🇳🇱 **Nederlandse versie**](./TERMINAL.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Термінал технічного профілю (зона G, 22.10.2026)

## Що це
«Термінал» у технічній смузі (⋯ → Термінал) має два режими в одному вікні:

1. **Командний термінал** (типово) — відкривається **одразу** на пристрої технічного простору (ваш сервер як користувач
   `beheer`, або Windows-ПК з PowerShell), уже авторизований: рядок стану «під'єднано як beheer@\<хост\>, тека …, дозволено: …,
   ● запис виводу, підтвердження: команди, що змінюють». Один рядок = **одна програма** з дозволеного списку пристрою, без оболонки
   (`| ; && > < $( \`` не працюють — сайт чесно відмовляє; у лапках символи йдуть буквально як аргумент). `cd <тека>` змінює робочу
   теку (лише всередині дозволених тек). Tab — автодоповнення (програми та їхні «читальні» підкоманди), ↑/↓ — історія,
   Ctrl+L — очистити, кнопка «Копіювати» біля кожного виводу, «Історія» — усі ваші команди з виводом (Аудитор/Власник — усіх).
2. **Контейнер** — як раніше: інтерактивна оболонка в одноразовому контейнері на пристрої з podman (без мережі, лише /werk).

Якщо жодного пристрою немає — замість сухого повідомлення **майстер «Під'єднати сервер як пристрій»** з точною командою
`sudo mijn-ruimte-installeer terminal-inrichten` і кнопкою «Перевірити стан».

## Читання / зміна й підтвердження
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

## Межа безпеки
Агент працює **без sudo** (`NoNewPrivileges`), від користувача `beheer`; ProtectSystem=strict. Отже термінал може рівно стільки, скільки
`beheer` — не більше. `sudo`, оболонки (`bash`, `sh`, `cmd`, `wsl`), `node -e`, `python -c` — ніколи, навіть у allow-списку.
Робоча тека — лише всередині тек агента (`/home/beheer` для запису; `/srv/mijn-ruimte`, `/var/log` — читання; у теці «лише читання»
дозволені лише читальні команди). Секретні місця (`.ssh`, `.env`, `*.pem`, `.hub-agent`, `geheim/`) недоступні. Читати файли випусків
(`/srv/mijn-ruimte/releases`, 0750 root:mijnruimte) `beheer` не може — це свідомо: випуски й секрети належать root/службі.
Що треба від root (перезапуск служби, `mijn-ruimte-installeer installeren`) — лишається на консолі SSH або в наявних захищених каналах
(passkey-схвалення оновлень, рішення власника). Термінал — для діагностики й керування в межах `beheer`.

## Сервер як пристрій: `sudo mijn-ruimte-installeer terminal-inrichten`
Один крок на консолі (SSH як beheer). Інсталятор (root):
1. як **дієвий користувач служби** (`systemd-run -p User=mijnruimte`, секрети служби) запускає `dist-server/apparaat-koppelcode.mjs`:
   та сама одноразова кодова зв’язка, що й на mcp.* → Пристрої (5 хв, у базі лише хеш, простір «технічний», для облікового запису
   OWNER_EMAIL — він має бути хоч раз увійти на сайт);
2. передає код **через stdin** (`agent.mjs pair --code -`; ніколи як аргумент, ніколи в журнал) агенту від імені `beheer`
   з теками `/home/beheer` (запис), `/srv/mijn-ruimte`, `/var/log` (читання) і списком `STANDAARD_ALLOW_SERVER`;
3. `terminal-config on --opdrachten --geen-container`;
4. пише `mijn-ruimte-apparaat.service` із шаблону `deploy/mijn-ruimte-apparaat.service` (Користувач=beheer, NoNewPrivileges, ProtectSystem=strict,
   ReadWritePaths лише ~/.hub-agent і теки для запису) і запускає; стару unit `mijn-ruimte-agent-beheer.service` (beheer-koppelen) вимикає.
Той самий крок виконується **автоматично й тихо** наприкінці `mijn-ruimte-installeer installeren` — лише якщо ще не налаштовано й користувач
`beheer` існує; помилка там ніколи не зупиняє встановлення (попередження з підказкою).
Опції: `--gebruiker <ім’я>`, `--naam`, `--allow a,b,c`, `--root DIR`, `--readonly-root DIR`, `--server https://mcp.<домен>`, `--opnieuw`,
`--status`, `--uit`.

**Чому не повністю без консолі:** зв’язка прив’язує пристрій до облікового запису власника й дає сайту команди на власному хості; таке
рішення має ухвалювати той, хто має root на машині (та сама межа, що й у passkey-схвалення оновлень, яке перевіряє root). Один крок —
і далі все на сайті.

## Windows-ПК (PowerShell)
Повна інструкція: `deploy/agent/WINDOWS-POWERSHELL.md` (Node на Windows, `pair` з кодом із mcp.* → Пристрої у технічному просторі,
`terminal-config on --powershell --geen-container`, запуск через Планувальник завдань — `sc.exe` не підходить, бо Node/PowerShell не є службою Windows). У терміналі — вибір пристрою «сервер / ПК»,
рядок стану «PowerShell на \<ПК\>», підказка `PS C:\…>`. Через конектор ШІ (`uitvoeren_opdracht`, `command: "powershell"`) — той самий
фіксований запуск `-NoProfile -NonInteractive -Command`, те саме підтвердження на сайті — **завжди**, навіть якщо для пристрою ввімкнено
дозвіл «завжди» чи матрицю «без підтвердження» (`backend/connectors-opdrachten.ts` → `isPowershellOpdracht`).

## Технічно
- Маршрути: `POST /api/terminal/apparaten` (режими, allow, gebruiker@host, bevestiging), `/opdracht` (повертає `{bevestiging:true}` або
  рядок результату; після 20 с — `{klaar:false,id}` + `/opdracht-stand`), `/opdrachten` (історія), `/instelling` (посилене підтвердження).
- Сервер → агент: підписана HMAC команда `term.exec` (`connectors-gateway.stuurTerminalOpdracht`), не через чергу ШІ (`app.agent_commands`).
- Агент: `handlers['term.exec']` (0.8.0), `LEZEND` — дзеркало таблиці сайту (тест тримає рівними).
- Міграція `0113_terminal_opdrachten.sql` (RLS: лише власні рядки; запис — лише системна роль).
- Тести: `tests/eenheid/terminal-opdrachten-20261022.test.ts`, `tests/eenheid/apparaat-inrichten-20261022.test.ts`; стенд `terminal-*`.
