> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./ORCHESTRATIE-EN-UITROL.md)) · [🇳🇱 **Nederlandse versie**](./ORCHESTRATIE-EN-UITROL.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../INDEX.md)
> 🧭 **Розділи Хабу (`docs/hub/`):** [1. Архітектура](./ARCHITECTUUR.uk.md) · [2. Історія](./GESCHIEDENIS.uk.md) · [3. Гілки, PR та Випуски](./TAKKEN-EN-PRS.uk.md) · [4. Структура коду](./MAP-STRUCTUUR.uk.md) · [5. Змінні оточення](./OMGEVINGSVARIABELEN.uk.md) · [6. Оркестрація та Розгортання](./ORCHESTRATIE-EN-UITROL.uk.md)

# Оркестрація ШІ-Агентів (`ORCH-001`), Трасування (`TRACE-001`), Серверний Стек (`B-009`) та Атомарне Розгортання

Цей документ описує повний життєвий цикл розробки, перевірки, координації 8 ШІ-агентів та безпечного розгортання оновлень на production ВМ платформи «Мій простір / Mijn Ruimte».

---

## 1. Мультиагентна оркестрація `ORCH-001` (`B-001`–`B-006`)

Над репозиторієм `Tarasevych/hub` паралельно працюють **8 ШІ-агентів**: **Claude**, **Antigravity**, **ChatGPT**, **Codex**, **Grok**, **GitHub Copilot**, **Gemini** та **Cursor**. Щоб унеможливити перезапис чужої роботи, втрату комітів або розбіжність інструкцій, діє єдиний протокол **`ORCH-001`**:

### 1.1. Єдине джерело правил та криптографічний замок
1. **Канонічні файли правил:**
   - [`AGENTS.md`](../../AGENTS.md) ([🇺🇦 UK](../../AGENTS.uk.md) ↔ [🇳🇱 NL](../../AGENTS.nl.md)) — людиночитані правила для всіх агентів і розробників.
   - [`orchestratie/beleid.json`](../../orchestratie/beleid.json) — машинна політика (перелік агентів, каналів передачі, захищених гілок та обов'язкових перевірок).
   - [`orchestratie/BESLUITEN.md`](../../orchestratie/BESLUITEN.md) ([🇺🇦 UK](../../orchestratie/BESLUITEN.uk.md) ↔ [🇳🇱 NL](../../orchestratie/BESLUITEN.nl.md)) — append-only реєстр архітектурних і організаційних рішень (`B-001`..`B-011`).
2. **Тонкі адаптери (≤ 25 рядків):** файли `CLAUDE.md`, `ANTIGRAVITY.md`, `GEMINI.md`, `CODEX.md`, `CHATGPT.md`, `GROK.md`, `.cursorrules`, `.github/copilot-instructions.md` містять маркер `<!-- orch-adapter -->` і лише посилаються на `AGENTS.md`.
3. **Криптографічний відбиток [`orchestratie/regels.lock.json`](../../orchestratie/regels.lock.json):** фіксує SHA-256 усіх трьох канонічних файлів правил і підписується особистим ключем власника (`SSH ed25519` або `WebAuthn Passkey`). Агентам заборонено змінювати файли правил без доручення власника.

### 1.2. Ізоляція задач та 8 каналів здачі роботи
- Кожна задача отримує унікальний ідентифікатор (`ABC-001`), окрему гілку `feature|fix|audit|release/<тема>-YYYYMMDD-HHMMSS` та файл декларації `orchestratie/taken/<TASK-ID>.json`.
- Агенти ніколи не пишуть напряму у `voornaamst`, `integratie`, `release/*` або чужі гілки.
- Підтримуються **8 каналів здачі результатів**, які сходяться в єдину команду `node scripts/orch.mjs inleveren`:
  1. `git-pr` (гілка або Pull Запит на GitHub)
  2. `tar.gz` (інсталяційний пакет `mijn-ruimte-<versie>.tar.gz`)
  3. `overdracht-zip` (універсальний архів `mijn-ruimte-<versie>-<agent>-overdracht.zip` з патчем, бандлом і звітом)
  4. `git-bundle` (`.bundle`)
  5. `git-patch` (`git format-patch` / `.patch`)
  6. `werkmap` (локальна робоча директорія на сервері або ВМ)
  7. `http-upload` (завантаження через веб-інтерфейс `Admin → ШІ-агенти → Координація`)
  8. `mcp` (виклик MCP-інструментів `orch_*` через конектор `/claude`, `/gpt` тощо)

---

## 2. Трасування походження випусків `TRACE-001` (`B-007` / `B-008`)

За стандартом **TRACE-001** (правила `1.4.1`), жоден пакет не може бути встановлений на сервер без повної прив'язки до GitHub та незмінного журналу розробки:

1. **Комічений журнал розробки:** у кожній гілці задачі зберігається файл `orchestratie/ontwikkelarchieven/<TASK-ID>.json`, а всередину архіву `.tar.gz` записується `ONTWIKKELARCHIEF.json` (хронологія кроків, змінені файли, виконані перевірки, рішення безпеки та блок `privacy`).
2. **Обов'язковий випуск на GitHub Releases:** кожен релізний архів `mijn-ruimte-<versie>.tar.gz` та його `.sha256` публікуються у GitHub Releases репозиторію `Tarasevych/hub`.
3. **Подвійна перевірка SHA-256 через GitHub API:**
   - На етапі **передконтролю (`voorcontrole`)** на сайті (`backend/uitrol-github.ts`) сервер перевіряє існування коміту в `Tarasevych/hub`, належність до дозволеної гілки та побітовий збіг SHA-256 локального `.tar.gz` із ассетом у GitHub Release.
   - На етапі **root-встановлення (`deploy/installeer-app.sh`)** інсталятор повторно перевіряє `ONTWIKKELARCHIEF.json` та звіряє SHA-256 напряму з GitHub API перед розпакуванням.

---

## 3. Інфраструктура та Серверний Стек (`B-009` від 04.11.2026)

### 3.1. Поточний стек production ВМ

| Компонент | Версія та конфігурація |
|---|---|
| **Операційна система** | `Ubuntu 26.04.1 LTS (Resolute)` · ядро `Linux 7.0.0-42-generic` · `glibc 2.43` · `systemd 259.9` · шифрування диска LUKS + `clevis-tpm2` (vTPM) |
| **Середовище виконання** | `Node.js v26.13.0 LTS` (`npm 11.20.0`) |
| **База даних** | `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` з увімкненим `--data-checksums`) |
| **Мережа та шлюзи** | `Cloudflare Tunnel (cloudflared 2026.10.7)` · `Caddy v2.11.7` (`admin unix//run/caddy/admin.sock\|0660`) · `OPA v1.22.0` (`127.0.0.1:8181`) |
| **Контейнери та криптографія** | `Docker 29.9.2` (`containerd 2.4.2`) · `age v1.3.2` (асиметричне шифрування бекапів) |
| **Сумісність `systemd 259` + `GNU tar 1.35`** | У `Ubuntu 26.04.1 LTS` `tar --extract` викликає системний виклик `openat2(..., RESOLVE_BENEATH)`. Щоб seccomp-фільтр `systemd 259` не блокував його з помилкою `-ENOSYS`, у всіх `deploy/*.service` та серверних drop-in встановлено `RestrictSUIDSGID=no` (при збереженні `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`). |

