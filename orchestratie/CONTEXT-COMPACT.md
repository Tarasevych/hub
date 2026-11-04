<!-- GEGENEREERD door node scripts/orch.mjs context — niet met de hand wijzigen · ЗГЕНЕРОВАНО, не редагувати вручну -->
# Mijn Ruimte — компактний контекст агента · compacte agentcontext

- regelsVersie: `1.4.4`
- regelsHash: `1d75941b51ced2cf6fd6d40bed4a5b98c8b165a1856ea0f27eb602a40ba1436d`
- kritiekHash: `15fb72c45e30c0347440c8bc5002934d080b229eb61ce20543f5d1cd49b43bf7` (НЕ підтверджено власником · NIET bevestigd door eigenaar)
- база · basis: `20261031-093842` @ `b279ccabe31a27139b337822162653ccc13b6a5a` (opgave_eigenaar)
- інтеграційна гілка · integratietak: `integratie`

Вставте цей файл повністю на початку роботи. У відповіді-передачі вкажіть regelsHash і базовий commit, від якого ви працювали —
інакше результат буде позначено як «застаріла база/правила» й не потрапить у чергу без повторної перевірки.

## 0. Головний принцип · Hoofdprincipe

Одна пам'ять проєкту, одна система правил, одна інтеграційна черга, один узгоджений випуск — незалежно від кількості й типу агентів
(Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor, майбутні).
Één projectgeheugen, één regelset, één integratiewachtrij, één afgestemde release — hoeveel en welke agenten er ook zijn.

## 1. Платформа · Platform (незмінне)

- Mijn Ruimte — self-hosted BYOS-платформа (Ubuntu VM на залізі користувача). Жодних зовнішніх хмар для хостингу чи розгортання.
- Випуски атомарні: `mijn-ruimte-YYYYMMDD-HHMMSS.tar.gz`, SHA-256, установка лише через `/usr/local/sbin/mijn-ruimte-installeer`
  (`deploy/uitrol/mijn-ruimte-uitrol.sh`). Правила пакета: `deploy/REGELS-UITROLPAKKET.md` (UITROL-VERSIE, AUTEUR, AGENT, SAMENVATTING, BRON-COMMIT, UITROL-MANIFEST.json з 20261101).
- Жодного сирого root: дії від робочого користувача (`beheer`), системні зміни через заздалегідь написані конфіги/units. Нічого не розпаковувати в `/root`.
- Простори користувачів ізольовані й шифровані їхнім методом входу; власник сервера не має змоги їх розшифрувати.
- Мови: спілкування і звіти — українською; коментарі в коді — українською або нідерландською; тексти UI — українською/нідерландською.
  Англійська лише для неперекладних технічних термінів. Шляхи/адреси — нідерландською (`/verbindingen`, не `/connections`).
