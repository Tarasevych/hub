# Реєстр рішень · Besluitenregister (ORCH-001)

Append-only. Кожна зміна правил (`AGENTS.md`, `orchestratie/beleid.json`) = новий запис тут + підвищення `regelsVersie` + `node scripts/orch.mjs vergrendel`.
Alleen toevoegen. Elke wijziging van de regels = nieuw besluit hier + hogere `regelsVersie` + `vergrendel`.

Формат · vorm: `## B-NNN · РРРР-ММ-ДД · regelsVersie · статус` → Контекст / Рішення / Наслідки / Хто.
Статуси: `voorstel` (запропоновано агентом), `bevestigd` (підтверджено власником), `vervangen` (замінено B-…), `ingetrokken`.

---

## B-001 · 2026-10-31 · 1.0.0 · voorstel

**Контекст.** Над Mijn Ruimte паралельно працюють Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor. Правила були розсипані по
`deploy/REGELS-UITROLPAKKET.md`, `RUNBOOK-*.md`, спільній папці знань і чатах; кожен агент мав власне уявлення про базу коду.

**Рішення.** Єдине джерело правил — `AGENTS.md` (людиною) + `orchestratie/beleid.json` (машиною) + цей реєстр. `CLAUDE.md`, `GEMINI.md` та інші файли
середовищ — лише адаптери ≤ 25 рядків із маркером `<!-- orch-adapter -->`. Відбиток правил фіксується в `orchestratie/regels.lock.json`;
`node scripts/orch.mjs controleer` падає, якщо правила змінено без підвищення версії.

**Наслідки.** Старі документи лишаються як довідка (runbooks, REGELS-UITROLPAKKET); де вони суперечать AGENTS.md — чинний AGENTS.md.

**Хто.** Запропоновано агентом `claude` (ORCH-001, гілка `feature/orch-001-20261031-112355`). Потребує підтвердження власника.

## B-002 · 2026-10-31 · 1.0.0 · voorstel

**Контекст.** Остання заявлена встановлена версія `20261031-093842`, BRON-COMMIT `b279ccabe31a27139b337822162653ccc13b6a5a`
(гілка `release/sec-001-20261031-084138`, автор коміту Antigravity). Гілка `voornaamst` (default) містить лише README і є предком цього коміту.

**Рішення.** Базою для всіх нових задач є `b279ccab…`, доки власник не підтвердить іншу. Статус бази — `opgave_eigenaar`
(заявлено власником): агент не мав мережевого доступу до `hub.tarasevych.com/api/version`, звірку з production не виконано.
`voornaamst` не вважається актуальною базою коду.

**Наслідки.** Після незалежної звірки (власник або агент із доступом до сайту/інсталятора): `basis.verificatie = geverifieerd_productie`,
новий запис B-00x, підвищення `regelsVersie` до 1.0.1.

**Хто.** Агент `claude`. Потребує підтвердження власника.

## B-003 · 2026-10-31 · 1.0.0 · voorstel

**Контекст.** Критичні політики (режими встановлення, захищені гілки, заборона передавати приватні ключі) не можуть залежати від того, що
написав агент.

**Рішення.** Розділ `kritiek` у `beleid.json` має окремий `kritiekHash`. Власник підписує рядок `mijn-ruimte-regels\nregelsVersie=…\nkritiekHash=…`
своїм SSH-ключем ed25519 (namespace `mijn-ruimte-regels`, **не** `mijn-ruimte-uitrol`, щоб підпис випуску не був підписом правил):
`node scripts/orch.mjs onderteken-bericht > bericht.txt` → на ПК власника `ssh-keygen -Y sign -f <ключ> -n mijn-ruimte-regels bericht.txt` →
`node scripts/orch.mjs bevestig bericht.txt.sig`. Публічні ключі — `orchestratie/eigenaar-ondertekenaars`. Приватний ключ агентам не передається.
До підпису критичні політики мають статус «пропозиція»; автоматичний режим встановлення в такому стані заборонений.

**Хто.** Агент `claude`. Потребує підтвердження власника (сам підпис і є підтвердженням).

## B-004 · 2026-10-31 · 1.1.0 · voorstel