### 3.2. Фонові завдання (`cron.json` та systemd-таймери)

Усі періодичні задачі виконуються ізольованими `Type=oneshot` юнітами `mijn-ruimte-cron@<назва>.service` під захистом `pg_advisory_lock`:

| Завдання (`cron.json` / таймер) | Розклад | Функція |
|---|---|---|
| `mail-provider-maintenance` | `*/5 * * * *` (кожні 5 хв) | Синхронізація та обслуговування поштових скриньок (`mailMaintenanceCron`, `batchLimit: 3`). |
| `google-suite-bplus-sync` | `*/5 * * * *` (кожні 5 хв) | Фонова синхронізація Google Suite — пошта, календар, диск (`googleSuiteSyncCron`, `accountLimit: 10`). |
| `zoek-index` | `*/5 * * * *` (кожні 5 хв) | Індексація нових та змінених об'єктів у глобальний пошук `/zoek` (`zoekIndexCron`, `limiet: 60`). |
| `mail-queue-send` | `* * * * *` (щохвилини) | Відправлення листів із черги вихідної пошти (`mailQueueCron`). |
| `diagnostiek-server` | `*/15 * * * *` (кожні 15 хв) | Збір показників здоров'я сервера та перевірок безпеки (`diagnostiekServerCron`). |
| `opruimen` | `17 * * * *` (щогодини) | Очищення прострочених OAuth-станів, PKCE, сесій, handoff-кодів, лімітів та старих логів (`opruimCron`). |
| `mijn-ruimte-backup.timer` | Щодня о `03:30` | Дамп PostgreSQL (`pg_dump -Fc`) + архів `/srv/data/uploads`, зашифровані напряму через `age -R` публічним ключем (`/etc/mijn-ruimte/backup-ontvanger.age.pub`) у `/srv/backups/mijn-ruimte/<дата>/`. |

---

## 4. Атомарне розгортання пакетів (`mijn-ruimte-installeer`)

Оновлення платформи ніколи не відбувається шляхом редагування коду на льоту на продакшені. Кожне оновлення проходить строгий конвеєр:

