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

## Етап 2 — універсальні випуски (31.10.2026)

**Додано**
- `UITROL-BASIS` у пакеті (`maak-voorstelpakket.sh`, `maak-uitrolpakket.sh`: `BASIS_VERSIE` + `BASIS_COMMIT`, + `regelsVersie`/`regelsHash` з lock;
  обов'язково з `20261201-000000`). Root-інсталятор `mijn-ruimte-uitrol.sh`: `BASIS_ONGELDIG`, `BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `GEEN_BASIS`,
  `REGELS_NIET_VERGRENDELD` (python-відбиток = JS `regelsAfdruk`), `MODUS_NIET_TOEGESTAAN`; після вдалої установки пише `$WERK_ROOT/laatste-commit`.
  `gitops-ophalen.sh` (автоматично) — лише за `automatisch_beperkt` і підписаним lock.
- `scripts/orch/pakket.mjs` + `orch pakket`: `mijn-ruimte-<versie>.tar.gz` (через наявний `maak-voorstelpakket.sh`) + `mijn-ruimte-<versie>-<agent>-overdracht.zip`
  (архів, `.sha256`, `.voorstel.json`, `ORCH-OVERDRACHT.json` з `installatie` і `sindsInstallatie`, `UITROL-MANIFEST.json`, `TESTRESULTATEN.json`,
  `RAPPORT.md` uk+nl, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `LEESMIJ.txt`, `.sig` якщо є); задача → `released`.
  `orch pakket-controleer --bron <zip>` — перевірка без установки. `inleveren --bron <overdracht.zip>` — цілісність, потім вміст tar.gz.
- Виправлено (стан координації): власний `orchestratie/taken/<taakId>.json` дозволено в передачі; `.gitattributes` `merge=orch-staat` + драйвер у
  `wachtrij volgende`; `UITROL-BASIS` у `UITGESLOTEN_PADEN` (службові файли архіву не потрапляють у гілку).
- `beleid.json` 1.1.0 → **1.2.0** (`pakket`, `inlevering.eigenTaakBestandToegestaan`, статуси з `ter_integratie`), B-005, `REGELS-UITROLPAKKET.md` §6,
  `shared/uitrol-codes.ts` (+6 кодів), `.gitignore` `uitvoer/`.

**Перевірено**
- `tests/eenheid/orch-pakket-20261031.test.ts` — 23/23: справжній `orch pakket` на тимчасовому репозиторії (tar через `maak-voorstelpakket.sh`, вміст zip і tar,
  `UITROL-BASIS`, `ORCH-OVERDRACHT` з двома базами, `RAPPORT.md`, справжній `git bundle`, статус `released`), `pakket-controleer` (гаразд / підроблений
  tar → `INTEGRITEIT` / новіша встановлена → `BASIS_VEROUDERD` / інший commit → `BASIS_COMMIT_VERSCHILT`), імпорт zip через `inleveren` (існуюча гілка →
  `TAK_BESTAAT`; потім прийнято, гілка відтворена від бази), відмови `maak-voorstelpakket.sh` без/з некоректними `BASIS_*`.
- `tests/eenheid/orch-uitrol-basis-20261031.test.ts` — 14/14: справжній root-скрипт під непривілейованим користувачем (`setpriv`, uid 65534) зі стабом
  інсталятора: старий формат OK + `laatste-commit`, правильна база OK, `BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`,
  `REGELS_NIET_VERGRENDELD`, `MODUS_NIET_TOEGESTAAN` з lock, пораховaним у JS (python-відбиток root = JS), CRLF, `GEEN_BASIS`; стаб викликано рівно 4 рази.
- Разом `orch-*`: kern 67 + cli 16 + inleveren 36 + pakket 23 + uitrol-basis 14 = **156**; `uitrol-codes` 17, `uitrol-manifest` 18, `uitrol-pakket-maken` 5,
  `uitrol-weergave-v2` 29 — зелені. `uitrol-deur` пропущено (немає `ssh-keygen` у середовищі), `server-beheer`/`uitrol-goedkeuring` — немає `pg`.

**Свідомо не зроблено / обмеження**
- Підпис пакета справжнім ключем власника не перевірявся (ключа в агента немає й не має бути) — root-перевірка підпису лишається тією, що й була
  (`uitrol-deur`). Тести етапу 2 покривають усе після підпису.
- Виклик на production не виконувався; `laatste-commit` на сервері з'явиться після першої установки новим скриптом (до того `BASIS_COMMIT_VERSCHILT`
  не спрацьовує — лише версія).
- Сайт/MCP для завантаження пакета передачі — етап 3.
