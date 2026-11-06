> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261031-ORCH-001.uk.md) · [🇳🇱 **Nederlandse versie**](./WIJZIGINGEN-20261031-ORCH-001.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# ORCH-001 · Єдина система координації AI-агентів — журнал змін

Гілка: `feature/orch-001-20261031-112355` (від `b279ccabe31a27139b337822162653ccc13b6a5a` = BRON-COMMIT заявленої встановленої версії `20261031-093842`).
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
- `uitrol-manifest` (18/18) — наявні перевірки пакета не зачеплено.

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
  werkruimte, послідовна черга (bezig → конфлікт при злитті → afgewezen → наступна → integrated), статус `installed` з факту встановлення, staat-commit.
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
  `REGELS_NIET_VERGRENDELD` (python-відбиток = JS `regelsAfdruk`), `MODUS_NIET_TOEGESTAAN`; після вдалої встановлення пише `$WERK_ROOT/laatste-commit`.
  `gitops-ophalen.sh` (автоматично) — лише за `automatisch_beperkt` і підписаним lock.
- `scripts/orch/pakket.mjs` + `orch pakket`: `mijn-ruimte-<versie>.tar.gz` (через наявний `maak-voorstelpakket.sh`) + `mijn-ruimte-<versie>-<agent>-overdracht.zip`
  (архів, `.sha256`, `.voorstel.json`, `ORCH-OVERDRACHT.json` з `installatie` і `sindsInstallatie`, `UITROL-MANIFEST.json`, `TESTRESULTATEN.json`,
  `RAPPORT.md` uk+nl, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `LEESMIJ.txt`, `.sig` якщо є); задача → `released`.
  `orch pakket-controleer --bron <zip>` — перевірка без встановлення. `inleveren --bron <overdracht.zip>` — цілісність, потім вміст tar.gz.
- Виправлено (стан координації): власний `orchestratie/taken/<taakId>.json` дозволено в передачі; `.gitattributes` `merge=orch-staat` + драйвер у
  `wachtrij volgende`; `UITROL-BASIS` у `UITGESLOTEN_PADEN` (службові файли архіву не потрапляють у гілку).
- `beleid.json` 1.1.0 → **1.2.0** (`pakket`, `inlevering.eigenTaakBestandToegestaan`, статуси з `ter_integratie`), B-005, `REGELS-UITROLPAKKET.md` §6,
  `shared/uitrol-codes.ts` (+6 кодів), `.gitignore` `uitvoer/`.

**Перевірено**
- `tests/eenheid/orch-pakket-20261031.test.ts` — 23/23: справжній `orch pakket` на тимчасовому репозиторії (tar через `maak-voorstelpakket.sh`, вміст zip і tar,
  `UITROL-BASIS`, `ORCH-OVERDRACHT` з двома базами, `RAPPORT.md`, справжній `git bundle`, статус `released`), `pakket-controleer` (гаразд / підроблений
  tar → `INTEGRITEIT` / новіша встановлена → `BASIS_VEROUDERD` / інший commit → `BASIS_COMMIT_VERSCHILT`), імпорт zip через `inleveren` (наявна гілка →
  `TAK_BESTAAT`; потім прийнято, гілка відтворена від бази), відмови `maak-voorstelpakket.sh` без/з некоректними `BASIS_*`.
- `tests/eenheid/orch-uitrol-basis-20261031.test.ts` — 14/14: справжній root-скрипт під непривілейованим користувачем (`setpriv`, uid 65534) зі стабом
  інсталятора: старий формат OK + `laatste-commit`, правильна база OK, `BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`,
  `REGELS_NIET_VERGRENDELD`, `MODUS_NIET_TOEGESTAAN` з lock, порахованим у JS (python-відбиток root = JS), CRLF, `GEEN_BASIS`; стаб викликано рівно 4 рази.
- Разом `orch-*`: kern 67 + cli 16 + inleveren 36 + pakket 23 + uitrol-basis 14 = **156**; `uitrol-codes` 17, `uitrol-manifest` 18, `uitrol-pakket-maken` 5,
  `uitrol-weergave-v2` 29 — зелені. `uitrol-deur` пропущено (немає `ssh-keygen` у середовищі), `server-beheer`/`uitrol-goedkeuring` — немає `pg`.

**Свідомо не зроблено / обмеження**
- Підпис пакета справжнім ключем власника не перевірявся (ключа в агента немає й не має бути) — root-перевірка підпису лишається тією, що й була
  (`uitrol-deur`). Тести етапу 2 покривають усе після підпису.
- Виклик на production не виконувався; `laatste-commit` на сервері з'явиться після першої встановлення новим скриптом (до того `BASIS_COMMIT_VERSCHILT`
  не спрацьовує — лише версія).