1. **Збірка та верифікація пакета (`npm run build` + `orch.mjs pakket`):** створює `mijn-ruimte-<versie>.tar.gz` із `PAKKET-MANIFEST.json` та `ONTWIKKELARCHIEF.json`.
2. **Передконтроль (`voorcontrole`) та схвалення власником через Passkey:** у розділі `Admin → Оновлення` (в активному Технічному профілі) власник перевіряє склад пакета, міграції та GitHub Release, після чого підписує дозвіл на встановлення власним ключем доступу **WebAuthn Passkey**.
3. **Атомарне встановлення (`mijn-ruimte-installeer`):**
   - Розпаковує реліз у `/srv/mijn-ruimte/releases/<versie>/`.
   - Виконує SQL-міграції під роллю `mijnruimte_migrator` (`/etc/mijn-ruimte/migratie.env`) та застосовує `migrations/rechten.sql`.
   - Атомарно перемикає симлінк `/srv/mijn-ruimte/actief` на новий реліз і перезапускає `mijn-ruimte.service` та `mijn-ruimte-mcp-deur.service` (порт `8091`).
4. **Димова перевірка у реальному браузері (`rook-controle`):** запускає headless Chromium (`deploy/rook-controle.mjs`), перевіряючи `/api/health`, відсутність помилок у консолі та рендеринг усіх основних піддоменів. У разі збою інсталятор автоматично повертає симлінк `actief` на попередній справний випуск.

---

## 5. Основні команди розробки, перевірки та оркестрації

```bash
# 1. Локальний запуск та повна перевірка збірки
npm run dev                                          # Запуск Vite dev-сервера фронтенду
npm run build                                        # Повний конвеєр збірки:
                                                     #   kaart-controle → plaatsing-controle → hulp-vraagtekens-controle →
                                                     #   zoek-ui-catalogus → l002-audit → mail-slimme-inbox-audit →
                                                     #   kleur-contrast-controle → vite build → tech-bundels-controle →
                                                     #   bouw-extensie → build:server
npm run typecheck:server                             # Перевірка типів серверного коду (tsc -p tsconfig.server.json)

# 2. Запуск модульних та візуальних тестів
node scripts/eenheidstests.mjs                       # Усі модульні тести (або з фільтром, напр.: node scripts/eenheidstests.mjs orch)
node scripts/kaart-controle.mjs                      # Перевірка цілісності карти нідерландських назв файлів
node scripts/plaatsing-controle.mjs                  # Перевірка зон і гнізд рухомих кнопок та відсутності несанкціонованих position:fixed
node scripts/kleur-contrast-controle.mjs             # Перевірка контрастності кольорових палітр

# 3. Команди оркестрації ШІ-агентів (ORCH-001)
node scripts/orch.mjs controleer                     # Комплексна перевірка beleid.json, regels.lock.json, адаптерів, задач і черги
node scripts/orch.mjs status                         # Поточний статус усіх зареєстрованих задач (in_progress / integrated / released / installed)
node scripts/orch.mjs context                        # Генерація компактного контексту orchestratie/CONTEXT-COMPACT.md
node scripts/orch.mjs taak-start --id <TASK-ID> --agent <agent> --basis <sha40> --tak <branch>
node scripts/orch.mjs versheid --taak <TASK-ID> --fase start|overdracht
node scripts/orch.mjs pakket --taak <TASK-ID> --auteur "<Ім'я>"   # Збірка mijn-ruimte-<versie>.tar.gz + <versie>-<agent>-overdracht.zip
node scripts/orch.mjs pakket-controleer --bron uitvoer/mijn-ruimte-<versie>-<agent>-overdracht.zip
node scripts/orch.mjs inleveren --bron <zip|tar.gz|patch|тека|гілка>
node scripts/orch.mjs wachtrij toon|volgende|klaar|terugtrekken
```

---

## Пов'язана документація (🇺🇦 UK ↔ 🇳🇱 NL)

- **Правила агентів та реєстр рішень:** [🇺🇦 `AGENTS.uk.md`](../../AGENTS.uk.md) ↔ [🇳🇱 `AGENTS.nl.md`](../../AGENTS.nl.md) ([оригінал `AGENTS.md`](../../AGENTS.md)) · [🇺🇦 `orchestratie/BESLUITEN.uk.md`](../../orchestratie/BESLUITEN.uk.md) ↔ [🇳🇱 `orchestratie/BESLUITEN.nl.md`](../../orchestratie/BESLUITEN.nl.md)
- **Розгортання, пакети та відновлення:** [🇺🇦 `deploy/LEESMIJ.uk.md`](../../deploy/LEESMIJ.uk.md) ↔ [🇳🇱 `deploy/LEESMIJ.nl.md`](../../deploy/LEESMIJ.nl.md) · [🇺🇦 `deploy/REGELS-UITROLPAKKET.uk.md`](../../deploy/REGELS-UITROLPAKKET.uk.md) ↔ [🇳🇱 `deploy/REGELS-UITROLPAKKET.nl.md`](../../deploy/REGELS-UITROLPAKKET.nl.md) · [🇺🇦 `deploy/HERSTEL.uk.md`](../../deploy/HERSTEL.uk.md) ↔ [🇳🇱 `deploy/HERSTEL.nl.md`](../../deploy/HERSTEL.nl.md)
