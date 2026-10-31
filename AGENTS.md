# AGENTS.md — єдині правила для всіх ШІ-агентів Mijn Ruimte · één regelset voor alle AI-agenten

**Статус · status:** канонічне джерело правил (ORCH-001). Версія правил: див. `orchestratie/beleid.json → regelsVersie`; відбиток — `orchestratie/regels.lock.json`.
`CLAUDE.md`, `GEMINI.md`, `.cursorrules` тощо — лише адаптери, що вказують сюди. Якщо інший документ суперечить цьому файлу — чинний цей.
Dit is de canonieke bron. Adapters (`CLAUDE.md`, `GEMINI.md`, …) verwijzen hierheen. Bij tegenspraak geldt dit bestand.

Зміна правил = запис у `orchestratie/BESLUITEN.md` + вища `regelsVersie` + `node scripts/orch.mjs vergrendel`. Інакше `orch controleer` падає.

---

<!-- compact:begin -->
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
4. Звіт українською: що готово, що перевірено (фактично, не за метаданими), де результат, що наступне, що свідомо не зроблено.
5. Статус задачі: `in_progress` → `ter_integratie` (передано) → `integrated` (злито в `integratie`) → `released` (пакет зібрано) → `installed`
   (встановлено інсталятором на сервері). Статус змінює лише той крок, що його здійснив; агент не ставить `installed` сам.

## 5. Інтеграція та випуск · Integratie en release

- Одна послідовна черга: `orchestratie/wachtrij.json` (FIFO за базою). Наступний у черзі перебазовується на поточний `integratie` перед злиттям.
- Пакет на застарілій базі (basisCommit не предок `integratie`, перетин файлів) не випускається й не встановлюється.
- Режими встановлення (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/підпис власника; типовий),
  `automatisch_beperkt` — лише за окремо затвердженою й підписаною політикою. Зараз дозволені перші два.
- Критичні політики (`kritiek`) чинні лише з підписом власника (`orchestratie/regels.lock.json → eigenaar`); до того — «пропозиція».
<!-- compact:einde -->

---

## 6. Де що лежить · Waar staat wat

| Що | Де |
|---|---|
| Правила (людині) | `AGENTS.md` (цей файл) |
| Політика (машині) | `orchestratie/beleid.json` |
| Реєстр рішень | `orchestratie/BESLUITEN.md` |
| Відбиток правил, підпис власника | `orchestratie/regels.lock.json` |
| Публічні ключі власника | `orchestratie/eigenaar-ondertekenaars` |
| Компактний контекст (без GitHub/MCP) | `orchestratie/CONTEXT-COMPACT.md` (генерується: `node scripts/orch.mjs context`) |
| Задачі агентів | `orchestratie/taken/<TASK-ID>.json` |
| Черга інтеграції | `orchestratie/wachtrij.json` |
| Шаблони передачі | `orchestratie/sjablonen/` |
| Правила пакета випуску | `deploy/REGELS-UITROLPAKKET.md`, `shared/uitrol-manifest.ts`, `shared/uitrol-codes.ts` |
| Безпечне розгортання, passkey, відкат | `deploy/RUNBOOK-VEILIGE-UITROL.md` (§13 passkey, §15 рішення власника) |
| Доступи агентів, MCP | `deploy/RUNBOOK-AGENTEN-0.4.md`, `deploy/MCP-CONNECTOR.md`, `deploy/CONNECTOR-V2.md` |
| Afstemming (задачі/конфлікти/випуски на сайті) | `shared/afstemming-model.ts`, `backend/afstemming-*.ts`, `src/afstemming-vnext/` |
| Спільна папка знань (поза репозиторієм) | проєктна папка `knowledge/claude/` — довідка, не джерело правил |

## 7. Команди · Opdrachten

```bash
node scripts/orch.mjs controleer                     # beleid.json, lock, адаптери, задачі, черга — усе разом
node scripts/orch.mjs vergrendel                     # оновити regels.lock.json після зміни правил (+ вища regelsVersie)
node scripts/orch.mjs context                        # згенерувати orchestratie/CONTEXT-COMPACT.md
node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha40> --tak feature/orch-001-YYYYMMDD-HHMMSS
node scripts/orch.mjs versheid --taak ORCH-001 --fase start|overdracht
node scripts/orch.mjs onderteken-bericht             # рядок, який власник підписує (ssh-keygen -Y sign -n mijn-ruimte-regels)
node scripts/orch.mjs bevestig <bericht.sig>         # записати підпис власника в lock
node scripts/eenheidstests.mjs orch                  # тести координації
```

## 8. Що свідомо не є правилом · Wat géén regel is

Старі runbooks і документи змін лишаються довідкою про те, як працює код. Вони не додають правил понад цей файл і не скасовують його.
Якщо в них знайдено суперечність — виправити документ або додати рішення в `BESLUITEN.md`, а не мовчки обрати одне з двох.