- Сайт/MCP для завантаження пакета передачі — етап 3.

## Етап 3 — керування через сайт, MCP і HTTP; правила з passkey (31.10.2026)

**Додано**
- `shared/orch-model.ts` — маршрути `/api/owner/orch/*`, ліміти (фрагмент 512 КіБ, пакет ≤ 300 МіБ, 20 завантажень/год), типи, коди `ORCH_CODES` (uk+nl).
- `backend/orch-opslag.ts` — єдиний доступ до робочої копії координації (`ORCH_WORTEL`, типово `/srv/mijn-ruimte/orch-repo`): огляд, контекст,
  реєстрація задачі, завантаження фрагментами в `ORCH_INBOX` → той самий `inleveren(...)`/`registreerInlevering(...)`, пропозиції правил через
  `beoordeelVoorstel`, застосування (`vergrendel` → `bevestigMetPasskey`, `compacteContext`, `controleer`, commit, push, compare-URL). Жодної
  власної логіки правил — лише виклики `scripts/orch/kern.mjs` і `scripts/orch/inleveren.mjs` (для них додано `.d.mts`).
- `backend/orch-routes.ts` (власник, `requireSession` + `isOwnerEmail`; `ADMIN_SERVICE_REQUIRED` для технічного простору), `backend/orch-hulpmiddelen.ts`
  + `orch-hulpmiddeldefinities.ts` (MCP: `orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_begin|stuk|klaar`; у каталозі v2,
  `TOOL_CAPABILITY`, `mcp-acties`, двомовні тексти), `backend/orch-besluit-pg.ts` (пошук рішення для застосування).
- Рішення власника нового виду **`orch-regels`**: `deploy/goedkeuring/besluit-kern.mjs` (+ `.d.mts`), `deploy/besluit/mijn-ruimte-besluit.sh`
  (`orch_regels`: root лише дописує підтвердження у `$WERK/orch-regels-bevestigd.jsonl` 0600 і переписує `$STATUS/orch-regels-bevestigd.json` 0640,
  останні 50; подія `BESLUIT_ORCH_REGELS_OK`; вимикач `orch-regels-passkey`), `backend/eigenaar-besluit.ts`, `shared/eigenaar-besluit.ts`,
  `src/besluit/besluit-client.ts`.
- `deploy/gitops/gitops-ophalen.sh` — passkey-lock приймається **лише** якщо той самий запис є в root-журналі (`GITOPS_ORCH_BEVESTIGD`);
  підпис SSH — як і раніше.
- Сайт: `src/agenten/TabOrch.tsx` + `src/orch/orch-client.ts` + `src/orch/orch.css` (вкладка «Координація»: огляд, задачі/черга/передачі,
  передача пакета з пристрою з поступом, редактор правил → перевірка → passkey → гілка), довідка `orch.inlevering` / `orch.regels` у `hulp-register`.
- `server/platform/antwoord.ts` — `json`/`error` без ланцюжка до `pg` (router реекспортує); маршрути координації тестуються без бази.
- `deploy/installeer-app.sh` → `orch_inrichten` (створює `orch-inbox`, повідомляє про наявність робочої копії). `beleid.json` 1.2.0 → **1.3.0**
  (розділ `site`; `kritiek.toelichting` згадує passkey), B-006, `AGENTS.md` §5–§7, RUNBOOK §18, `uitrol-codes` (+`BESLUIT_ORCH_REGELS_OK`).
