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