- Стек ВМ `<VM-IP>` (B-009): `Ubuntu 26.04.1 LTS` (`kernel 7.0`, `glibc 2.43`, `systemd 259.9`), `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`,
  `Caddy 2.11.7` (`admin.sock|0660`), `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. У `deploy/*.service` — `RestrictSUIDSGID=no` (інакше seccomp блокує `openat2` у `tar 1.35`).

## 2. Перед початком роботи · Vóór je begint (обов'язково)

1. Прочитай цей файл (або `orchestratie/CONTEXT-COMPACT.md`, якщо нема доступу до репозиторію) і `orchestratie/beleid.json`.
2. База коду: `beleid.json → basis.bronCommit` (зараз `b279ccab…`, версія `20261031-093842`, статус `opgave_eigenaar` — заявлено власником, ще не звірено
   з production). Гілка `voornaamst` — НЕ актуальна база (лише README). Якщо маєш доступ до сайту — звір `/api/version` і зафіксуй результат у BESLUITEN.md.
3. Зареєструй задачу: `node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha> --tak feature/orch-001-YYYYMMDD-HHMMSS`
   (без репозиторію — створи `ORCH-OVERDRACHT.json` вручну за зразком `orchestratie/sjablonen/ORCH-OVERDRACHT.json`).
4. Запусти `node scripts/orch.mjs controleer` і `node scripts/orch.mjs versheid --taak <ID> --fase start`. Червоне — не починай, спершу перебазуйся/перечитай правила.

## 3. Під час роботи · Tijdens het werk

- Власна гілка `feature|fix|audit|release/<тема>-YYYYMMDD-HHMMSS` від базового commit. Один Task ID (`ABC-001`) на задачу; він у назві гілки, коміті, PR, пакеті.
- Ніколи не пиши в чужі гілки, `voornaamst`, `integratie`, `release/*`. Ніколи не force-push, не переписуй історію, не видаляй резервні копії.
- Тихе перезаписування чужих змін заборонене: при конфлікті — rebase на інтеграційну гілку, конфлікти розв'язати явно, згадати в звіті.
- Виявив стару помилку — виправ (окремим комітом), не ігноруй. Нічого не прибирай «щоб запрацювало»: кнопку, вкладку, тест, перевірку.
- Секрети, токени, приватні ключі, вміст листів — ніколи в чат, лог, коміт чи пакет. Приватні ключі власника агентам не передаються.
- Production, default branch, резервні копії, критичні дозволи — тільки після явного погодження власника (не іншого агента).
- Діагностика й час власника (B-009): не просити власника вручну виконувати команди в терміналі (`df -h`, `journalctl`) чи вручну збирати пакети; без доступу до `<VM-IP>` дати стислий висновок (1–2 речення) для інфраструктурного агента на ПК власника. Не вгадувати причину збою `voorcontrole` (не списувати на `.zip`, якщо `structuur` пройдено). Деталі нижче, B-009.

## 4. Перед передаванням результату · Vóór overdracht

1. Усе закомічено. `node scripts/orch.mjs versheid --taak <ID> --fase overdracht` — зелене (база не застаріла з перетином файлів, правила чинні).
2. Тести: `node scripts/eenheidstests.mjs <фільтр>`, `npm run typecheck:server` (де можливо). Результати — у `TESTRESULTATEN` (формат v2) і звіті.
3. Передача будь-яким каналом з `beleid.json → inlevering.kanalen` (PR, MCP, HTTP API, локальний файл, ZIP, TAR.GZ, git patch, вебзавантаження),
   але завжди з `ORCH-OVERDRACHT.json`: taakId, agent, basisCommit, regelsVersie, regelsHash, samenvatting, список змінених файлів, тести.
   Приймає все один конвеєр: `node scripts/orch.mjs inleveren --bron <файл|тека|гілка>` — нова гілка від бази, зміни, конфлікти з `integratie`
   (`git merge-tree`), тести, запис у `orchestratie/inleveringen/`, черга. Передача, що змінює файли стану (`orchestratie/taken`, `inleveringen`,
   `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json`), відхиляється — їх пише лише `orch` або власник. Єдиний виняток — власний
   `orchestratie/taken/<ID>.json` (декларація агента з `taak-start`); при злитті лишається версія `integratie` (`.gitattributes` → `merge=orch-staat`).
4. Звіт українською: 1-м рядком — пряме посилання на `mijn-ruimte-<versie>.tar.gz` (окремо від `-overdracht.zip`); далі — що готово, що перевірено (фактично, не за метаданими), де результат, що наступне, що свідомо не зроблено.
5. Статус задачі: `in_progress` → `ter_integratie` (передано) → `integrated` (злито в `integratie`) → `released` (пакет зібрано) → `installed`
   (встановлено інсталятором на сервері). Статус змінює лише той крок, що його здійснив; агент не ставить `installed` сам.

## 5. Інтеграція та випуск · Integratie en release

- Одна послідовна черга: `orchestratie/wachtrij.json` (FIFO за базою; `wachtrij volgende|klaar|terugtrekken`, лише одна задача `bezig`).
  Злиття в `integratie` — завжди `--no-ff`, без force; конфлікт → `klaar --uitkomst afgewezen`, задача повертається агентові на rebase.
- Пакет на застарілій базі (basisCommit не предок `integratie`, перетин файлів) не випускається й не встановлюється.
- Режими встановлення (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/підпис власника; типовий),
  `automatisch_beperkt` — лише за окремо затвердженою й підписаною політикою. Зараз дозволені перші два.
- Критичні політики (`kritiek`) чинні лише з підтвердженням власника в `orchestratie/regels.lock.json → eigenaar`: підпис SSH (`orch bevestig`)
  або passkey на сайті (`eigenaar.soort = passkey`, запис у root-журналі); до того — «пропозиція».
- Зміна правил власником без SSH: сайт `mcp.tarasevych.com/agents` → «Координація» → редагування файлів правил → перевірка пропозиції (`regelsVersie`
  вища, запис у `BESLUITEN.md`, `beleid.json` валідний) → passkey (рішення `orch-regels`; root лише фіксує підтвердження у своєму журналі) →
  гілка `regels/<versie>-<час>` з новим lock і `CONTEXT-COMPACT.md` іде в `origin`. Злиття в `integratie` — лише власник. Сайт/MCP/HTTP викликають
  ті самі функції, що й CLI (`inleveren`, `beoordeelVoorstel`, `vergrendel`) — окремої логіки немає (`beleid.json → site`).
- **TRACE-001 (з 20261103-211555):** обов'язковий `ONTWIKKELARCHIEF.json` і підтверджена точна GitHub Release-asset SHA-256. Журнал комічений, сервер і root відхиляють відсутнє, неправильне чи недоступне. Детальні умови нижче, B-007, deploy/REGELS-UITROLPAKKET.md §7.
