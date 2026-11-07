> 🌐 **Мова:** **Українська** · [Nederlands](BESLUITEN.nl.md) | [Головна](../README.md) · [Покажчик документації](../docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

# Реєстр рішень · Besluitenregister (ORCH-001)

Append-only. Кожна зміна правил (`AGENTS.md`, `orchestratie/beleid.json`) = новий запис тут + підвищення `regelsVersie` + `node scripts/orch.mjs vergrendel`.
Alleen toevoegen. Elke wijziging van de regels = nieuw besluit hier + hogere `regelsVersie` + `vergrendel`.

Формат · vorm: `## B-NNN · РРРР-ММ-ДД · regelsVersie · статус` → Контекст / Рішення / Наслідки / Хто.
Статуси: `voorstel` (запропоновано агентом), `bevestigd` (підтверджено власником), `vervangen` (замінено B-…), `ingetrokken`.

---

## B-001 · 2026-10-31 · 1.0.0 · voorstel

**Контекст.** Над Mijn Ruimte паралельно працюють Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor. Правила були розсипані по
`deploy/ПРАВИЛА-ПАКЕТА-РОЗГОРТАННЯ.md`, `RUNBOOK-*.md`, спільній теці знань і чатах; кожен агент мав власне уявлення про базу коду.

**Рішення.** Єдине джерело правил — `AGENTS.md` (людиною) + `orchestratie/beleid.json` (машиною) + цей реєстр. `CLAUDE.md`, `GEMINI.md` та інші файли
середовищ — лише перехідники ≤ 25 рядків із маркером `<!-- orch-adapter -->`. Відбиток правил фіксується в `orchestratie/regels.lock.json`;
`node scripts/orch.mjs controleer` падає, якщо правила змінено без підвищення версії.

**Наслідки.** Старі документи лишаються як довідка (операційні інструкції, REGELS-UITROLPAKKET); де вони суперечать AGENTS.md — чинний AGENTS.md.

**Хто.** Запропоновано агентом `claude` (ORCH-001, гілка `feature/orch-001-20261031-112355`). Потребує підтвердження власника.

## B-002 · 2026-10-31 · 1.0.0 · voorstel

**Контекст.** Остання заявлена встановлена версія `20261031-093842`, BRON-COMMIT `b279ccabe31a27139b337822162653ccc13b6a5a`
(гілка `release/sec-001-20261031-084138`, автор фіксації змін Antigravity). Гілка `voornaamst` (default) містить лише README і є предком цього фіксації змін.

**Рішення.** Базою для всіх нових задач є `b279ccab…`, доки власник не підтвердить іншу. Статус бази — `opgave_eigenaar`
(заявлено власником): агент не мав мережевого доступу до `hub.tarasevych.com/api/version`, звірку з production не виконано.
`voornaamst` не вважається актуальною базою коду.

**Наслідки.** Після незалежної звірки (власник або агент із доступом до сайту/встановлювача): `basis.verificatie = geverifieerd_productie`,
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
накласти на нову гілку від базової фіксації змін у тимчасовому worktree → виявити зміни → `git merge-tree` проти `integratie` → тести з
`beleid.json → inlevering.standaardTests` → запис `orchestratie/inleveringen/<id>.json` → черга. Відхилена передача не лишає гілки й не торкається
`integratie`. Черга послідовна (`wachtrij volgende|klaar|terugtrekken`, одна задача `bezig`). Статус `installed` виводиться лише з
`orchestratie/geinstalleerd.json` (пише встановлювач/власник), `integrated` — з факту злиття, `released` — з факту пакета.

**Наслідки.** `regelsVersie` 1.0.0 → 1.1.0 (додано `inlevering.standaardTests`, `werkruimte`, `geinstalleerd`); задачі з `regelsVersie 1.0.0` мають
перечитати правила (`versheid` → `REGELS_VEROUDERD`).

**Хто.** Агент `claude`. Потребує підтвердження власника.

## B-005 · 2026-10-31 · 1.2.0 · voorstel

**Контекст.** Етап 2 ORCH-001: випуск мав бути один для всіх агентів, а встановлювач перевіряв лише дату версії — пакет, зібраний на застарілій базі
або з іншими правилами, встановлювався, якщо його версія була новішою.

**Рішення.**
1. У пакеті `mijn-ruimte-<versie>.tar.gz` з'є `UITROL-BASIS` (встановлена версія + commit + відбиток правил). Root-встановлювач звіряє його з
   `$WERK_ROOT/laatste-versie` і `laatste-commit` (`BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`), з `20261201-000000` — обов'язково
   (`GEEN_BASIS`). Якщо в пакеті є `orchestratie/regels.lock.json`, відбиток правил і `regelsVersie` мають збігатися (`REGELS_NIET_VERGRENDELD`),
   а режим встановлення — бути дозволеним у `kritiek.installatieModi` (`MODUS_NIET_TOEGESTAAN`). GitOps (`gitops-ophalen.sh`, автоматично) працює лише
   за `automatisch_beperkt` **і** підписаним власником lock.
2. Єдиний пакет передачі `mijn-ruimte-<versie>-<agent>-overdracht.zip` збирає `node scripts/orch.mjs pakket` (через `maak-voorstelpakket.sh`, без
   дублювання): архів, SHA-256, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`, тести, `RAPPORT.md`, фіксації змін (`COMMITS.txt` + `commits.bundle`),
   агенти (`AGENTEN.json`), підпис `.sig` лише якщо власник підписав сам. Перевірка — `pakket-controleer`, імпорт без git — той самий `inleveren`.
3. Дві бази свідомо різні: `UITROL-BASIS`/`installatie` = **встановлена** (для встановлювача), `basisCommit` в `ORCH-OVERDRACHT.json` = **база гілки
   задачі** (від неї `inleveren` відтворює зміни й рахує фіксації змін).
4. Власний `orchestratie/taken/<taakId>.json` дозволено в передачі (агент реєструє задачу у своїй гілці — іншого шляху в нього немає); інший стан
   координації лишається захищеним. При злитті версія `integratie` перемагає (`.gitattributes` → `merge=orch-staat`, драйвер задає
   `orch wachtrij volgende`).
5. Режими встановлення без змін (`handmatig`, `na_bevestiging`; `automatisch_beperkt` — лише за окремою підписаною політикою); приватні ключі
   власника агентам не передаються.

**Наслідки.** `regelsVersie` 1.1.0 → 1.2.0 (`pakket`, `inlevering.eigenTaakBestandToegestaan`, статус `ter_integratie` у переліку); задачі з
1.1.0 перечитують правила. Нові коди в `shared/uitrol-codes.ts`.

**Хто.** Агент `claude`. Потребує підтвердження власника (критичні політики не змінено, підпис лишається «пропозицією»).

## B-006 · 2026-10-31 · 1.3.0 · voorstel

**Контекст.** Етап 3 ORCH-001: координацією можна було керувати лише з командного рядка (`scripts/orch.mjs`), а правила змінювати лише через
git і підпис SSH на ПК власника. Власник хоче бачити задачі, чергу й передачі на сайті, приймати пакети агентів без SSH і змінювати правила з
тією самою певністю, що й затвердження оновлень (passkey, §13/§15 ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ).

**Рішення.**
1. Сайт (`mcp.tarasevych.com/agents` → «Координація»), HTTP (`/api/owner/orch/*`, лише власник) і MCP (`orch_overzicht`, `orch_context`,
   `orch_taak_start`, `orch_inleveren_begin|stuk|klaar`) **не мають власної логіки**: вони викликають ті самі функції, що й CLI — `inleveren`,
   `beoordeelVoorstel`, `vergrendel`, `compacteContext`. Робоча копія координації на сервері — `ORCH_WORTEL` (`/srv/mijn-ruimte/orch-repo`),
   завантаження — `ORCH_INBOX`, фрагментами по 512 КіБ зі звіркою SHA-256; записи передач і черга — ті самі файли `orchestratie/*`.
2. Зміна правил власником: редагування `AGENTS.md` / `beleid.json` / `BESLUITEN.md` на сайті → перевірка пропозиції (`regelsVersie` вища,
   запис `## B-xxx · … · <versie> · …` у `BESLUITEN.md`, `beleid.json` дійсний, інші файли правил не змінилися) → рішення passkey нового
   виду **`orch-regels`** (той самий канал, що `terugdraaien`/`externe-hosts`; вимикач `orch-regels-passkey` у `/etc/mijn-ruimte/mcp-rechten.json`,
   типово відкритий) → **root нічого не виконує**: він дописує підтвердження (`regelsVersie`, `hash`, `kritiekHash`, `voorstel`, `passkey`,
   `besluit`) у власний журнал `/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl` (0600) і переписує читабельну копію
   `/var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json` (0640, останні 50) → застосунок, побачивши підтвердження, створює гілку
   `regels/<versie>-<час>` з новим `regels.lock.json` (`eigenaar.soort = "passkey"`, `besluit`, `passkey`), `CONTEXT-COMPACT.md`, виконує
   `controleer` (при помилці все відкидається) і надсилає гілку в `origin`. Злиття в `integratie` лишається за власником.
3. Lock із `eigenaar.soort = "passkey"` рівноцінний підписові SSH для `eigenaarStatus`/`controleer`. GitOps (`gitops-ophalen.sh`, root) довіряє
   такому lock **лише** якщо той самий запис (`besluit`, `regelsVersie`, `hash`, `kritiekHash`, `voorstel`) є в root-журналі — застосунок не може
   сам «підтвердити» правила. Підпис SSH лишається повноцінною альтернативою (`orch onderteken-bericht` / `bevestig`).
4. Встановлювач створює `orch-inbox` і повідомляє, чи є робоча копія координації; саму копію (`git clone` з deploy-ключем) робить власник
   (ІНСТРУКЦІЯ-БЕЗПЕЧНОГО-РОЗГОРТАННЯ §18). Без неї сайт чесно показує `ORCH_GEEN_REPO`, нічого не емулюючи.

**Наслідки.** `regelsVersie` 1.2.0 → 1.3.0 (розділ `site`; `kritiek.toelichting` згадує passkey як другий шлях підтвердження — через це
змінився `kritiekHash`, самі критичні політики без змін); задачі з 1.2.0 перечитують правила. Новий код події `BESLUIT_ORCH_REGELS_OK`,
коди `ORCH_CODES` у `shared/orch-model.ts`, довідка `orch.inlevering` / `orch.regels`.

**Хто.** Агент `claude`. Потребує підтвердження власника — відтепер це можна зробити passkey на сайті або підписом SSH.

## B-007 · 2026-11-03 · 1.4.0 · voorstel

**Контекст.** Власник вимагає для кожного наступного випуску постійний, відтворюваний журнал обробки запиту та перевірку, що повний код і точний встановлювальний архів справді опубліковані на GitHub. Попередні випуски містили commit, але не доводили наявності незмінного документа рішень і саме того tar.gz у GitHub Release.

**Рішення.** Від `20261103-211555` кожен пакет має `ONTWIKKELARCHIEF.json` з `taakId`, `repo`, `tak`, 40-символьним `commit` (= `BRON-COMMIT`), `pad` на зафіксований журнал `orchestratie/ontwikkelarchieven/<TASK-ID>.json`, його SHA-256, канонічною URL до GitHub blob, URL GitHub Release за `UITROL-VERSIE` і назвою `.tar.gz`. Обов'язковий журнал має запит, часову послідовність, рішення та компроміси, зміни, тести, посилання на першоджерела/вкладення, відомі проблеми, причини та виняток. Штатний `orch pakket` перевіряє, що журнал уже в HEAD і не підмінений локально, та вписує посилання в tar. Site voorcontrole та root незалежно запитують лише фіксований GitHub API (`Tarasevych/hub`), перевіряють вміст документа і хеш, належність commit гілці, наявність GitHub Release і `asset.digest` SHA-256 ідентичного завантаженого tar.gz. Будь-яка невідповідність, відсутність або мережевий збій — fail closed. Без завершеної GitHub публікації встановити пакет не можна.

**Захист даних.** Не вносити секрети, приватні файли, вміст листів, необмежені журнали, сирі credentials та приховану chain-of-thought ШІ. Фіксувати доступні кроки й **стислі перевірювані обґрунтування** рішень, посилання/хеші артефактів, явні прогалини. Неможливість автоматично відновити внутрішню історію моделі треба позначати, а не вигадувати. Бінарний tar зберігається як GitHub Release asset, повний код — у фіксації змін у git; через циклічність хешів сам tar не додається до власного джерельного commit.

**Наслідки.** `regelsVersie` 1.3.0 → 1.4.0, нові коди відхилення `ONTWIKKELARCHIEF_*`, розширені правила `pakket`, `AGENTS.md` і операційна інструкція. Root та сайт повинні бути встановлені у складі цього випуску, політика проходить `vergrendel`; статус до незалежного Passkey/SSH-затвердження — пропозиція. Жодне минуле встановлення не змінюється; власник підтверджує правило й встановленню окремо.

**Хто.** Вимога Власника від 03.11.2026, реалізація агентом ChatGPT/Codex у задачі TRACE-001. Очікує passkey/SSH-підтвердження власника для чинності критичних правил.

## B-008 · 2026-11-03 · 1.4.1 · technische correctie op B-007

**Контекст.** Перший CI TRACE-001 згенерував `CONTEXT-COMPACT.md` обсягом 13 834 байти при дозволених 12 000 (`CONTEXT_TE_GROOT`). Просте редагування `AGENTS.md` за наявного lock 1.4.0 було коректно відхилено як `VERSIE_NIET_VERHOOGD`.

**Рішення.** Перенести детальні норми випуску і TRACE-001 поза межі маркерів `compact` у **тому самому канонічному AGENTS.md**, залишивши в компактному блоці коротке, однозначне й обов'язкове правило з посиланнями. Жодну вимогу не вилучено і не послаблено; встановлювальні перевірки незмінні. Дотримуючись процедури змін правил, підвищити `regelsVersie` із 1.4.0 до **1.4.1**, повторити штатні `orch vergrendel`, `orch context`, `orch taak-herlees`, тестування та передавання. Залишити реєстрацію B-007 незмінною.

**Хто.** Агент ChatGPT/Codex. Технічна корекція для відтворюваного компактного контексту; формальне підтвердження змін правил лишається за власником.

## B-009 · 2026-11-04 · 1.4.2 · voorstel

**Контекст.**
1. 01.11.2026 сервер `<VM-IP>` та інструменти на робочому ПК власника оновлено до найновіших основних серій (`Ubuntu 26.04.1 LTS`, `PostgreSQL 18.6`, `Node.js 26.13.0 LTS`, `Caddy 2.11.7`, `OPA 1.22.0`, `age 1.3.2`).
2. Після переходу на `Ubuntu 26.04.1 LTS` (`systemd 259.9`, `glibc 2.43`, `GNU tar 1.35`) попередня перевірка пакета (`voorcontrole`) на сайті почала відхиляти коректні архіви `.tar.gz` на кроці `tar --extract` (`VOORCONTROLE_MISLUKT`). Трасуванням (`strace` всередині `mijn-ruimte.service`) встановлено точну причину: `GNU tar 1.35` використовує системний виклик `openat2(..., RESOLVE_BENEATH)`, який seccomp-фільтр `RestrictSUIDSGID=yes` у `systemd 259` блокує з `-ENOSYS` (`Function not implemented`).
3. Хмарний агент (ChatGPT), не маючи доступу до сервера і бачачи обрізаний рядок `Command failed: /usr/bin/tar --extract ...`, помилково припустив, що власник завантажив `.zip` замість `.tar.gz`, а потім попросив власника вручну виконувати `df -h` та шукати журнали в терміналі. Також з'ясувалося, що гілка `voornaamst` на GitHub відставала від `integratie`, а `/srv/mijn-ruimte/orch-repo` на сервері не був синхронізований із останніми правилами.

**Рішення.**
1. **Зафіксувати оновлений стек production ВМ `<VM-IP>` у правилах (`AGENTS.md` §1, §5):**
   - ОС: `Ubuntu 26.04.1 LTS (Resolute)`, ядро `7.0.0-42-generic`, `glibc 2.43`, `systemd 259.9`, LUKS + `clevis-tpm2`.
   - Середовище та сервіси: `Node.js v26.13.0 LTS` (`npm 11.20.0`), `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` із `--data-checksums`), `Caddy v2.11.7` (гніздо з'єднання `admin unix//run/caddy/admin.sock|0660` для групи `caddy`/`mr-apps`), `OPA v1.22.0`, `age v1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2` (`containerd 2.4.2`).
   - Інструменти ПК власника (`T:\mijn-ruimte\hulpmiddelen\`): `Node.js v26.13.0 LTS`, `PostgreSQL 18.6-5`, `rclone v1.75.2`.
2. **Усунути блокування `openat2` у `systemd 259` (`RestrictSUIDSGID=no`):**
   - На сервері `<VM-IP>` розгорнуто постійні drop-in файли `/etc/systemd/system/<unit>.d/ubuntu2604-openat2.conf` із `RestrictSUIDSGID=no` для всіх 9 сервісів `mijn-ruimte*` та `cloudflared.service`.
   - У всіх unit-файлах `deploy/*.service` у репозиторії змінено `RestrictSUIDSGID=yes/true` на `RestrictSUIDSGID=no` (при збереженні `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`).
3. **Запровадити обов'язкові правила діагностики й передачі результатів для всіх агентів (`AGENTS.md` §3, §4):**
   - Жоден агент не просить власника вручну виконувати команди в терміналі сервера (`df -h`, `journalctl` тощо) або вручну збирати пакети. Якщо агент у хмарному контейнері не має прямого доступу до `<VM-IP>` (через MCP або SSH), він формулює стислий технічний висновок (1–2 речення) для передачі інфраструктурному агенту на ПК власника (Antigravity/Claude).
   - Заборонено вгадувати навмання при помилках `voorcontrole` (зокрема припускати завантаження `.zip` замість `.tar.gz`, коли крок `structuur` вже пройдено).
   - При передачі випуску для встановлення через `Admin → Оновлення` першим рядком завжди надається пряме посилання на `mijn-ruimte-<versie>.tar.gz` (окремо від `-overdracht.zip`).
4. **Синхронізувати всі канали правил:** оновити `origin/integratie`, `origin/voornaamst` та `/srv/mijn-ruimte/orch-repo` на `<VM-IP>` до `regelsVersie 1.4.2` (поточний встановлений на production випуск на момент синхронізації — `20261104-075953` @ `e97a58ceaf70f6a4a8d63608541d47e455ddb66a`).

**Наслідки.** `regelsVersie` 1.4.1 → 1.4.2; оновлено `AGENTS.md`, `orchestratie/beleid.json`, `orchestratie/BESLUITEN.md`, `orchestratie/regels.lock.json`, `orchestratie/CONTEXT-COMPACT.md` та `deploy/*.service`. Усі агенти (через GitHub `integratie`/`voornaamst`, MCP `orch_context`/`orch_overzicht` або `CONTEXT-COMPACT.md`) отримують актуальні правила 1.4.2.

**Хто.** Вимога власника Власника від 04.11.2026, реалізація агентом `antigravity`. Очікує passkey/SSH-підтвердження власника.

## B-010 · 2026-11-04 · 1.4.4 · privacy-correctie: persoonsgegevens uit publieke bronnen

**Контекст.** Власник виявив персональні дані (ім'я, e-mailadressen, телефонний номер, адреси сервера) у публічному репозиторії: у коді, тестах, CI, документації, журналах і правилах.

**Рішення.** (1) Персональні дані прибрано з коду й тестів; ім'я та контакт юридичних сторінок читаються із серверної конфігурації (`MR_EIGENAAR_NAAM`, `MR_CONTACT_EMAIL`). (2) Адреси сервера в документації й правилах замінено текстами-замінниками (`<VM-IP>`, `<beheersubnet>`). Beheersubnet voor de HA-beveiliging komt uit `MR_BEHEERSUBNET` (standaard 10.0.0.0/8, faalt dicht). (3) Adminscripts lezen het SSH-doel uit `MR_VM_SSH` of de SSH-alias `mijn-ruimte-vm`. (4) De geschiedenis van de repository is herschreven: persoonsgegevens vervangen door fictieve waarden. De mapping oud → nieuw wordt bewaard.

**Наслідки.** `regelsVersie` 1.4.2 → 1.4.4 (1.4.3 was een concept dat nooit is geïnstalleerd). De inhoud van de regels verandert niet; alleen plaatshouders en verwijzingen. Commit-SHA's veranderen door de herschrijving, `regels.lock.json` is opnieuw vergrendeld. Oude BRON-COMMIT-verwijzingen van eerdere pakketten wijzen naar SHA's die op GitHub niet meer bestaan; de mapping in de back-up koppelt ze aan de nieuwe.

**Хто.** Verzoek van de eigenaar (privacy); uitvoering door agent Claude. Wacht op passkey-bevestiging van de eigenaar.

**Vervolg 1.4.5.** Na het herschrijven van de geschiedenis verwees asis.bronCommit naar een SHA die niet meer bestaat. Bijgewerkt naar de nieuwe SHA uit de mapping oud → nieuw (back-up). Geen inhoudelijke regelwijziging. Wacht op bevestiging van de eigenaar of de productiebasis klopt.

## B-011 · 2026-11-04 · 1.4.6 · pakketcorrectie na tweede herschrijving van de historie

**Контекст.** Власник погодив повторне переписування історії: IP-адреси `10.77.0.x` і залишки персональних даних (ім'я в кирилиці, persoonlijke e-mailadressen, een geboortedatum in een testfixture) verwijderd uit oude commits. De voorcontrole van het pakket op de site meldde: syntaxisfouten in shellscripts (CRLF door `core.autocrlf=true` bij `git archive`), SHA-256 van het journaal wijkt af van de commit, een AWS-voorbeeldsleutel in testcode, en geen TESTRESULTATEN.

**Рішення.** (1) `maak-voorstelpakket.sh` gebruikt `git -c core.autocrlf=false archive`; `.gitattributes` bevat `*.sh text eol=lf`. (2) De AWS-voorbeeldsleutel uit de SigV4-test staat niet meer als één literal. (3) Basis in `beleid.json` → `5a023b41…` (oud `0614c8bf…`, mapping in de back-up). (4) Herkomst-SHA in het journaal PRIVACY-001 bijgewerkt. (5) ONTWIKKELARCHIEF wordt berekend op de blob-hash van het journaal in de nieuwe commit.

**Наслідки.** `regelsVersie` 1.4.5 → 1.4.6. Commit-SHA's veranderen opnieuw. Pakketten van vóór deze versie (20261104-171525) verwijzen naar SHA's die niet meer bestaan en vervallen. Voor de release is een nieuwe GitHub Release-asset nodig.

**Хто.** Verzoek van de eigenaar; uitvoering door agent Claude (Haiku 5.5). Wacht op passkey-bevestiging van de eigenaar.

## B-012 · 2026-11-05 · 1.4.7 · базова версія сервера після злиття identity-документів

**Контекст.** Сервер працює на версії `20261104-164906`. Її фіксація змін у попередній історії — `b0d41b77…`; після переписування (B-010, B-011) той самий стан має SHA `50e63737…`, а тег `20261104-164906` на GitHub вказує на `50e63737`. Базу в `beleid.json` (`20261031-093842` @ `5a023b41…`) було застаріло: встановлювач відхилив би пакет з `BASIS_VEROUDERD`. Гілка identity-account (`50e63737…`) додає лише документацію та журнал IDENTITY-001: 8 нових файлів, код не змінено.

**Рішення.** (1) `50e63737…` злито в `release/persoonsgegevens-20261104-164147` (фіксація злиття `cef3f7c`, без конфліктів, лише нові файли). (2) Базу в `beleid.json` → `20261104-164906` @ `50e63737…`; `regelsVersie` 1.4.6 → 1.4.7. (3) Перед встановленням власник ставить `laatste-commit` на сервері на `50e63737…`; без цього встановлювач відхилить пакет з `BASIS_COMMIT_VERSCHILT`. (4) Пакет 1.4.6 (`20261104-201630`) не публікується: його база — стара версія `20261031-093842`.

**Наслідки.** SHA гілки випуску змінюється через злиття. Пакети `20261104-171525` і `20261104-201630` не придатні для встановлення. Базу `5a023b41…` збережено в історії, але вона більше не є базою. Для встановлення потрібні нова GitHub Release і новий пакет.

**Хто.** Рішення власника (план B, 05.11.2026); виконання — агент Claude (Haiku 5.5). Очікується від власника: `laatste-commit` на сервері та GitHub Release для нового пакета.

## B-013 · 2026-11-05 · 1.4.8 · Консолідація аудиту 2026-11-05, двомовної документації та паралельних гілок (PRIVACY-001, MAILFIT-002, IDENTITY-002, DESIGN-001)

**Контекст.** Після другого переписування історії (`B-011`) та додавання двомовних навігаційних шапок (`uk`/`nl`) на гілці `voornaamst` (`f3f3fabb2f3b`) виникло розщеплення між чотирма паралельними гілками агентів (`PRIVACY-001` @ `d4fb253`, `MAILFIT-002` @ `98beb2a`, `IDENTITY-002` @ `a318ba0`, `DESIGN-001` @ `052fae3`) та порушення криптографічного замка правил (`REGELS_NIET_VERGRENDELD` у `node scripts/orch.mjs controleer`). Незалежна звірка живого кінцевій точці робочого середовища `https://hub.tarasevych.com/api/version` підтвердила активну версію `20261104-204906` (у допереписній історії commit `6e815a00307dd9c00a0b2907838be099be8c5610`).

**Рішення.** (1) Безконфліктно об'єднати в рамках задачі `AUDIT-001` на канонічній післяпереписній історії (`voornaamst` @ `f3f3fabb2f3b5209b1ee8eba3078e403de831844`) усі чотири активні напрями без втягування допереписного предка `e547381`: `PRIVACY-001` (`MR_EIGENAAR_NAAM`, `MR_CONTACT_EMAIL`, `MR_BEHEERSUBNET`, `git -c core.autocrlf=false archive`), `MAILFIX-001`/`MAILFIT-001`/`MAILFIT-002` (адаптивний `MailOrbitIntro`, мобільні відступи, коди причин помилок Gmail OAuth), `IDENTITY-001/002` (12-секційна сторінка облікового запису включно з виправленнями аудиту 05.11.2026 `cbeb3d0` — центрована камера 22px та кошик 24px — і `a318ba0` — `.ia-dialoog-achtergrond` `z-index: 99500`, `.ia-toc` `top: 70px/62px`, `.ia-sectie` `scroll-margin-top: 170px/150px`) та `DESIGN-001` (`src/ontwerp/modern.css`, радіуси `--straal-s/m/l/xl` = `10px/14px/20px/26px`). (2) Зафіксувати в `orchestratie/beleid.json → basis` версію `20261104-204906` (`verificatie: "geverifieerd_productie"`, канонічний післяпереписний базовий фіксація змін `f3f3fabb2f3b5209b1ee8eba3078e403de831844`), підвищити `regelsVersie` до `1.4.8` та перегенерувати `orchestratie/regels.lock.json` і `orchestratie/CONTEXT-COMPACT.md`. (3) Синхронізувати українські (`.uk.md`) та нідерландські (`.nl.md`) версії всієї документації та оновити гілки `integratie` і `voornaamst` разом із GitHub Release.
Consolidatie van audit 2026-11-05 (`AUDIT-001`), tweetalige documentatie (`uk`/`nl`) en de vier parallelle takken (`PRIVACY-001`, `MAILFIT-002`, `IDENTITY-002`, `DESIGN-001`) op de canonieke post-rewrite geschiedenis (`voornaamst` @ `f3f3fabb2f3b`) met `regelsVersie 1.4.8`, hervergrendelde `regels.lock.json` en bijgewerkte `CONTEXT-COMPACT.md`.

**Наслідки.** `regelsVersie` 1.4.7 → 1.4.8; `node scripts/orch.mjs controleer` проходить без помилок і попереджень; гілки `integratie` та `voornaamst` отримують усі виправлення аудиту 2026-11-05 та повні досьє `TRACE-001`.

**Хто.** Запит власника від 05.11.2026 (`AUDIT-001`); виконання — агент `antigravity`.

## B-014 · 2026-11-05 · 1.4.9 · Перенесення бази випуску AUDIT-001 на встановлену серверну версію 20261105-061659 (a318ba0b1c73)

**Контекст.** Під час встановлення пакета `20261105-080000` на сервері вже було встановлено новішу версію `20261105-061659` (`BRON-COMMIT: a318ba0b1c731390217458dabadcf0e086d13635`, `IDENTITY-002`), через що перевірка `UITROL-BASIS` відхилила пакет `20261105-080000` із кодом `BASIS_VEROUDERD` (оскільки він був зібраний із `UITROL-BASIS: versie=20261104-204906`). Усі зміни коду з `20261105-061659` (`a318ba0b1c731390217458dabadcf0e086d13635`) вже повністю інтегровані у гілку `AUDIT-001` (`integratie` / `voornaamst`).

**Рішення.** (1) Оновити в `orchestratie/beleid.json → basis.versie` та `AGENTS.md` встановлену серверну версію до `20261105-061659` (фактичний серверний фіксація змін `a318ba0b1c731390217458dabadcf0e086d13635`, канонічна післяпереписна база `f3f3fabb2f3b5209b1ee8eba3078e403de831844`). (2) Підвищити `regelsVersie` з `1.4.8` до `1.4.9`, перепідписати `orchestratie/regels.lock.json` та перегенерувати `orchestratie/CONTEXT-COMPACT.md`. (3) Перезібрати та опублікувати оновлений випуск `20261105-093500` на базі `20261105-061659` @ `a318ba0b1c731390217458dabadcf0e086d13635`.
Herbouwen van release `AUDIT-001` (`20261105-093500`) bovenop de op de server geïnstalleerde versie `20261105-061659` (`a318ba0b1c731390217458dabadcf0e086d13635`) met `regelsVersie 1.4.9`.

**Наслідки.** `regelsVersie` 1.4.8 → 1.4.9; новий пакет `20261105-093500` містить `UITROL-BASIS: versie=20261105-061659, commit=a318ba0b1c731390217458dabadcf0e086d13635` і проходить перевірку `voorcontrole` та `mijn-ruimte-uitrol.sh` на сервері без помилки `BASIS_VEROUDERD`.

**Хто.** Запит власника від 05.11.2026 (`AUDIT-001`); виконання — агент `antigravity`.

## B-015 · 2026-11-06 · 1.4.10 · Повне мовне очищення вихідного коду, каталогів пошуку та двомовної документації (uk + nl)

**Контекст.** Під час ревізії PR #30 та всіх активних гілок виявлено залишки російських та англійських пошукових фраз у `backend/zoek/catalogus-ui.ts`, `shared/zoek-synoniemen.ts`, `shared/zoek-normalisatie.ts`, а також суржикові кальки у компонентах `src/`, `backend/`, `shared/`, `deploy/` та тестах.

**Рішення.** Вилучити всі російські літери, російські слова, суржик та англійські пошукові інтенції з усіх файлів коду, тестів та документації у всіх активних гілках репозиторію; перегенерувати `shared/zoek-ui-knoppen.generated.ts`, підвищити `regelsVersie` до `1.4.10`, оновити `orchestratie/regels.lock.json` та `orchestratie/CONTEXT-COMPACT.md`.

**Наслідки.** `regelsVersie` 1.4.9 → 1.4.10; 0 збігів російського алфавіту та суржику в усьому репозиторії.

**Хто.** Запит власника від 06.11.2026 (`AUDIT-001`); виконання — агент `antigravity`.

## B-016 · 2026-11-06 · 1.4.11 · Повне очищення всіх опублікованих статей і документації від русизмів, кальок та тех-сленгу

**Контекст.** У статтях документації залишалися глибші морфологічні кальки та тех-сленг, які не виявлялися простим ASCII-пошуком за границями слів `\b` у JS.

**Рішення.** Замінити всі російські кальки, суржикові звороти та сленгові форми в усіх опублікованих статтях репозиторію (`*.md`, `*.uk.md`, `*.txt`) на автентичні українські відповідники (*під'єднання*, *вимкнення*, *встановлення*, *середовище*, *складання*, *повернення попереднього стану*, *резервна копія*, *обліковий запис*, *піктограма*, *обладнання*, *прямий доступ root*, *надсилання*, *відмальовування*, *розбір*, *кінцева точка*, *панель керування*, *блок інтерфейсу*, *натискання*, *знімок екрана*); підвищити `regelsVersie` до `1.4.11`, перегенерувати `orchestratie/regels.lock.json` та `orchestratie/CONTEXT-COMPACT.md`.

**Наслідки.** `regelsVersie` 1.4.10 → 1.4.11; 0 збігів русизмів, кальок чи сленгу в усіх статтях документації.

**Хто.** Запит власника від 06.11.2026 (`AUDIT-001`); виконання — агент `antigravity`.

## B-017 · 2026-11-06 · 1.4.12 · voorstel

**Контекст.** Власник надав одноразовий дозвіл на повне перейменування всіх назв файлів статей документації, каталогів і гілок у всіх сховищах облікового запису `Tarasevych` (включно з `Tarasevych/hub`), щоб жодна назва української статті, розділу чи текст не містили англіцизмів, латинської транслітерації, технічного жаргону, русизмів, кальок чи суржику.

**Рішення.** (1) Перейменувати всі українські статті документації (`.md` та `.uk.md`) на автентичні українські кириличні назви без латиниці та жаргону, а всі нідерландські статті (`.nl.md`) — на чисті нідерландські назви, замінивши також англомовні назви підкаталогів (`docs/controlepunten`, `docs/wolk`, `docs/contracten`, `docs/identiteit`, `docs/post`, `docs/fout002`, `docs/bijlage-weergave-v2`, `docs/post-zoeken-v2`, `docs/ontwerp/identiteit-account`). (2) Очистити тексти всіх статей, правил (`AGENTS.md`, `orchestratie/BESLUITEN.md`, `orchestratie/beleid.json`) і перехресних посилань від залишків технічного сленгу, англіцизмів, кальок та русизмів, оновити шляхи в одиничних випробуваннях і перевірниках, підвищити `regelsVersie` до `1.4.12`, оновити `orchestratie/regels.lock.json` та `orchestratie/CONTEXT-COMPACT.md`.

**Наслідки.** `regelsVersie` 1.4.11 → 1.4.12; уся документація у `Tarasevych/hub` та супутніх сховищах має виключно чисті українські (`.md`/`.uk.md`) та нідерландські (`.nl.md`) назви файлів і вичищений зміст зі збереженням двомовних перемикачів.

**Хто.** Запит власника від 06.11.2026 (`AUDIT-001`); виконання — агент `antigravity`.

## B-018 · 2026-11-06 · 1.4.13 · voorstel
- **Зачеплено:** `orchestratie/BESLUITEN.md`, `CLAUDE.md`, `.github/copilot-instructions.md`
- **Причина:** Остаточне очищення відмінюваних форм технічних термінів у супровідній документації та журналі рішень.
- **Суть:** Усі відмінювані форми запозичених технічних слів замінено на питомі українські відповідники.