- Виправлено старе: `tests/eenheid/besluit-root-20261022.test.ts` падав, якщо тести запускає root (скрипт свідомо ігнорує `BESLUIT_*` для root) —
  тепер запускається під uid 65534 через `setpriv` (спільні помічники експортовано). `hulpmiddelen-tweetalig` використовує спільний
  `tests/eenheid/hulp/taalcontrole.ts`. `backend/index.ts` викликав `gmailParserPolicySelfTest`, `normalizeGmailMessage`, `gmailMaxHistoryId`,
  `gmailHistoryMessageIds` і тип `MailClassificationSignals` **без імпорту** (загублено у знімку SEC-001 30.10.2026; tsc TS2304, у рантаймі —
  ReferenceError у Gmail-синхронізації) — імпорти повернено. `backend/mail-afzenders.ts`: `was` поза областю видимості в `afzenderVerifieren`
  (ReferenceError при ручній верифікації відправника) → `basis.status`; `fout` став оголошенням функції (TS звужує тип після `if (!x) fout()`);
  рядки збереженого доказу звіряються з `AuthUitslag` (`shared/mail-afzenders.ts → authUitslag`). `tsc -p tsconfig.server.json`: 130 → 111 помилок,
  усі решта — відсутні в середовищі модулі (`pg`, `ws`, `pdf-lib` → TS2307/TS7006) і два місця, що залежать від типів `pg`
  (`ruimte-scheiding.ts:117`, `uitrol-goedkeuring.ts:447`, `index.ts:636`) — перевірити в середовищі з повним `node_modules`.

