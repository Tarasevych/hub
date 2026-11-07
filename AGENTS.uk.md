> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([🔒 канонічний `AGENTS.md`](./AGENTS.md)) · [🇳🇱 **Nederlandse versie**](./AGENTS.nl.md) · [🏠 Головна (UK)](./README.md) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [📚 Каталог статей](./docs/INDEX.md)

# AGENTS.uk.md — єдині правила для всіх ШІ-агентів Mijn Ruimte (Українська версія)

**Статус:** чиста українська версія канонічного джерела правил [`AGENTS.md`](./AGENTS.md) (`ORCH-001`). Версія правил: див. [`orchestratie/beleid.json`](./orchestratie/beleid.json) → `regelsVersie`; криптографічний відбиток — [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json).
`CLAUDE.md`, `GEMINI.md`, `.cursorrules` тощо — лише адаптери, що вказують на канонічний [`AGENTS.md`](./AGENTS.md). Якщо інший документ суперечить [`AGENTS.md`](./AGENTS.md) — чинним є [`AGENTS.md`](./AGENTS.md).

Зміна правил = запис у [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇺🇦 UK](./orchestratie/BESLUITEN.uk.md) · [🇳🇱 NL](./orchestratie/BESLUITEN.nl.md)) + вища `regelsVersie` + `node scripts/orch.mjs vergrendel`. Інакше `orch controleer` завершується помилкою.

---

## 0. Головний принцип

Одна пам'ять проєкту, одна система правил, одна інтеграційна черга, один узгоджений випуск — незалежно від кількості й типу агентів
(Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor та майбутні).

## 1. Платформа (незмінне)

- **Mijn Ruimte** — self-hosted BYOS-платформа (Ubuntu ВМ на обладнанні користувача). Жодних зовнішніх хмар для хостингу чи розгортання.
- Випуски атомарні: `mijn-ruimte-YYYYMMDD-HHMMSS.tar.gz`, SHA-256, встановлення лише через `/usr/local/sbin/mijn-ruimte-installeer`
  (`deploy/uitrol/mijn-ruimte-uitrol.sh`). Правила пакета: [`deploy/REGELS-UITROLPAKKET.uk.md`](./deploy/REGELS-UITROLPAKKET.uk.md) / [`deploy/REGELS-UITROLPAKKET.md`](./deploy/REGELS-UITROLPAKKET.md) (`UITROL-VERSIE`, `AUTEUR`, `AGENT`, `SAMENVATTING`, `BRON-COMMIT`, `UITROL-MANIFEST.json` з `20261101`).
- Жодного прямого root-втручання вручну: дії від робочого користувача (`beheer`), системні зміни через заздалегідь написані конфіги/units. Нічого не розпаковувати в `/root`.
- Простори користувачів ізольовані й шифровані їхнім методом входу; власник сервера не має технічної змоги їх розшифрувати.
- Мови: спілкування і звіти — українською; коментарі в коді — українською або нідерландською; тексти інтерфейсу (UI) — українською та нідерландською.
  Англійська використовується лише для неперекладних технічних термінів. Шляхи/адреси — нідерландською (`/verbindingen`, а не `/connections`).
