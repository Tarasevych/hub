<!-- GEGENEREERD door node scripts/orch.mjs context — niet met de hand wijzigen · ЗГЕНЕРОВАНО, не редагувати вручну -->
# Mijn Ruimte — компактний контекст агента · compacte agentcontext

- regelsVersie: `1.2.0`
- regelsHash: `e2d1de4e5b6edcc9c10ef88bc80f945790835e2cbb59e7974d4c84740bc45877`
- kritiekHash: `d978f0f1b25c1e714c25e1e52c2c10fe44207051a61f887299776bf1d8a3a492` (НЕ підтверджено власником · NIET bevestigd door eigenaar)
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

## 4. Перед передаванням результату · Vóór overdracht

1. Усе закомічено. `node scripts/orch.mjs versheid --taak <ID> --fase overdracht` — зелене (база не застаріла з перетином файлів, правила чинні).
2. Тести: `node scripts/eenheidstests.mjs <фільтр>`, `npm run typecheck:server` (де можливо). Результати — у `TESTRESULTATEN` (формат v2) і звіті.
3. Передача будь-яким каналом з `beleid.json → inlevering.kanalen` (PR, MCP, HTTP API, локальний файл, ZIP, TAR.GZ, git patch, вебзавантаження),
   але завжди з `ORCH-OVERDRACHT.json`: taakId, agent, basisCommit, regelsVersie, regelsHash, samenvatting, список змінених файлів, тести.
   Приймає все один конвеєр: `node scripts/orch.mjs inleveren --bron <файл|тека|гілка>` — нова гілка від бази, зміни, конфлікти з `integratie`
   (`git merge-tree`), тести, запис у `orchestratie/inleveringen/`, черга. Передача, що змінює файли стану (`orchestratie/taken`, `inleveringen`,
   `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json`), відхиляється — їх пише лише `orch` або власник. Єдиний виняток — власний
   `orchestratie/taken/<ID>.json` (декларація агента з `taak-start`); при злитті лишається версія `integratie` (`.gitattributes` → `merge=orch-staat`).
4. Звіт українською: що готово, що перевірено (фактично, не за метаданими), де результат, що наступне, що свідомо не зроблено.
5. Статус задачі: `in_progress` → `ter_integratie` (передано) → `integrated` (злито в `integratie`) → `released` (пакет зібрано) → `installed`
   (встановлено інсталятором на сервері). Статус змінює лише той крок, що його здійснив; агент не ставить `installed` сам.

## 5. Інтеграція та випуск · Integratie en release

- Одна послідовна черга: `orchestratie/wachtrij.json` (FIFO за базою; `wachtrij volgende|klaar|terugtrekken`, лише одна задача `bezig`).
  Злиття в `integratie` — завжди `--no-ff`, без force; конфлікт → `klaar --uitkomst afgewezen`, задача повертається агентові на rebase.
- Пакет на застарілій базі (basisCommit не предок `integratie`, перетин файлів) не випускається й не встановлюється.
- Режими встановлення (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/підпис власника; типовий),
  `automatisch_beperkt` — лише за окремо затвердженою й підписаною політикою. Зараз дозволені перші два.
- Критичні політики (`kritiek`) чинні лише з підписом власника (`orchestratie/regels.lock.json → eigenaar`); до того — «пропозиція».
- Випуск збирає лише `node scripts/orch.mjs pakket --taak <ID> --auteur "…" [--manifest …] [--testresultaten …] [--sig …]`: сумісний
  `mijn-ruimte-<versie>.tar.gz` (через `deploy/uitrol/maak-voorstelpakket.sh`, з файлом `UITROL-BASIS` = встановлена версія + commit + відбиток
  правил) і пакет передачі `mijn-ruimte-<versie>-<agent>-overdracht.zip` (архів, `.sha256`, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`,
  `TESTRESULTATEN.json`, `RAPPORT.md`, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `.sig` — лише якщо власник підписав на своєму ПК).
  Перевірка без установки: `pakket-controleer --bron <zip>`; імпорт на іншому боці без git: `inleveren --bron <zip>` (той самий конвеєр).
- Інсталятор (root) відхиляє пакет: база старіша за встановлену (`BASIS_VEROUDERD`), інший встановлений commit (`BASIS_COMMIT_VERSCHILT`),
  без `UITROL-BASIS` із версії `20261201` (`GEEN_BASIS`), правила ≠ `regels.lock.json` (`REGELS_NIET_VERGRENDELD`), режим поза політикою
  (`MODUS_NIET_TOEGESTAAN`). GitOps (автоматично) працює лише за `automatisch_beperkt` **і** підписаним lock. Приватні ключі агентам не передаються.