**Контекст.** Етап 1 ORCH-001: результати агентів надходять вісьмома каналами (GitHub PR/гілка, MCP, HTTP API, локальна тека, ZIP, TAR.GZ, git patch,
вебзавантаження); раніше кожен канал мав власну долю і міг тихо перезаписати чужу роботу.

**Рішення.** Усі канали йдуть через один конвеєр `node scripts/orch.mjs inleveren`: розпакувати → `ORCH-OVERDRACHT.json` → звірити правила й базу →
накласти на нову гілку від базового commit у тимчасовому worktree → виявити зміни → `git merge-tree` проти `integratie` → тести з
`beleid.json → inlevering.standaardTests` → запис `orchestratie/inleveringen/<id>.json` → черга. Відхилена передача не лишає гілки й не торкається
`integratie`. Черга послідовна (`wachtrij volgende|klaar|terugtrekken`, одна задача `bezig`). Статус `installed` виводиться лише з
`orchestratie/geinstalleerd.json` (пише інсталятор/власник), `integrated` — з факту злиття, `released` — з факту пакета.

**Наслідки.** `regelsVersie` 1.0.0 → 1.1.0 (додано `inlevering.standaardTests`, `werkruimte`, `geinstalleerd`); задачі з `regelsVersie 1.0.0` мають
перечитати правила (`versheid` → `REGELS_VEROUDERD`).

**Хто.** Агент `claude`. Потребує підтвердження власника.

## B-005 · 2026-10-31 · 1.2.0 · voorstel

**Контекст.** Етап 2 ORCH-001: випуск мав бути один для всіх агентів, а інсталятор перевіряв лише дату версії — пакет, зібраний на застарілій базі
або з іншими правилами, встановлювався, якщо його версія була новішою.

**Рішення.**
1. У пакеті `mijn-ruimte-<versie>.tar.gz` з'являється `UITROL-BASIS` (встановлена версія + commit + відбиток правил). Root-інсталятор звіряє його з
   `$WERK_ROOT/laatste-versie` і `laatste-commit` (`BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`), з `20261201-000000` — обов'язково
   (`GEEN_BASIS`). Якщо в пакеті є `orchestratie/regels.lock.json`, відбиток правил і `regelsVersie` мають збігатися (`REGELS_NIET_VERGRENDELD`),
   а режим установки — бути дозволеним у `kritiek.installatieModi` (`MODUS_NIET_TOEGESTAAN`). GitOps (`gitops-ophalen.sh`, автоматично) працює лише
   за `automatisch_beperkt` **і** підписаним власником lock.
2. Єдиний пакет передачі `mijn-ruimte-<versie>-<agent>-overdracht.zip` збирає `node scripts/orch.mjs pakket` (через `maak-voorstelpakket.sh`, без
   дублювання): архів, SHA-256, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`, тести, `RAPPORT.md`, коміти (`COMMITS.txt` + `commits.bundle`),
   агенти (`AGENTEN.json`), підпис `.sig` лише якщо власник підписав сам. Перевірка — `pakket-controleer`, імпорт без git — той самий `inleveren`.
3. Дві бази свідомо різні: `UITROL-BASIS`/`installatie` = **встановлена** (для інсталятора), `basisCommit` в `ORCH-OVERDRACHT.json` = **база гілки
   задачі** (від неї `inleveren` відтворює зміни й рахує коміти).
4. Власний `orchestratie/taken/<taakId>.json` дозволено в передачі (агент реєструє задачу у своїй гілці — іншого шляху в нього немає); інший стан
   координації лишається захищеним. При злитті версія `integratie` перемагає (`.gitattributes` → `merge=orch-staat`, драйвер задає
   `orch wachtrij volgende`).
5. Режими встановлення без змін (`handmatig`, `na_bevestiging`; `automatisch_beperkt` — лише за окремою підписаною політикою); приватні ключі
   власника агентам не передаються.

**Наслідки.** `regelsVersie` 1.1.0 → 1.2.0 (`pakket`, `inlevering.eigenTaakBestandToegestaan`, статус `ter_integratie` у переліку); задачі з
1.1.0 перечитують правила. Нові коди в `shared/uitrol-codes.ts`.

**Хто.** Агент `claude`. Потребує підтвердження власника (критичні політики не змінено, підпис лишається «пропозицією»).
