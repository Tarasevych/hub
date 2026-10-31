# ORCH-001 · Єдина система координації AI-агентів — журнал змін · wijzigingen

Гілка · tak: `feature/orch-001-20261031-112355` (від `b279ccabe31a27139b337822162653ccc13b6a5a` = BRON-COMMIT заявленої встановленої версії `20261031-093842`).
Task ID: `ORCH-001`. Агент: `claude`. Статус задачі: `orchestratie/taken/ORCH-001.json`.

## Етап 0 — спільна пам'ять і правила (31.10.2026)

**Додано**
- `AGENTS.md` — канонічні правила для всіх агентів (uk+nl). Compact-блоки між `<!-- compact:begin/einde -->` потрапляють у компактний контекст.
- `orchestratie/beleid.json` — машинозчитувана політика: база, інтеграційна гілка, шаблон гілок/Task ID, статуси, канали прийому, агенти, адаптери,
  розділ `kritiek` (режими встановлення, захищені гілки, заборона передавати приватні ключі).
- `orchestratie/BESLUITEN.md` — реєстр рішень (append-only), B-001…B-003 зі статусом `voorstel` до підтвердження власником.
- `orchestratie/regels.lock.json` — відбиток правил (`hash`) і критичних політик (`kritiekHash`); поле `eigenaar` для підпису власника.
- `orchestratie/eigenaar-ondertekenaars` — публічні ключі власника (allowed_signers, namespace `mijn-ruimte-regels`). Приватні ключі агентам не передаються.
- `orchestratie/CONTEXT-COMPACT.md` — згенерований контекст для агентів без GitHub/MCP (≤ 12 КБ; `controleer` падає, якщо застарів).
- `orchestratie/taken/ORCH-001.json`, `orchestratie/wachtrij.json`, `orchestratie/sjablonen/ORCH-OVERDRACHT.json` — задачі, послідовна черга, шаблон передачі.
- Адаптери (≤ 25 рядків, маркер `<!-- orch-adapter -->`): `CLAUDE.md`, `GEMINI.md`, `ANTIGRAVITY.md`, `CHATGPT.md`, `CODEX.md`, `GROK.md`,
  `.github/copilot-instructions.md`, `.cursorrules`. Жодних власних правил — лише посилання на AGENTS.md та id агента.
- `scripts/orch.mjs` + `scripts/orch/kern.mjs` — CLI: `controleer`, `vergrendel`, `context`, `taak-start`, `taak-staat`, `versheid`, `onderteken-bericht`, `bevestig`.
  Перевірка SSHSIG (ed25519) реалізована на `node:crypto` — працює й там, де немає `ssh-keygen`.
- Тести: `tests/eenheid/orch-kern-20261031.test.ts` (53), `tests/eenheid/orch-cli-20261031.test.ts` (16, реальні git-сценарії: застаріла база з перетином
  файлів, база не предок HEAD, правила оновились, адаптер став зводом правил, агент не може ставити `installed`).
- `package.json`: `npm run orch:controleer`.

**Перевірено**
- `node scripts/eenheidstests.mjs orch-` → 69/69. `node scripts/orch.mjs controleer` → зелено (попередження `KRITIEK_NIET_BEVESTIGD` — очікуване до підпису власника).
- `uitrol-manifest` (18/18) — існуючі перевірки пакета не зачеплено.

**Свідомо не зроблено / обмеження**
- Базу `20261031-093842 @ b279ccab…` **не звірено з production**: із середовища агента `hub.tarasevych.com` недоступний (proxy 403), а MCP-інструменти
  технічного простору (`_beheer`) неактивні. У `beleid.json` статус бази `opgave_eigenaar`; після звірки — B-004 і `regelsVersie 1.0.1`.
- Критичні політики не підписані власником: потрібен `ssh-keygen -Y sign -n mijn-ruimte-regels` на ПК власника (T:\), див. B-003.
- Перевірку SSHSIG звірено з емульованим підписом за PROTOCOL.sshsig, не з реальним `ssh-keygen` (його немає в середовищі). Перший реальний підпис власника
  стане контрольною перевіркою.
- Гілка `integratie` ще не існує в origin; `versheid` тимчасово бере `origin/release/sec-001-20261031-084138` (basisTak). Створення `integratie` —
  за погодженням власника (захищена гілка).

**Наступне** — етап 1: приймання результатів з усіх каналів (`orch inleveren`: PR/MCP/HTTP/файл/ZIP/TAR.GZ/patch/вебзавантаження → спільна перевірка
конфліктів, тести, PR), черга інтеграції як процес, статуси `installed/integrated/in_progress/released` зв'язати з `app.uitrol_runs`.
