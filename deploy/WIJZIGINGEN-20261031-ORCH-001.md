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

## Етап 1 — єдина система розробки (31.10.2026)

**Додано**
- `scripts/orch/inleveren.mjs` + команда `orch inleveren`: один конвеєр для всіх 8 каналів (ZIP, TAR.GZ, git patch/mbox, локальна тека, git-гілка/PR-URL;
  MCP, HTTP API, вебзавантаження — ті ж файли з міткою каналу): розпакувати → `ORCH-OVERDRACHT.json` → правила й база → нова гілка від базового
  commit у тимчасовому worktree → фактичні зміни (звірка із заявленими) → `git merge-tree` проти `integratie` → тести → запис
  `orchestratie/inleveringen/<id>.json` → черга. Відхилена передача не лишає гілки, не торкається `integratie`, але запис лишається (аудит).
- Захист стану: передача, що змінює `orchestratie/taken`, `inleveringen`, `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json` → `BESCHERMDE_BESTANDEN`.
- Черга `orch wachtrij toon|volgende|klaar|terugtrekken` — послідовна (одна задача `bezig`), історія в `wachtrij.json → geschiedenis`.
- `orch status` — `in_progress / integrated / released / installed`; `installed` лише з `orchestratie/geinstalleerd.json` (пише інсталятор/власник),
  `integrated` — з факту злиття (`integratieCommit`), агент не може оголосити `installed` (`INSTALLED_ALLEEN_INSTALLER`).
- `orch werkruimte --taak ID` — ізольоване робоче дерево (git worktree) на гілці задачі; `orch taak-herlees` — підтвердження перечитаних правил;
  `orch staat-commit` — коміт лише файлів стану.
- `beleid.json` 1.0.0 → **1.1.0** (`inlevering.standaardTests`, `recordMap`, `werkruimte`, `geinstalleerd`), B-004 у BESLUITEN.md.

**Перевірено**
- `tests/eenheid/orch-inleveren-20261031.test.ts` — 36/36 на справжніх git-репозиторіях: ZIP від агента без git, TAR.GZ через MCP з видаленням файла,
  git patch (`git am`), застаріла база з перетином (`BASIS_VEROUDERD_OVERLAP` + `CONFLICT`, гілки не лишилось, `integratie` не перезаписано),
  без ORCH-OVERDRACHT, застарілі правила, впалі тести, свідомий пропуск тестів з причиною, підміна черги, git-гілка зареєстрованої задачі,
  werkruimte, послідовна черга (bezig → конфлікт при злитті → afgewezen → наступна → integrated), статус `installed` з факту установки, staat-commit.
- Разом `orch-*`: kern 53 + cli 16 + inleveren 36 = **105**.

**Свідомо не зроблено / обмеження**
- HTTP-маршрут і MCP-інструмент для завантаження передачі на сайт — етап 3 (вони лише доставляють файл у цей самий конвеєр).
- Автоматичне створення PR: `--push` відправляє гілку й друкує compare-URL; `gh pr create` не викликається (на сервері немає токена агента, і це
  правильно — PR створює той, хто має права).
- Статус `released` — етап 2 (пакет з `integratieCommit`).

**Наступне** — етап 2: `mijn-ruimte-…-AGENT-overdracht.zip` (інсталяційний архів + SHA-256 + метадані + звіт + тести + коміти + агенти + підпис),
перевірки інсталятора (базова версія, Git SHA, цілісність, правила), три режими встановлення.