**Перевірено**
- `tests/eenheid/orch-site-20261031.test.ts` — 74/74 на справжніх git-репозиторіях з `origin`: поріг доступу (401, `OWNER_REQUIRED`,
  `ADMIN_SERVICE_REQUIRED`), `ORCH_GEEN_REPO` без емуляції, огляд/контекст, реєстрація задачі (`TAAK_BESTAAT`, `TAAK_ONGELDIG`, `BASIS_ONBEKEND`),
  завантаження фрагментами (ім'я, розмір, зміщення, SHA-256, незавершене + скасування) → прийнято/відхилено (`REGELS_VEROUDERD`), MCP-інструменти
  через `voerOrchToolUit`, пропозиція правил (усі коди відмови, 413), застосування (`GEEN_BESLUIT`, `BESLUIT_PAST_NIET`, `NIET_BEVESTIGD_DOOR_ROOT`,
  `ORCH_REPO_VUIL`; успіх: гілка `regels/<versie>-<час>`, lock з passkey, CONTEXT-COMPACT, push в origin, `controleer` зелений, повтор →
  `GEEN_VOORSTEL`), `VOORSTEL_VEROUDERD` після зміни правил, відкликання; реєстри (каталог v2, довжина імен ≤ 64 для кожного агента, мова текстів).
- `tests/eenheid/orch-besluit-root-20261031.test.ts` — 34/34: справжній `mijn-ruimte-besluit.sh` під uid 65534 (журнал 0600, файл стану 0640, подія,
  вимикач, права не змінено, інсталятор не викликано; атаки: вміст, невідомий ключ, повторний підпис, чужа задача, інший hash, вимкнено);
  `rootBevestigingen()` читає файл root; перевірка GitOps виконується тим самим Python-кодом зі скрипта проти справжнього журналу (прийнято;
  без журналу; чужий besluit/voorstel/hash/kritiekHash; неповний passkey; зіпсований журнал; SSH-шлях; без eigenaar).
- Разом `orch-*`: kern 78 + cli 16 + inleveren 36 + pakket 23 + uitrol-basis 14 + site 74 + besluit-root 34 = **275**; `besluit-root` 47/47,
  `mcp-acties` 12/12, `uitrol-codes` 17/17; `bash -n` для трьох скриптів; `tsc -p tsconfig.server.json` — у змінених файлах помилок немає.

**Свідомо не зроблено / обмеження**
- Перевірка типів фронтенду (`src/`) у середовищі агента неможлива: немає `react`/`lucide-react`/`@types/react`, `npm install` блокується
  (403 на `cdn.sheetjs.com`). Логіку `TabOrch.tsx` перевірено з заглушками типів; остаточно — CI/`npm run typecheck` у власника.
- Тести, що потребують `pg` (`connector-v2`, `tweetalig`, `besluit-app`), тут не запускаються — реєстри перевірено окремо в `orch-site`.
- Робочу копію координації на сервері (`/srv/mijn-ruimte/orch-repo`) створює власник з deploy-ключем (RUNBOOK §18.1) — інсталятор свідомо не має ключа.
- Production не чіпалося; гілка `regels/*` після passkey лише відправляється в `origin`, злиття в `integratie` — за власником.

**Наступне** — етап 4: приймальні тести (паралельні агенти, конфлікти git, застарілий випуск, імпорт архіву без git, зміна політики, відновлення
«замороженого» агента, одночасні встановлення, відкат).

## Етап 4 — приймальні тести (31.10.2026)

**Додано**
- `tests/eenheid/orch-acceptatie-20261031.test.ts` — 47 перевірок у восьми наскрізних сценаріях з ТЗ на справжньому git-репозиторії через CLI
  (`inleveren`, `wachtrij`, `status`, `versheid`, `taak-herlees`, `taak-staat`, `pakket`, `pakket-controleer`), справжньому root-інсталяторі
  (`mijn-ruimte-uitrol.sh` під uid 65534) і справжньому root-скрипті рішень (`mijn-ruimte-besluit.sh` + passkey):
  1. **Паралельні агенти** — claude і codex від однієї бази змінюють різні файли; обидві передачі прийняті, черга веде їх по одному
     (`volgende` → `git merge --no-ff` → `klaar integrated`), обидва результати в `integratie`, нічого не загублено, база лишилась предком вершка.
  2. **Конфлікти git** — при здачі (gemini на застарілій базі чіпає той самий файл → `BASIS_VEROUDERD_OVERLAP` + `CONFLICT`, гілки немає,
     `integratie` незмінна) і при злитті (grok і antigravity прийняті від однієї бази, другий конфліктує лише при `merge` → abort,
     `klaar afgewezen`, задача назад у `in_progress`); обидва агенти після rebase на свіжу базу з новою міткою гілки прийняті й злиті.
  3. **Застарілий випуск** — `orch pakket` з `integratie` (`UITROL-BASIS` = встановлена база); root встановлює (OK, `laatste-commit`), факт встановлення
     робить задачі `installed`; після того як «інший агент» установив новішу версію, пакет на старій базі root відхиляє (`BASIS_VEROUDERD`,
     інсталятор не викликано) — і `pakket-controleer` каже те саме.
  4. **Імпорт без git** — агент працює з `CONTEXT-COMPACT.md` (містить версію й відбиток правил) та експортом бази без `.git`, повертає zip;
     запис передачі фіксує канал, причину «без git» і SHA-256.
  5. **Зміна політики** — власник підвищує `regelsVersie` (запис у BESLUITEN.md, `vergrendel`, `context`); задача зі старими правилами →
     `REGELS_VEROUDERD` у `versheid`, передача відхилена; після `taak-herlees` — прийнята й злита.
  6. **«Заморожений» агент** — задача `bezig` у черзі, агент зник: `wachtrij terugtrekken --reden` + `taak-staat bevroren` → черга йде далі
     (`WACHTRIJ_LEEG`, не `WACHTRIJ_BEZIG`), `status` показує `bevroren`, передача → `TAAK_BEVROREN`, `controleer` зелений; після `in_progress`
     нова передача прийнята, стара гілка не перезаписана.
  7. **Одночасні встановлення** — друга інсталяція під час першої: `flock` → «er loopt al een uitrol», вихід 0, інсталятор не викликано вдруге,
     пакет лишається в inbox; наступний прохід ставить його; у стабі старт другого ПІСЛЯ кінця першого.
  8. **Відкат** — passkey-рішення `terugdraaien` → root-скрипт → інсталятор `terugdraaien <vorige>`, `current` → попередній випуск; у координації
     факт встановлення повертається на попередню базу → задачі знову `released` (не `installed`), той самий пакет знову валідний проти бази.
- Виправлено старе (знайдено сценарієм 7): `mijn-ruimte-uitrol.sh` після вдалої встановлення **стирав усі** `mijn-ruimte-*.tar.gz` з inbox — і новіший
  пакет, що надійшов під час встановлення, тихо зникав. Тепер прибираються лише пакети не новіші за встановлену версію; новіший лишається на
  наступний прохід, де його судять звичайні перевірки (версія, `UITROL-BASIS`, правила).

**Перевірено**
- `orch-acceptatie` 47/47; разом `orch-*` = **322** (kern 78, cli 16, inleveren 36, pakket 23, uitrol-basis 14, site 74, besluit-root 34,
  acceptatie 47); `besluit-root` 47; `bash -n` інсталятора.

**Свідомо не зроблено / обмеження**
- Сценарії з root (3, 7, 8) виконуються лише там, де є `setpriv` або тести не запущено від root; без цього вони пропускаються з повідомленням.
- Production не чіпалося; усі сценарії — на тимчасових репозиторіях і деревах.

## Незалежна перевірка перед інтеграцією (31.10.2026, Antigravity `a5f2741` + ChatGPT PR #13)

Власник прогнав PR #11 через двох незалежних агентів. Antigravity виявив критичні блокери й підготував гілку `fix/orch-001-review-20261031-165744`
(`a5f2741`, 688/688 на його машині); ChatGPT — чорновий PR #13 (`fix/orch-001-audit-20261031-170250`, 4 зміни без прогону). Обидві гілки
починаються від `d4c2ae9`; `a5f2741` злито у `feature/orch-001-20261031-112355` без змін (fast-forward), дельту PR #13 додано окремим комітом.

**Прийнято з `a5f2741` (кожну групу прочитано рядок за рядком і перевірено тестами тут)**
- **CRITICAL — RCE №1.** `uploadKlaar` (сайт/MCP/HTTP) більше не передає `tests[]` у `sh -c`: будь-що, крім рівно `node scripts/orch.mjs controleer`,
  → `400 TESTS_NIET_TOEGESTAAN`; параметр `tests` вилучено зі схеми `orch_inleveren_klaar`. `veiligeTestEnv` — дочірні процеси отримують лише
  `PATH/HOME/TMP*/LANG/LC_ALL/TZ/…`, без `DATABASE_URL`, ключів і перців.
- **CRITICAL — RCE №2.** Стандартна перевірка виконувала `scripts/orch.mjs` **з пакета агента** (cwd = розпаковане дерево). Тепер запускається
  довірений `join(wortel, 'scripts/orch.mjs') controleer --wortel <дерево>` через `spawnSync(process.execPath, …)`, без shell; `orch.mjs` навчився
  `--wortel`. Регресійний тест кладе в пакет `scripts/orch.mjs`, що пише `PWNED.txt`, — файл не з'являється.
- **HIGH — GitOps і SSHSIG.** `gitops-ophalen.sh` (PYMODUS) раніше приймав будь-який непорожній `eigenaar.handtekening`; тепер — справжня перевірка
  `ssh-keygen -Y find-principals` + `-Y verify -n mijn-ruimte-regels` проти **root-файла** `/etc/mijn-ruimte/eigenaar-ondertekenaars` (не з релізу —
  RUNBOOK §18.1.5). `verifieerSshsig` у `kern.mjs`: опції allowed_signers (`namespaces=`, негація, заборона `cert-authority`), версія SSHSIG = 1,
  довжини полів, заборона зайвих байтів, тип підпису ed25519/64 байти.
- **HIGH — регресія SEC-001-05.** `orch` додано в `IMPERSONATIE_ALTIJD_VERBODEN` і `AGENT_VERBODEN`: усі `/api/owner/orch/*` заборонені під
  імперсонацією (і з `metActies`) та для агентів від імені власника.
- **HIGH — архіви, git-refs, ізоляція `ORCH_WORTEL`.** `controleerZipVooraf`/`controleerTarGzVooraf` відхиляють до розпакування symlink/спецфайли,
  `..`, абсолютні шляхи, `\`, `:`, >60 000 записів (`INHOUD_ONVEILIG`); `padVeilig` — ще й порожні сегменти, `.`, вкладений `.git`; `githubRef`
  відкидає аргументи з `-` і недопустимі символи (`REF_ONGELDIG`), `fetch origin -- <ref>`. `voorstelToepassen`: точна звірка `besluit.id` із записом
  root-журналу (той самий id, без дефісів) і гілка `regels/*` будується в ізольованому `git worktree` — `ORCH_WORTEL` лишається на `integratie`.
- **MEDIUM.** `shared/zoek-ui-knoppen.generated.ts` перегенеровано (`TabOrch` → профіль `technisch`, вкладка `#orch` теж); `TS2345` у
  `backend/codewoord.ts`; коментар `src/orch/orch.css` містив `*/` і закривав коментар достроково; `tr -d '\r'` для python-виводу й `sed` для
  `\`-префікса `sha256sum` у `maak-*.sh`; `controleer` порівнює CONTEXT-COMPACT після `normaliseer` (CRLF). Новий набір
  `tests/eenheid/orch-beoordeling-20261031.test.ts`.

**Прийнято з PR #13 (ChatGPT) — чого не було в `a5f2741`**
- **Прив'язка завантаження до актора-ініціатора.** `uploadStuk`/`uploadKlaar`/`uploadAnnuleren` отримують `actor` (HTTP: email власника; MCP:
  `clientName (agent) via mcp [grant/token-id]`) і порівнюють із `door`, записаним у `uploadBegin`; інший актор отримує `UPLOAD_ONBEKEND` (404), як
  для відсутнього. Інакше будь-який агент, що дізнався 16-hex `id`, міг завершити або скасувати чуже завантаження. Серверний id grant-у/токена
  додано свідомо (ChatGPT сам позначив це як залишковий ризик): дві підключення з однаковою назвою «Grok (grok)» — різні актори. Покрито 5
  перевірками в `orch-beoordeling` (MCP↔HTTP, інший агент, та сама назва через інший grant, скасування лише ініціатором, `door` містить id).
- **Не прийнято:** `TESTS_NIET_GEISOLEERD` (409) із повним пропуском перевірок і забороною `zonderTests` — перекрито безпечнішим варіантом Antigravity
  (довірений `controleer` таки виконується, без коду пакета); `zonderTests` лишається дозволеним — після адверсарної перевірки (нижче) лише
  примітка в записі: довірений `controleer` виконується завжди.

**Виправлено старе (знайдено під час інтеграції)**
- `orch-uitrol-basis` і `orch-acceptatie` ставили shim `ssh-keygen` лише коли справжнього немає; на машині зі справжнім `ssh-keygen` їхні фіктивні
  `.sig` давали `HANDTEKENING_ONGELDIG`. Shim тепер завжди попереду в `PATH` (ці набори перевіряють не підпис — підпис перевіряє `uitrol-deur`).

**Перевірено (у цьому середовищі, зі справжнім `ssh-keygen` 9.6)**
- `orch-beoordeling` 28/28 (23 Antigravity + 5 актор-прив'язка), `orch-site` 74/74, `orch-besluit-root` 36/36 (у т.ч. справжній підпис → GitOps
  приймає, підроблений → відхиляє), `orch-uitrol-basis` 14/14, `orch-acceptatie` 47/47, `orch-kern`/`orch-cli`/`orch-inleveren`/`orch-pakket` — див.
  підсумок нижче; `tsc -p tsconfig.server.json` — 110 помилок, усі в не-ORCH файлах через відсутні `@types/pg`/`react` у пісочниці (було 111;
  `codewoord.ts` виправлено); `node scripts/zoek-ui-catalogus.mjs --controle` актуально (1331); `npm run orch:controleer` зелений; `bash -n` п'яти
  скриптів; `python3 -m py_compile` блоку PYMODUS; `build:server` (esbuild) зібрався; `vite build` у пісочниці неможливий (немає vite/react).
- Повний набір `node scripts/eenheidstests.mjs` без фільтра у пісочниці зупиняється на першому ж тесті, якому потрібна БД (`DATABASE_URL_ONTBREEKT`),
  як і на базі `d4c2ae9`; тому набори прогнано по одному — підсумок у звіті в треді.

## Адверсарна перевірка після інтеграції (31.10.2026)

Після злиття `a5f2741` + PR #13 гілку ще раз розібрали «атакувальними» лінзами (19 знахідок). Кожну перевірено вручну; реальні виправлено й
покрито тестами, що на попередньому коді падали б.

**HIGH**
- **GitOps не звіряв lock із файлами релізу.** PYMODUS перевіряв підпис/passkey лише для `lock.kritiekHash`, а `beleid.json` у релізі міг містити
  ІНШІ критичні політики (агент дописує `automatisch_beperkt` чи `privesleutelsNaarAgenten: true` поверх старого підтвердженого lock). Тепер
  PYMODUS (і PYREGELS root-інсталятора) рахує `stabielJson`/`kritiekAfdruk`/`regelsAfdruk` у Python так само, як `kern.mjs` (BOM/CRLF, кирилиця,
  emoji, `1.0`, `1e20` — перевірено тестом на збіг байт у байт), і вимагає рівності `kritiekHash`, `hash`, `regelsVersie`; `regelBestanden` —
  безпечні шляхи, з `AGENTS.md` і `beleid.json`; `NaN` у JSON відхиляється; `python3 -I`. Тести `orch-besluit-root` і 5e в `orch-beoordeling`
  раніше подавали фіктивні відбитки — тепер справжній реліз.
- **CLI `inleveren` виконував код пакета типово** (`standaardTests[1]` = `node scripts/eenheidstests.mjs orch-kern` у дереві пакета,
  з `HOME` оператора). Тепер — лише довірений `controleer`; shell-тести тільки за явним `--tests`/`--standaardtests` з попередженням; після
  помилок кроку 6 (конфлікт, застарілість) тести не запускаються взагалі.
- **Розпакувальна бомба.** Передперевірки обмежували кількість записів, але не обсяг: 408 КіБ → 400 МіБ на диску. Тепер ≤ 1 ГіБ на архів за
  ФАКТИЧНИМИ байтами (`unzip -p`/`gzip -dc` → `head` → `wc`, без запису): перевірено, що unzip 6.0 пише 20 МіБ при заголовку «10 байт».
  Для tar ще й сума розмірів із заголовків (розріджений файл 64 МіБ із потоку 10 КБ), і після розпакування — видимий обсяг тек.

**MEDIUM**
- `zonderTests` на сервері вимикав довірений `controleer` → пакет зі зміненим `AGENTS.md` без lock проходив. Тепер `controleer` завжди.
- Агент міг діяти від імені іншого (`orch_taak_start` з чужим `agent`, пакет із чужим `agent` в `ORCH-OVERDRACHT.json`) → `AGENT_VERSCHILT`;
  запис передачі зберігає `door`.
- `deploy/mijn-ruimte.service` без `ReadWritePaths` для `orch-inbox`/`orch-repo` → EROFS при першому завантаженні. Додано (RUNBOOK §18.1.6).
- `compactContext.bestand` не перевірявся — пропозиція правил могла записати файл поза деревом або поверх `AGENTS.md`. Тепер лише
  `orchestratie/<назва>.md` (`CONTEXT_PAD`) у `valideerBeleid`, у `context()`, `voorstelToepassen` і CLI `context`.

**LOW**
- Гілка `regels/*` будується від перевіреного SHA, а не назви гілки (TOCTOU); гілку створюємо самі перед `worktree add`, а при збої
  (напр. post-checkout hook) прибираємо і дерево, і гілку — тест із hook.
- MCP: ліміт 20/год на `begin` і `klaar` на власника; `orch_overzicht` для агента маскує e-mail власника, чужі завантаження, passkey і besluit-id.
- Старе: список конфліктів містив інформаційні рядки `git merge-tree` («Auto-merging …»); помилки розпакування мали український текст і в `nl`.

**Тести:** `orch-beoordeling` 28 → 49, `orch-besluit-root` 36 → 49, `orch-inleveren` 36 → 41, `orch-uitrol-basis` 14 → 15; явні
`OVERGESLAGEN`-повідомлення, якщо бракує `ssh-keygen`/`python`/`tar --sparse`; ізоляцію worktree перевіряє reflog; `veiligeTestEnv` — наскрізно
(код пакета не бачить `DATABASE_URL`/`SESSION_SECRET` оператора).

**Обмеження / далі за власником**
- На сервері потрібен root-файл `/etc/mijn-ruimte/eigenaar-ondertekenaars` (RUNBOOK §18.1.5), інакше GitOps відхиляє SSH-підписаний lock.
- PR #11 не злито, `integratie` не створено, політики не підписано, production (`b279ccab…`) не чіпалося — чекає на окреме `DEPLOY ПІДТВЕРДЖЕНО`.