- Стек ВМ `<VM-IP>` (`B-009`): `Ubuntu 26.04.1 LTS` (`kernel 7.0`, `glibc 2.43`, `systemd 259.9`), `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`,
  `Caddy 2.11.7` (`admin.sock|0660`), `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. У `deploy/*.service` — `RestrictSUIDSGID=no` (інакше seccomp блокує `openat2` у `tar 1.35`).

## 2. Перед початком роботи (обов'язково)

1. Прочитай [`AGENTS.md`](./AGENTS.md) (або `orchestratie/CONTEXT-COMPACT.md`, якщо немає доступу до репозиторію) і [`orchestratie/beleid.json`](./orchestratie/beleid.json).
2. База коду: `beleid.json → basis.bronCommit` (зараз `f3f3fabb…`, версія `20261105-061659`, статус `geverifieerd_productie` — звірено з сервером, див. `B-014`; гілки `integratie` та `voornaamst` синхронізовані). Якщо маєш доступ до сайту — звір `/api/version` і зафіксуй результат у `BESLUITEN.md`.
3. Зареєструй задачу: `node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha> --tak feature/orch-001-YYYYMMDD-HHMMSS`
   (без репозиторію — створи `ORCH-OVERDRACHT.json` вручну за зразком `orchestratie/sjablonen/ORCH-OVERDRACHT.json`).
4. Запусти `node scripts/orch.mjs controleer` і `node scripts/orch.mjs versheid --taak <ID> --fase start`. Якщо червоне — не починай, спершу перебазуйся або перечитай правила.

## 3. Під час роботи

- Власна гілка `feature|fix|audit|release/<тема>-YYYYMMDD-HHMMSS` від базового commit. Один Task ID (`ABC-001`) на задачу; він у назві гілки, коміті, PR та пакеті.
- Ніколи не пиши в чужі гілки, `voornaamst`, `integratie`, `release/*`. Ніколи не використовуй force-push, не переписуй історію, не видаляй резервні копії.
- Тихе перезаписування чужих змін заборонене: при конфлікті — виконай rebase на інтеграційну гілку, конфлікти розв'яжи явно та згадай у звіті.
- Виявив стару помилку — виправ (окремим комітом), не ігноруй. Нічого не прибирай «щоб запрацювало»: кнопку, вкладку, тест чи перевірку.
- Секрети, токени, приватні ключі, вміст листів — ніколи в чат, лог, коміт чи пакет. Приватні ключі власника агентам не передаються.
- Production, default branch, резервні копії, критичні дозволи — тільки після явного погодження власника (не іншого агента).
- Діагностика й час власника (`B-009`): не просити власника вручну виконувати команди в терміналі (`df -h`, `journalctl`) чи вручну збирати пакети; без доступу до `<VM-IP>` дати стислий висновок (1–2 речення) для інфраструктурного агента на ПК власника. Не вгадувати причину збою `voorcontrole` (не списувати на `.zip`, якщо крок `structuur` пройдено). Деталі нижче, `B-009`.

## 4. Перед передаванням результату

1. Усе закомічено. `node scripts/orch.mjs versheid --taak <ID> --fase overdracht` — зелене (база не застаріла з перетином файлів, правила чинні).
2. Тести: `node scripts/eenheidstests.mjs <фільтр>`, `npm run typecheck:server` (де можливо). Результати — у `TESTRESULTATEN` (формат v2) і звіті.
3. Передача будь-яким каналом із `beleid.json → inlevering.kanalen` (PR, MCP, HTTP API, локальний файл, ZIP, TAR.GZ, git patch, вебзавантаження),
   але завжди з `ORCH-OVERDRACHT.json`: `taakId`, `agent`, `basisCommit`, `regelsVersie`, `regelsHash`, `samenvatting`, список змінених файлів, тести.
   Приймає все один конвеєр: `node scripts/orch.mjs inleveren --bron <файл|тека|гілка>` — нова гілка від бази, зміни, конфлікти з `integratie`
   (`git merge-tree`), тести, запис у `orchestratie/inleveringen/`, черга. Передача, що змінює файли стану (`orchestratie/taken`, `inleveringen`,
   `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json`), відхиляється — їх пише лише `orch` або власник. Єдиний виняток — власний
   `orchestratie/taken/<ID>.json` (декларація агента з `taak-start`); при злитті лишається версія `integratie` (`.gitattributes` → `merge=orch-staat`).
4. Звіт українською: 1-м рядком — пряме посилання на `mijn-ruimte-<versie>.tar.gz` (окремо від `-overdracht.zip`); далі — що готово, що перевірено (фактично, не за метаданими), де результат, що наступне, що свідомо не зроблено.
5. Статус задачі: `in_progress` → `ter_integratie` (передано) → `integrated` (злито в `integratie`) → `released` (пакет зібрано) → `installed`
   (встановлено інсталятором на сервері). Статус змінює лише той крок, що його здійснив; агент не ставить `installed` сам.

## 5. Інтеграція та випуск

- Одна послідовна черга: `orchestratie/wachtrij.json` (FIFO за базою; `wachtrij volgende|klaar|terugtrekken`, лише одна задача `bezig`).
  Злиття в `integratie` — завжди `--no-ff`, без force; конфлікт → `klaar --uitkomst afgewezen`, задача повертається агентові на rebase.
- Пакет на застарілій базі (`basisCommit` не є предком `integratie`, перетин файлів) не випускається й не встановлюється.
- Режими встановлення (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/підпис власника; типовий),
  `automatisch_beperkt` — лише за окремо затвердженою й підписаною політикою. Зараз дозволені перші два.
- Критичні політики (`kritiek`) чинні лише з підтвердженням власника в `orchestratie/regels.lock.json → eigenaar`: підпис SSH (`orch bevestig`)
  або passkey на сайті (`eigenaar.soort = passkey`, запис у root-журналі); до того — «пропозиція».
- Зміна правил власником без SSH: сайт `mcp.tarasevych.com/agents` → «Координація» → редагування файлів правил → перевірка пропозиції (`regelsVersie`
  вища, запис у `BESLUITEN.md`, `beleid.json` валідний) → passkey (рішення `orch-regels`; root лише фіксує підтвердження у своєму журналі) →
  гілка `regels/<versie>-<час>` з новим lock і `CONTEXT-COMPACT.md` іде в `origin`. Злиття в `integratie` — лише власник. Сайт/MCP/HTTP викликають
  ті самі функції, що й CLI (`inleveren`, `beoordeelVoorstel`, `vergrendel`) — окремої логіки немає (`beleid.json → site`).
- **TRACE-001 (з `20261103-211555`):** обов'язковий `ONTWIKKELARCHIEF.json` і підтверджена точна GitHub Release-asset SHA-256. Журнал комічений, сервер і root відхиляють відсутнє, неправильне чи недоступне. Детальні умови нижче, `B-007`, `deploy/REGELS-UITROLPAKKET.md` §7.

### Повні умови випуску, журналу й перевірок (§5)

- **TRACE-001 (з випуску `20261103-211555`):** кожен пакет містить `ONTWIKKELARCHIEF.json` із посиланням на `orchestratie/ontwikkelarchieven/<TASK-ID>.json` у тому самому GitHub-коміті й посиланням на реліз `.tar.gz`. Журнал зберігає доступні тексти запитів, покрокові дії та спроби, коміти, результати тестів, вкладення з посиланнями й хешами, тимчасові артефакти (або факт їх відсутності), обґрунтування рішень, компроміси й невиконане; не містить приватних ключів, токенів, вмісту пошти чи прихованих внутрішніх міркувань моделі. Дані з обмеженим доступом — лише опис і хеш без вмісту. Після складання release-asset `mijn-ruimte-<versie>.tar.gz` публікують у GitHub Release з тегом версії. Серверна передперевірка (`voorcontrole`) і root-інсталятор окремо перевіряють незмінний коміт, його походження з вказаної гілки, SHA-256 журналу і точний SHA-256 архіву на GitHub; відсутність, помилка посилання, невідповідність чи недоступність GitHub **обов'язково блокують встановлення**. Жодних винятків «продовжити без перевірки» немає. Старіші пакети не змінюються. Потребує затвердження правил власником Passkey/SSH і злиття у захищену інтеграцію.
- Випуск збирає лише `node scripts/orch.mjs pakket --taak <ID> --auteur "…" [--manifest …] [--testresultaten …] [--sig …]`: сумісний
  `mijn-ruimte-<versie>.tar.gz` (через `deploy/uitrol/maak-voorstelpakket.sh`, з файлом `UITROL-BASIS` = встановлена версія + commit + відбиток
  правил) і пакет передачі `mijn-ruimte-<versie>-<agent>-overdracht.zip` (архів, `.sha256`, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`,
  `TESTRESULTATEN.json`, `RAPPORT.md`, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `.sig` — лише якщо власник підписав на своєму ПК).
  Перевірка без встановлення: `pakket-controleer --bron <zip>`; імпорт на іншому боці без git: `inleveren --bron <zip>` (той самий конвеєр).
- Інсталятор (root) відхиляє пакет: база старіша за встановлену (`BASIS_VEROUDERD`), інший встановлений commit (`BASIS_COMMIT_VERSCHILT`),
  без `UITROL-BASIS` із версії `20261201` (`GEEN_BASIS`), правила ≠ `regels.lock.json` (`REGELS_NIET_VERGRENDELD`), режим поза політикою
  (`MODUS_NIET_TOEGESTAAN`). GitOps (автоматично) працює лише за `automatisch_beperkt` **і** підписаним lock. Приватні ключі агентам не передаються.
- **B-009 (з 04.11.2026 · стек Ubuntu 26.04.1 LTS, `RestrictSUIDSGID=no` та правила комунікації з власником):**
  1. На ВМ `<VM-IP>` працюють `Ubuntu 26.04.1 LTS (Resolute)` (`kernel 7.0.0-42-generic`, `glibc 2.43`, `systemd 259.9`), `Node.js v26.13.0 LTS`, `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` із `--data-checksums`), `Caddy v2.11.7` (`admin unix//run/caddy/admin.sock|0660`), `OPA v1.22.0` (`127.0.0.1:8181`), `age v1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. На робочому ПК власника в `T:\mijn-ruimte\hulpmiddelen\` встановлено `Node.js v26.13.0`, `PostgreSQL 18.6-5`, `rclone v1.75.2`.
  2. У `Ubuntu 26.04.1 LTS` системний `GNU tar 1.35` під час `--extract` використовує системний виклик `openat2(..., RESOLVE_BENEATH)`. У `systemd 259` параметр `RestrictSUIDSGID=yes` у seccomp-фільтрі блокує `openat2` з `-ENOSYS` (`Function not implemented`), через що `voorcontrole` падав на розпакуванні `.tar.gz`. Тому в усіх `deploy/*.service` та серверних drop-in `/etc/systemd/system/<unit>.d/ubuntu2604-openat2.conf` має бути `RestrictSUIDSGID=no` (при збереженні `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`).
  3. Якщо агент працює у хмарному/веб-контейнері без прямого доступу до сервера `<VM-IP>`, йому **заборонено** перекладати діагностику на власника (просити виконувати `df -h`, `journalctl` тощо) або вгадувати причину навмання (наприклад, звинувачувати власника у завантаженні `.zip` замість `.tar.gz`, коли `voorcontrole` вже пройшов крок `structuur`). Замість цього агент надає коротку технічну нотатку (1–2 речення) для інфраструктурного агента на ПК власника (Antigravity/Claude), який має прямий SSH-доступ до `beheer@<VM-IP>`.

---

## 6. Де що лежить

| Що | Де |
|---|---|
| Правила (людині) | [`AGENTS.md`](./AGENTS.md) ([🇺🇦 UK](./AGENTS.uk.md) · [🇳🇱 NL](./AGENTS.nl.md)) |
| Політика (машині) | [`orchestratie/beleid.json`](./orchestratie/beleid.json) |
| Реєстр рішень | [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇺🇦 UK](./orchestratie/BESLUITEN.uk.md) · [🇳🇱 NL](./orchestratie/BESLUITEN.nl.md)) |
| Відбиток правил, підпис власника | [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json) |
| Публічні ключі власника | [`orchestratie/eigenaar-ondertekenaars`](./orchestratie/eigenaar-ondertekenaars) |
| Компактний контекст (без GitHub/MCP) | [`orchestratie/CONTEXT-COMPACT.md`](./orchestratie/CONTEXT-COMPACT.md) (генерується: `node scripts/orch.mjs context`) |
| Задачі агентів | `orchestratie/taken/<TASK-ID>.json` |
| Записи передач (усі канали, прийняті й відхилені) | `orchestratie/inleveringen/<TASK-ID>-<час>.json` |
| Черга інтеграції | [`orchestratie/wachtrij.json`](./orchestratie/wachtrij.json) |
| Факт встановлення (пише інсталятор/власник) | [`orchestratie/geinstalleerd.json`](./orchestratie/geinstalleerd.json) |
| Шаблони передачі | `orchestratie/sjablonen/` |
| Пакети випуску (локально, не в git) | `uitvoer/` — `mijn-ruimte-<versie>.tar.gz` + `mijn-ruimte-<versie>-<agent>-overdracht.zip` (`orch pakket`) |
| Стан координації при злитті | [`.gitattributes`](./.gitattributes) (`merge=orch-staat`: версія `integratie` перемагає) |
| Журнал розробки для випуску | `orchestratie/ontwikkelarchieven/<TASK-ID>.json` (у git), `ONTWIKKELARCHIEF.json` (у тар) |
| Правила пакета випуску | [`deploy/REGELS-UITROLPAKKET.md`](./deploy/REGELS-UITROLPAKKET.md), [`shared/uitrol-manifest.ts`](./shared/uitrol-manifest.ts), [`shared/uitrol-codes.ts`](./shared/uitrol-codes.ts) |
| Безпечне розгортання, passkey, повернення стану | [`deploy/RUNBOOK-VEILIGE-UITROL.md`](./deploy/RUNBOOK-VEILIGE-UITROL.md) (§13 passkey, §15 рішення власника, §18 координація на сервері) |
| Керування з сайту / HTTP / MCP (та сама логіка, що й CLI) | [`src/agenten/TabOrch.tsx`](./src/agenten/TabOrch.tsx), [`backend/orch-routes.ts`](./backend/orch-routes.ts) (`/api/owner/orch/*`), [`backend/orch-opslag.ts`](./backend/orch-opslag.ts), [`backend/orch-hulpmiddelen.ts`](./backend/orch-hulpmiddelen.ts) (`orch_*`), [`shared/orch-model.ts`](./shared/orch-model.ts) |
| Робоча копія координації на сервері, завантаження | `ORCH_WORTEL` (`/srv/mijn-ruimte/orch-repo`), `ORCH_INBOX` (`/srv/mijn-ruimte/orch-inbox`) |
| Підтвердження правил passkey (пише лише root) | `/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl`; копія для застосунку `/var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json` |
| Доступи агентів, MCP | [`deploy/RUNBOOK-AGENTEN-0.4.md`](./deploy/RUNBOOK-AGENTEN-0.4.md), [`deploy/MCP-CONNECTOR.md`](./deploy/MCP-CONNECTOR.md), [`deploy/CONNECTOR-V2.md`](./deploy/CONNECTOR-V2.md) |
| Afstemming (задачі/конфлікти/випуски на сайті) | [`shared/afstemming-model.ts`](./shared/afstemming-model.ts), `backend/afstemming-*.ts`, `src/afstemming-vnext/` |
| Спільна тека знань (поза репозиторієм) | проєктна тека `knowledge/claude/` — довідка, не джерело правил |

## 7. Команди

```bash
node scripts/orch.mjs controleer                     # beleid.json, lock, адаптери, задачі, черга — усе разом
node scripts/orch.mjs vergrendel                     # оновити regels.lock.json після зміни правил (+ вища regelsVersie)
node scripts/orch.mjs context                        # згенерувати orchestratie/CONTEXT-COMPACT.md
node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha40> --tak feature/orch-001-YYYYMMDD-HHMMSS
node scripts/orch.mjs versheid --taak ORCH-001 --fase start|overdracht
node scripts/orch.mjs taak-herlees --id ORCH-001     # «я перечитав правила» після їх зміни
node scripts/orch.mjs werkruimte --taak ORCH-001     # ізольоване робоче дерево (git worktree) для задачі
node scripts/orch.mjs inleveren --bron <zip|tar.gz|patch|тека|гілка> [--kanaal mcp|http_api|web_upload] [--overdracht od.json] [--taak ID] [--zonder-tests "причина"] [--push]
node scripts/orch.mjs wachtrij toon|volgende|klaar|terugtrekken   # послідовна черга інтеграції
node scripts/orch.mjs status                         # in_progress / integrated / released / installed по задачах
node scripts/orch.mjs staat-commit                   # закомітити лише файли стану координації
node scripts/orch.mjs pakket --taak ORCH-001 --auteur "Імʼя" [--manifest m.json] [--testresultaten t.json] [--sig p.sig] [--uit uitvoer]
                                                     # tar.gz (UITROL-BASIS) + <versie>-<agent>-overdracht.zip; задача → released
node scripts/orch.mjs pakket-controleer --bron uitvoer/mijn-ruimte-<versie>-<agent>-overdracht.zip   # перевірка без встановлення
node scripts/orch.mjs onderteken-bericht             # рядок, який власник підписує (ssh-keygen -Y sign -n mijn-ruimte-regels)
node scripts/orch.mjs bevestig <bericht.sig>         # записати підпис власника в lock (альтернатива — passkey на сайті, §5)
node scripts/eenheidstests.mjs orch                  # тести координації (kern, cli, inleveren, pakket, uitrol-basis, site, besluit-root)
# Те саме з сайту/MCP (backend/orch-hulpmiddelen.ts): orch_overzicht, orch_context, orch_taak_start, orch_inleveren_begin|stuk|klaar
```

## 8. Що свідомо не є правилом

Старі runbooks і документи змін лишаються довідкою про те, як працює код. Вони не додають правил понад [`AGENTS.md`](./AGENTS.md) і не скасовують його.
Якщо в них знайдено суперечність — виправити документ або додати рішення в [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md), а не мовчки обрати одне з двох.
