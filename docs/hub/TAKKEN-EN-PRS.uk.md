> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./TAKKEN-EN-PRS.uk.md) · [🇳🇱 **Nederlandse versie**](./TAKKEN-EN-PRS.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../INDEX.md)
> 🧭 **Розділи Хабу (`docs/hub/`):** [1. Архітектура](./ARCHITECTUUR.uk.md) · [2. Історія](./GESCHIEDENIS.uk.md) · [3. Гілки, PR та Випуски](./TAKKEN-EN-PRS.uk.md) · [4. Структура коду](./MAP-STRUCTUUR.uk.md) · [5. Змінні середовища](./OMGEVINGSVARIABELEN.uk.md) · [6. Оркестрація та Розгортання](./ORCHESTRATIE-EN-UITROL.uk.md)

# Повний реєстр Гілок (71), Pull Requests (#1–#27) та Випусків (GitHub Releases)

У репозиторії `Tarasevych/hub` налічується **71 гілка**, **27 Pull Requests (`#1`–`#27`)** та **18+ офіційних GitHub Releases**. Цей документ містить повну класифікацію з прямими посиланнями на GitHub, щоб кожен розробник або ШІ-агент миттєво бачив канонічний стан, активні гілки-кандидати, злиті функціональні гілки та історичний архів.

> [!IMPORTANT]
> **Головне правило навігації по гілках:**
> 1. Поточний канонічний стан проєкту знаходиться у гілках **[`voornaamst`](https://github.com/Tarasevych/hub/tree/voornaamst)** та **[`integratie`](https://github.com/Tarasevych/hub/tree/integratie)** (вони вказують на один і той самий базовий коміт `3095e5f` станом на синхронізацію `B-009`).
> 2. Усі **28 гілок Категорії 1.3** вже **повністю влиті** (`✅ Злито`) в історію `voornaamst` — їхній код уже є у головній гілці.
> 3. **9 гілок Категорії 1.2** містять **нові незлиті коміти від 04.11.2026** (`🔄 Активна / Кандидат`) поверх або паралельно з `voornaamst`.
> 4. **30 гілок Категорії 1.4** (вересень — 16 жовтня 2026) — це **архівні гілки до консолідації production-знімка `SEC-001` (30.10.2026)** (`📦 Архів`). Їхні напрацювання вже увійшли до кодової бази через знімок `016093f`, тому напряму зливати їх у `integratie` або `voornaamst` **не потрібно**.

---

## 1. Реєстр усіх 71 гілки на GitHub (4 групи)

### 1.1. Головні та інтеграційні гілки (2 гілки)

| Гілка | Коміт | Дата | Статус | Роль та призначення |
|---|---|---|---|---|
| **[`voornaamst`](https://github.com/Tarasevych/hub/tree/voornaamst)** | `3095e5f` | 2026-11-04 | 🌟 **Основна гілка** | Головна публічна гілка репозиторію. Містить повний злитий код платформи (179 комітів після консолідації), систему оркестрації `ORCH-001`, `TRACE-001`, `INTEG-001`, `MAILORBIT/MOB/POLISH-001` та правила `B-009` (`regelsVersie 1.4.2`). |
| **[`integratie`](https://github.com/Tarasevych/hub/tree/integratie)** | `3095e5f` | 2026-11-04 | 🛡️ **Інтеграційна** | Цільова гілка послідовної черги інтеграції агентів (`orchestratie/wachtrij.json`). Злиття відбувається виключно через `--no-ff` без force-push. |

---

### 1.2. Активні гілки в роботі та кандидати на злиття — Листопад 2026 (9 гілок)

#### А. Приватність, очищення персональних даних та правила `1.4.6` (`PRIVACY-001`)
| Гілка | Коміт | Відносно `voornaamst` | Агент / Автор | Що всередині та де шукати |
|---|---|---|---|---|
| **[`release/persoonsgegevens-20261104-164147`](https://github.com/Tarasevych/hub/tree/release/persoonsgegevens-20261104-164147)** | `6483f3f` | **+7 комітів** (0 позаду) | Claude | **Головний релізний кандидат `PRIVACY-001` (рішення `B-010` та `B-011`, `regelsVersie 1.4.6`).** Повне видалення персональних даних та IP-адрес із коду, тестів і документації; змінні `MR_EIGENAAR_NAAM`, `MR_CONTACT_EMAIL`, `MR_BEHEERSUBNET`, `MR_VM_SSH`; фіксація `*.sh text eol=lf` у `.gitattributes` та `git -c core.autocrlf=false archive` у `maak-voorstelpakket.sh`; оновлений `regels.lock.json` та досьє `orchestratie/ontwikkelarchieven/PRIVACY-001.json`. |
| **[`fix/persoonsgegevens-uit-code-20261104`](https://github.com/Tarasevych/hub/tree/fix/persoonsgegevens-uit-code-20261104)** | `8d2580d` | **+1 коміт** (0 позаду) | Claude | Проміжна гілка першого кроку `FIX-PERSOONSGEGEVENS` (винесення даних власника з коду в конфігурацію; увійшла та розширена у `release/persoonsgegevens-20261104-164147`). |

#### Б. Пошта: мобільна адаптивність, порожній стан та OAuth (`MAILFIX-001` / `MAILFIT-001` / `MAILFIT-002`)
| Гілка | Коміт | Відносно `voornaamst` | PR / Реліз | Що всередині та де шукати |
|---|---|---|---|---|
| **[`fix/mailfit-002-20261104-170000`](https://github.com/Tarasevych/hub/tree/fix/mailfit-002-20261104-170000)** | `98beb2a` | **+47 комітів** (1 позаду) | Кандидат `MAILFIT-002` | **Найновіша гілка поштової серії `MAILFIT`.** Містить усі виправлення `MAILFIX-001` та `MAILFIT-001`, плюс сумісність із серверним контрактом `TRACE-001` без перезапису файлів `integratie`, оновлені фікстури регресійних тестів `ORCH` та досьє `orchestratie/ontwikkelarchieven/MAILFIT-002.json`. |
| **[`fix/mailfit-001-20261104-110700`](https://github.com/Tarasevych/hub/tree/fix/mailfit-001-20261104-110700)** | `c3eb3f8` | **+21 коміт** (1 позаду) | [PR #27](https://github.com/Tarasevych/hub/pull/27) · Реліз `20261104-160049` | **`MAILFIT-001`:** центрований адаптивний порожній стан пошти (empty-inbox onboarding), чітка дія під'єднання Gmail, захист елементів керування вже під'єднаної скриньки. |
| **[`fix/mailfix-001-20261104-095000`](https://github.com/Tarasevych/hub/tree/fix/mailfix-001-20261104-095000)** | `1d1d28b` | **+18 комітів** (1 позаду) | [PR #26](https://github.com/Tarasevych/hub/pull/26) | **`MAILFIX-001`:** виправлення мобільної ширини пошти, усунення дубльованої смуги сервісів, діагностика збою Gmail OAuth, живі браузерні DOM-перевірки (`tests/visueel/mailfix-screen.mjs`). |

#### В. Обліковий запис та ідентичність: 12 розділів профілю (`IDENTITY-ACCOUNT` / `IDENTITY-001` / `IDENTITY-002`)
| Гілка | Коміт | Відносно `voornaamst` | Реліз | Що всередині та де шукати |
|---|---|---|---|---|
| **[`feature/identity-account-ui-20261104-180000`](https://github.com/Tarasevych/hub/tree/feature/identity-account-ui-20261104-180000)** | `6e815a0` | **+7 власних комітів** *(база до 2-го rewrite)* | Реліз `20261104-204906` | **`IDENTITY-002` (повна реалізація UI):** єдиний екран облікового запису з **12 розділами** та діалогом керування фото профілю (`796223b`), плюс випуск із власної гілки (`6e815a0`). |
| **[`fix/identity-release-guard-20261104-171500`](https://github.com/Tarasevych/hub/tree/fix/identity-release-guard-20261104-171500)** | `fb56cae` | **+8 комітів** (0 позаду) | — | **`IDENTITY-ACCOUNT` (захист CI та план інтеграції):** покрокова складання пакета в CI, усунення `SIGPIPE` (`tar \| grep -q` під `pipefail`), блок `privacy` у журналі розробки та план інтеграції `IDENTITY-002` (побудована безпосередньо поверх `voornaamst` `3095e5f`). |
| **[`feature/identity-account-20261104-120000`](https://github.com/Tarasevych/hub/tree/feature/identity-account-20261104-120000)** | `50e6373` | **+5 комітів** (0 позаду) | Реліз `20261104-191935` | **`IDENTITY-001`:** дизайн, прототип і ТЗ 12 екранів облікового запису, реєстрація задачі `IDENTITY-001` та журнал розробки за стандартом `TRACE-001` поверх `voornaamst` `3095e5f`. |
| **[`feature/identity-account-ui-20261104-1200`](https://github.com/Tarasevych/hub/tree/feature/identity-account-ui-20261104-1200)** | `db4ba84` | **+2 коміти** (1 позаду) | — | Початкова гілка документації та дизайну 12 екранів `IDENTITY-ACCOUNT` (замінена на `feature/identity-account-20261104-120000`). |

---

### 1.3. Злиті у `voornaamst` функціональні та релізні гілки — Жовтень–Листопад 2026 (30 гілок)

#### 1. Трасування випусків та Мобільна Орбіта Пошти (03–04.11.2026 — 4 гілки)
| Гілка | Коміт | Статус у `voornaamst` | PR / Тег | Зміст гілки |
|---|---|---|---|---|
| **[`feature/mailpolish-001-20261104-084133`](https://github.com/Tarasevych/hub/tree/feature/mailpolish-001-20261104-084133)** | `7ba7a0d` | ✅ **Злито** | [PR #25](https://github.com/Tarasevych/hub/pull/25) · `20261104-075953` | **`MAILPOLISH-001`:** дизайнерське доопрацювання `MailKoppelVenster.tsx`, `MailOrbitIntro.tsx`, мобільних шторок `mail-koppel-mobile-sheet.css`, візуальні прев'ю та Chromium-знімки. |
| **[`feature/mailmob-001-20261104-073200`](https://github.com/Tarasevych/hub/tree/feature/mailmob-001-20261104-073200)** | `2b418cf` | ✅ **Злито** | [PR #24](https://github.com/Tarasevych/hub/pull/24) · `20261104-063430` | **`MAILMOB-001`:** анімована 320px мобільна орбіта пошти, доступні вікна під'єднання та синхронізація 12-годинного Step-Up дозволу («Не питати знову» для Passkey/TOTP/Google). |
| **[`feature/trace-001-20261103-214810`](https://github.com/Tarasevych/hub/tree/feature/trace-001-20261103-214810)** | `017b8e1` | ✅ **Злито** | [PR #23](https://github.com/Tarasevych/hub/pull/23) | **`TRACE-001` (`B-007` / `B-008`, правила `1.4.1`):** обов'язковий `ONTWIKKELARCHIEF.json` у кожному пакеті випуску та перевірка SHA-256 архіву в GitHub Release на сайті й у root-інсталяторі. |
| **[`feature/mailorbit-001-20261103-205354`](https://github.com/Tarasevych/hub/tree/feature/mailorbit-001-20261103-205354)** | `14698ac` | ✅ **Злито** | [PR #22](https://github.com/Tarasevych/hub/pull/22) · `20261103-211554` | **`MAILORBIT-001`:** жива інтерактивна орбіта поштових сервісів і справжні внутрішні вікна під'єднання при порожньому списку облікових записів або порожній скриньці. |

#### 2. Велика інтеграція `INTEG-001` (03.11.2026 — 11 гілок)
| Гілка | Коміт | Статус у `voornaamst` | Зміст гілки |
|---|---|---|---|
| **[`feature/integ-001-zvedennia-20261103-102243`](https://github.com/Tarasevych/hub/tree/feature/integ-001-zvedennia-20261103-102243)** | `78fbcf5` | ✅ **Злито** | **Зведена гілка `INTEG-001`:** об'єднує всі 9 тематичних гілок `integ-001-*`, повний GDPR/AVG-експорт облікового запису без обрізання (`4ddf24d`), реєстрацію нових модулів (`cloud-vnext`, `foto-dienst`) у реєстрі шлюзу та `NoNewPrivileges=yes` для `besluit`-служби. |
| **[`feature/integ-001-meld-20261103-083755`](https://github.com/Tarasevych/hub/tree/feature/integ-001-meld-20261103-083755)** | `ff46129` | ✅ **Злито** | Тихі сповіщення з поясненнями у вкладці «Прочитані», оновлення E2E та UI-каталогу. |
| **[`feature/integ-001-agpag1-20261103-083758`](https://github.com/Tarasevych/hub/tree/feature/integ-001-agpag1-20261103-083758)** | `e25b5a7` | ✅ **Злито** | Дошка ШІ: двомовні назви вкладок і блоків українською та нідерландською. |
| **[`feature/integ-001-band-20261103-083753`](https://github.com/Tarasevych/hub/tree/feature/integ-001-band-20261103-083753)** | `b98bb2b` | ✅ **Злито** | Узгодження тестів `ui-audit-g` (8a) та фіксованої рамки (`vast-kader`) за рішенням щодо верхньої смуги. |
| **[`feature/integ-001-agpag2-20261103-083749`](https://github.com/Tarasevych/hub/tree/feature/integ-001-agpag2-20261103-083749)** | `d4df21b` | ✅ **Злито** | Уніфікація шапок блоків сторінки агентів відповідно до `agenten-pagina.css`. |
| **[`feature/integ-001-login-20261103-083803`](https://github.com/Tarasevych/hub/tree/feature/integ-001-login-20261103-083803)** | `6bbb685` | ✅ **Злито** | Перегенерація канонічного UI-каталогу після інтеграції нового екрана входу. |
| **[`feature/integ-001-menu-20261103-083746`](https://github.com/Tarasevych/hub/tree/feature/integ-001-menu-20261103-083746)** | `ed46b36` | ✅ **Злито** | Виправлення відображення прапорця мови в меню (`object-fit: fill`, без обрізання). |
| **[`feature/integ-001-print-20261103-083745`](https://github.com/Tarasevych/hub/tree/feature/integ-001-print-20261103-083745)** | `4de3780` | ✅ **Злито** | Статичні тести друку (76 перевірок) та перевірка друку у реальному Chrome (`scripts/afdruk-proef.mjs`). |
| **[`feature/integ-001-zoek-20261103-083752`](https://github.com/Tarasevych/hub/tree/feature/integ-001-zoek-20261103-083752)** | `c15e6ae` | ✅ **Злито** | Розкривне меню пошуку у верхній панелі (нещодавні запити, миттєві результати, навігація клавіатурою `Esc`/`Enter`/стрілки). |
| **[`feature/integ-001-test-20261103-083753`](https://github.com/Tarasevych/hub/tree/feature/integ-001-test-20261103-083753)** | `feb9f1b` | ✅ **Злито** | Стабілізація модульних тестів (`afstemming-kern`, `agent-apps`, `apparaat-inrichten`). |
| **[`wip/hub-voor-integratie-20261103`](https://github.com/Tarasevych/hub/tree/wip/hub-voor-integratie-20261103)** | `0ca4cad` | 📌 *Резервний знімок* | Страхувальний коміт незафіксованої локальної роботи (сповіщення, MCP) перед стартом інтеграції `INTEG-001`. |

#### 3. Екран входу `LOGIN-001` (01–03.11.2026 — 3 гілки)
| Гілка | Коміт | Статус у `voornaamst` | PR | Зміст гілки |
|---|---|---|---|---|
| **[`feature/login-001-plus-hub`](https://github.com/Tarasevych/hub/tree/feature/login-001-plus-hub)** | `3be89e0` | ✅ **Злито** | — | Інтеграція `LOGIN-001` із основними змінами хабу та виправлення тестів. |
| **[`feature/login-001-20261101-184800-chatgpt`](https://github.com/Tarasevych/hub/tree/feature/login-001-20261101-184800-chatgpt)** | `6952f8e` | ✅ **Злито** | [PR #20](https://github.com/Tarasevych/hub/pull/20) (об’єднано) | Мінімалістичний багатомовний екран входу без зайвих логотипів та безпечний GitHub CI для складання непідписаних кандидатів. |
| **[`feature/login-001-20261101-195230`](https://github.com/Tarasevych/hub/tree/feature/login-001-20261101-195230)** | `8209000` | 📦 *Закритий кандидат* | [PR #21](https://github.com/Tarasevych/hub/pull/21) (закрито) | Альтернативна draft-гілка кандидата `LOGIN-001` (її напрацювання по меню облікових записів та кольорах технічної смуги перенесено у `feature/login-001-plus-hub`). |

#### 4. Безпека `SEC-001`, Оркестрація `ORCH-001`, `MCP-ACCESS-001` та `UX-AI-VAULT-001` (30.10–01.11.2026 — 12 гілок)
| Гілка | Коміт | Статус у `voornaamst` | PR | Зміст гілки |
|---|---|---|---|---|
| **[`release/ux-ai-vault-001-20261101-160600`](https://github.com/Tarasevych/hub/tree/release/ux-ai-vault-001-20261101-160600)** | `80716ac` | ✅ **Злито** | [PR #19](https://github.com/Tarasevych/hub/pull/19) (об’єднано) | **`UX-AI-VAULT-001`:** керування ШІ-агентом в одному місці з підтвердженням Passkey на місці та єдине адаптивне Сховище секретів. |
| **[`release/sec-001-20261031-084138`](https://github.com/Tarasevych/hub/tree/release/sec-001-20261031-084138)** | `80716ac` | ✅ **Злито** | [PR #12](https://github.com/Tarasevych/hub/pull/12) (об’єднано) | Базова релізна гілка після злиття `SEC-001`, `ORCH-001`, `MCP-ACCESS-001` та `UX-AI-VAULT-001`. |
| **[`claude/project-thread-99x4j9`](https://github.com/Tarasevych/hub/tree/claude/project-thread-99x4j9)** | `3dea7c1` | ✅ **Злито** | [PR #17](https://github.com/Tarasevych/hub/pull/17) (об’єднано) | Доопрацювання `ORCH-001` після PR #16: заборона здачі чужої задачі, ізоляція технічних MCP-під'єднань від приватного «Доступу ШІ». |
| **[`fix/mcp-access-001-20261101-125530`](https://github.com/Tarasevych/hub/tree/fix/mcp-access-001-20261101-125530)** | `b864308` | ✅ **Злито** | [PR #18](https://github.com/Tarasevych/hub/pull/18) (об’єднано) | **`MCP-ACCESS-001`:** точна серверна діагностика доступу ШІ, ізоляція за під'єднанням, прямі дії в 1 натискання та живе оновлення дозволів. |
| **[`release/orch-001-mcp-20261031`](https://github.com/Tarasevych/hub/tree/release/orch-001-mcp-20261031)** | `d33d068` | ✅ **Злито** | [PR #16](https://github.com/Tarasevych/hub/pull/16) (об’єднано) | Спільний інтеграційний кандидат `ORCH-001` (PR #11 + PR #13) + `MCP-001` (PR #14) + `MCP-DEUR 8091` (PR #15). |
| **[`fix/mcp-deur-uitrol-20261031-204604`](https://github.com/Tarasevych/hub/tree/fix/mcp-deur-uitrol-20261031-204604)** | `ebc3736` | ✅ **Злито** | [PR #15](https://github.com/Tarasevych/hub/pull/15) | Синхронізація `deploy/mcp/server.mjs` та автоматичний перезапуск служби порту `8091` під час встановлення і повернення стану. |
| **[`fix/mcp-tools-catalog-20261031-192004`](https://github.com/Tarasevych/hub/tree/fix/mcp-tools-catalog-20261031-192004)** | `0b0b67c` | ✅ **Злито** | [PR #14](https://github.com/Tarasevych/hub/pull/14) | **`MCP-001`:** відновлення каталогу MCP-інструментів для Cursor Cloud / GitHub OAuth / Streamable HTTP. |
| **[`feature/orch-001-20261031-112355`](https://github.com/Tarasevych/hub/tree/feature/orch-001-20261031-112355)** | `7176e95` | ✅ **Злито** | [PR #11](https://github.com/Tarasevych/hub/pull/11) | **`ORCH-001` (етапи 0–4):** створення `AGENTS.md`, `orchestratie/*`, `scripts/orch.mjs`, керування з сайту/MCP та затвердження правил через Passkey. |
| **[`fix/orch-001-review-20261031-165744`](https://github.com/Tarasevych/hub/tree/fix/orch-001-review-20261031-165744)** | `1203048` | ✅ **Злито** | — | Виправлення безпеки `ORCH-001`: блокування виконання довільних тестових команд з пакета (RCE), перевірка SSHSIG у GitOps. |
| **[`fix/orch-001-audit-20261031-170250`](https://github.com/Tarasevych/hub/tree/fix/orch-001-audit-20261031-170250)** | `315cebf` | 📦 *Інтегровано в PR #16* | [PR #13](https://github.com/Tarasevych/hub/pull/13) (закрито) | Тести перевірки безпеки `ORCH-001` (перенесені в `fix/orch-001-review-20261031-165744` та `release/orch-001-mcp-20261031`). |
| **[`fix/sec-001-20261031-000224`](https://github.com/Tarasevych/hub/tree/fix/sec-001-20261031-000224)** | `fd52dca` | ✅ **Злито** | — | Усунення вразливостей за результатами аудиту `SEC-001` та набір верифікаційних тестів. |
| **[`audit/sec-001-20261030`](https://github.com/Tarasevych/hub/tree/audit/sec-001-20261030)** | `016093f` | ✅ **Злито** | — | Імпорт повного production-знімка від 30.10.2026 для проведення аудиту `SEC-001`. |

---

### 1.4. Історичні та архівні гілки ранньої розробки — Вересень — 16 Жовтня 2026 (30 гілок)

#### 1. Фундамент Self-Hosting, Авторизація та Фази Безпеки (Вересень — 6 Жовтня 2026 — 7 гілок)
| Гілка | Коміт | Дата | Опис етапу |
|---|---|---|---|
| **[`Mijn-ruimte-reservekopieën`](https://github.com/Tarasevych/hub/tree/Mijn-ruimte-reservekopie%C3%ABn)** | `1f377ca` | 2026-09-24 | ✅ Початкова гілка репозиторію (предок `voornaamst`). |
| **[`basis-voor-zelf-hosten`](https://github.com/Tarasevych/hub/tree/basis-voor-zelf-hosten)** | `722542c` | 2026-10-02 | Вихідний знімок коду з першими виправленнями безпеки перед відмовою від AppDeploy. |
| **[`auth-fase-1`](https://github.com/Tarasevych/hub/tree/auth-fase-1)** | `a60525a` | 2026-10-03 | **Auth Fase 1:** прив'язка облікових записів за `(provider, subject)`, захист Google OAuth redirect-flow від Login-CSRF, видалення застарілих маршрутів сесій (міграція `0002`). |
| **[`beveiliging-fase-2-3`](https://github.com/Tarasevych/hub/tree/beveiliging-fase-2-3)** | `77cddc6` | 2026-10-03 | **Beveiliging Fase 2 & 3:** PostgreSQL RLS (`0003`–`0005`), три ролі БД (`db-rollen.sql`), `auth-poort.ts`, append-only аудит (`0006`), Step-Up (`stap-op.ts`), GDPR-експорт. |
| **[`beveiliging-fixes-audit`](https://github.com/Tarasevych/hub/tree/beveiliging-fixes-audit)** | `0f0cab4` | 2026-10-04 | **Audit Fixes (A1–A11):** зміцнення хеш-ланцюга `app.audit` (`0008`), RLS по таблицях (`0007`), публічні сторінки `/privacy` і `/terms`. |
| **[`sync-actief`](https://github.com/Tarasevych/hub/tree/sync-actief)** | `cb130fd` | 2026-10-06 | Синхронізація стану активного релізу `20261006-124427` із production ВМ. |
| **[`zelf-hosten`](https://github.com/Tarasevych/hub/tree/zelf-hosten)** | `f30ea67` | 2026-10-06 | Основна гілка переходу на self-hosting (`PORTEERPLAN.md`, `server/platform/*`, `deploy/installeer-app.sh`). |

#### 2. Passkeys, Гостьовий Доступ та Меню v2 (6–9 Жовтня 2026 — 7 гілок)
| Гілка | Коміт | Дата | Опис етапу |
|---|---|---|---|
| **[`feature/connectors-agent`](https://github.com/Tarasevych/hub/tree/feature/connectors-agent)** | `c318679` | 2026-10-06 | Початкова архітектура під'єднання ШІ-агентів та runbook пакування. |
| **[`feature/connectors-agent-v2`](https://github.com/Tarasevych/hub/tree/feature/connectors-agent-v2)** | `053a29f` | 2026-10-08 | Розвиток конекторів агентів v2 та адаптивний редактор відповіді в мобільній пошті. |
| **[`veilig-agenten-0.4`](https://github.com/Tarasevych/hub/tree/veilig-agenten-0.4)** | `f89d34f` | 2026-10-08 | Контур безпеки для ШІ-агентів версії 0.4 (`deploy/RUNBOOK-AGENTEN-0.4.md`). |
| **[`passkey-schvalennya`](https://github.com/Tarasevych/hub/tree/passkey-schvalennya)** | `3cd66f4` | 2026-10-08 | Власне WebAuthn-ядро (`deploy/goedkeuring/webauthn-kern.mjs`) та схвалення серверних оновлень власником через Passkey (`Admin → Оновлення`). |
| **[`aanmeldmethoden`](https://github.com/Tarasevych/hub/tree/aanmeldmethoden)** | `a22ed85` | 2026-10-09 | Користувацькі Passkeys у розділі «Способи входу» (міграція `0023`, `rpId: tarasevych.com`). |
| **[`bevestig-toegang`](https://github.com/Tarasevych/hub/tree/bevestig-toegang)** | `3d449e7` | 2026-10-09 | Тимчасові коди доступу для гостей, гостьові сесії (`/toegang`) та управління сесіями (міграція `0025`). |
| **[`menu-v2`](https://github.com/Tarasevych/hub/tree/menu-v2)** | `b77f8d5` | 2026-10-09 | **Menu v2 (Stage 2):** швидка панель, секції, док праворуч/угорі/унизу з прозорістю і масштабуванням, режим редагування drag-and-drop. |

#### 3. Гілки Claude та Cursor Agent: MCP, Техпрофіль і Конектори (9–16 Жовтня 2026 — 16 гілок)
| Гілка | Коміт | Дата | PR | Опис етапу |
|---|---|---|---|---|
| **[`claude/plan-2026-10-09`](https://github.com/Tarasevych/hub/tree/claude/plan-2026-10-09)** | `0c18e79` | 2026-10-12 | — | Виправлення пошти за QA-звітами від 12.10 (десктоп і мобільний телефон). |
| **[`claude/mcp-een-klik-2026-10-13`](https://github.com/Tarasevych/hub/tree/claude/mcp-een-klik-2026-10-13)** | `c503db1` | 2026-10-13 | — | Під'єднання ШІ по MCP «одним натисканням» або вручну, підтвердження дверей на сайті з вибором терміну дії. |
| **[`cursor/terminal-etap-c-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/terminal-etap-c-8d4d)** | `e9128e4` | 2026-10-13 | [PR #1](https://github.com/Tarasevych/hub/pull/1) | **Етап C:** вбудований термінал у браузері на базі `@xterm/xterm` (вимкнений типово). |
| **[`cursor/ssh-uitrol-audit-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ssh-uitrol-audit-8d4d)** | `596cd4a` | 2026-10-13 | [PR #2](https://github.com/Tarasevych/hub/pull/2) | Запис SSH-встановлення в історію оновлень та журнал аудиту. |
| **[`cursor/mcp-spiegel-tools-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/mcp-spiegel-tools-8d4d)** | `30b45a4` | 2026-10-14 | [PR #3](https://github.com/Tarasevych/hub/pull/3) | Відображення інструментів дверей у MCP-конекторі (випуск, дошка, карта сервісів). |
| **[`claude/tech-profiel-2026-10-13`](https://github.com/Tarasevych/hub/tree/claude/tech-profiel-2026-10-13)** | `363fa72` | 2026-10-14 | — | **Етап B:** ізоляція адмін-прав виключно в активному Технічному профілі (`deploy/BEHEER-ALLEEN-TECH.md`). |
| **[`cursor/mcp-spiegel-na-b-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/mcp-spiegel-na-b-8d4d)** | `2c947c6` | 2026-10-14 | [PR #4](https://github.com/Tarasevych/hub/pull/4) | Розділення двох вебпросторів: обліковий запис без адмін-управління, технічний профіль без приватних даних. |
| **[`cursor/ai-vertaling-context-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-vertaling-context-8d4d)** | `dda7668` | 2026-10-14 | [PR #5](https://github.com/Tarasevych/hub/pull/5) | ШІ-переклад листів на місці, стисла вижимка та міжскриньковий контекст листів і документів. |
| **[`cursor/ai-agent-scopes-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-agent-scopes-8d4d)** | `013eaa5` | 2026-10-14 | [PR #7](https://github.com/Tarasevych/hub/pull/7) | Гранулярні дозволи «Доступ ШІ» (скоупи інструментів каталогу та чутливих даних, міграція `0044`). |
| **[`cursor/ai-agent-board-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/ai-agent-board-8d4d)** | `11f5232` | 2026-10-15 | [PR #6](https://github.com/Tarasevych/hub/pull/6) | Об'єднання Дошки ШІ-агентів (`0043`), гранулярних дозволів (`0044`) та ШІ-перекладу/контексту. |
| **[`cursor/connector-integraties-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-integraties-8d4d)** | `796b78f` | 2026-10-15 | [PR #8](https://github.com/Tarasevych/hub/pull/8) | Окремі адреси конекторів ШІ, нідерландські назви маршрутів та покрокове під'єднання з грантами. |
| **[`cursor/connector-uitvoeren-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-uitvoeren-8d4d)** | `65cfeb9` | 2026-10-15 | [PR #9](https://github.com/Tarasevych/hub/pull/9) | Реальні дії конектора: надсилання пошти, запис Диска й календаря, дошка, пошук, GitHub. |
| **[`cursor/connector-functies-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/connector-functies-8d4d)** | `9d5a4be` | 2026-10-15 | [PR #10](https://github.com/Tarasevych/hub/pull/10) | Повний каталог конектора як реальні дії (Figma, Notion, GitHub, Wix, Stripe, випуски). |
| **[`cursor/release-tar-8d4d`](https://github.com/Tarasevych/hub/tree/cursor/release-tar-8d4d)** | `63a7d48` | 2026-10-15 | — | Гілка пакета випуску `mijn-ruimte-20261015-123546` (реальні дії конекторів). |
| **[`claude/connector-v2-2026-10-15`](https://github.com/Tarasevych/hub/tree/claude/connector-v2-2026-10-15)** | `4135dfd` | 2026-10-15 | — | Зведення A2/A3: `ai/verbindingen` як єдиний хаб під'єднань ШІ з підвкладками (`deploy/CONNECTOR-V2.md`). |
| **[`fix/mail-compose-float-independent`](https://github.com/Tarasevych/hub/tree/fix/mail-compose-float-independent)** | `f7de4d8` | 2026-10-16 | — | Незалежне рухоме вікно написання листа та автооновлення статусів адмін-панелі кожні 10 с. |

---

## 2. Повний реєстр усіх 27 Pull Requests (`#1`–`#27`)

| PR | Статус | Заголовок | Гілка-джерело → База | Пояснення фактичного стану |
|---|---|---|---|---|
| **[#27](https://github.com/Tarasevych/hub/pull/27)** | 🟢 OPEN | `MAILFIT-001 — centered responsive empty Mail onboarding` | `fix/mailfit-001-20261104-110700` → `fix/mailfix-001-20261104-095000` | 🔄 Активний кандидат (розширений у `fix/mailfit-002-20261104-170000`). |
| **[#26](https://github.com/Tarasevych/hub/pull/26)** | 🟢 OPEN | `MAILFIX-001 — mobile width, remove duplicate service strip, diagnose broken Gmail OAuth` | `fix/mailfix-001-20261104-095000` → `feature/mailpolish-001-20261104-084133` | 🔄 Активний кандидат (база для PR #27 та `MAILFIT-002`). |
| **[#25](https://github.com/Tarasevych/hub/pull/25)** | 🟢 OPEN* | `MAILPOLISH-001: відтворити дизайнерську концепцію в реальній мобільній пошті` | `feature/mailpolish-001-20261104-084133` → `feature/mailmob-001-20261104-073200` | ✅ **Вже злито у `voornaamst` (`7ba7a0d`)**; PR лишився відкритим через каскадну базу. |
| **[#24](https://github.com/Tarasevych/hub/pull/24)** | 🟢 OPEN* | `MAILMOB-001: жива мобільна пошта й виправлення «Не питати знову»` | `feature/mailmob-001-20261104-073200` → `feature/trace-001-20261103-214810` | ✅ **Вже злито у `voornaamst` (`2b418cf`)**. |
| **[#23](https://github.com/Tarasevych/hub/pull/23)** | 🟢 OPEN* | `TRACE-001: обов'язковий GitHub-журнал і SHA-256 кожного пакета` | `feature/trace-001-20261103-214810` → `feature/mailorbit-001-20261103-205354` | ✅ **Вже злито у `voornaamst` (`017b8e1`)**. |
| **[#22](https://github.com/Tarasevych/hub/pull/22)** | 🟢 OPEN* | `MAILORBIT-001: інтерактивні поштові сервіси на порожній сторінці` | `feature/mailorbit-001-20261103-205354` → `feature/integ-001-zvedennia-20261103-102243` | ✅ **Вже злито у `voornaamst` (`14698ac`)**. |
| **[#21](https://github.com/Tarasevych/hub/pull/21)** | 🔴 CLOSED | `[DRAFT] LOGIN-001: minimalistische aanmeldweergave (ORCH-conforme release-kandidaat)` | `feature/login-001-20261101-195230` → `integratie` | 📦 Закритий альтернативний кандидат (напрацювання перенесено у `feature/login-001-plus-hub`). |
| **[#20](https://github.com/Tarasevych/hub/pull/20)** | 🟣 MERGED | `[DRAFT] LOGIN-001: minimalistische meertalige aanmeldweergave zonder logo` | `feature/login-001-20261101-184800-chatgpt` → `integratie` | ✅ Злито 04.11.2026. |
| **[#19](https://github.com/Tarasevych/hub/pull/19)** | 🟣 MERGED | `UX-AI-VAULT-001 + PR #17: керування ШІ-агентом в 1 місці з Passkey на місці та єдине адаптивне Сховище секретів` | `release/ux-ai-vault-001-20261101-160600` → `release/sec-001-20261031-084138` | ✅ Злито 01.11.2026. |
| **[#18](https://github.com/Tarasevych/hub/pull/18)** | 🟣 MERGED | `MCP-ACCESS-001: точна серверна діагностика доступу ШІ, ізоляція за під'єднанням, прямі дії в 1 натискання та живе оновлення дозволів` | `fix/mcp-access-001-20261101-125530` → `release/sec-001-20261031-084138` | ✅ Злито 01.11.2026. |
| **[#17](https://github.com/Tarasevych/hub/pull/17)** | 🟣 MERGED | `ORCH-001 після злиття PR #16: чужу задачу не здати, агенту без passkey/besluit, подія при збої дверей 8091; розділені простори «Доступу ШІ»` | `claude/project-thread-99x4j9` → `release/sec-001-20261031-084138` | ✅ Злито 01.11.2026. |
| **[#16](https://github.com/Tarasevych/hub/pull/16)** | 🟣 MERGED | `INTEGRATIE: спільний кандидат ORCH-001 (PR #11 + PR #13) + MCP-001 (PR #14) + MCP-DEUR 8091 (PR #15)` | `release/orch-001-mcp-20261031` → `release/sec-001-20261031-084138` | ✅ Злито 01.11.2026 (об'єднує та закриває PR #11, #13, #14, #15). |
| **[#15](https://github.com/Tarasevych/hub/pull/15)** | 🔴 CLOSED | `MCP-DEUR: синхронізація deploy/mcp/server.mjs та перезапуск служби порту 8091 під час встановлення і повернення стану` | `fix/mcp-deur-uitrol-20261031-204604` → `release/sec-001-20261031-084138` | ✅ Злито через спільний PR #16 (`ebc3736`). |
| **[#14](https://github.com/Tarasevych/hub/pull/14)** | 🔴 CLOSED | `MCP-001: відновлення каталогу MCP-інструментів для Cursor Cloud / GitHub OAuth / Streamable HTTP` | `fix/mcp-tools-catalog-20261031-192004` → `release/sec-001-20261031-084138` | ✅ Злито через спільний PR #16 (`0b0b67c`). |
| **[#13](https://github.com/Tarasevych/hub/pull/13)** | 🔴 CLOSED | `[DRAFT] Security review ORCH-001: untrusted test execution + upload ownership` | `fix/orch-001-audit-20261031-170250` → `feature/orch-001-20261031-112355` | ✅ Інтегровано у PR #16 (`1203048`). |
| **[#12](https://github.com/Tarasevych/hub/pull/12)** | 🟣 MERGED | `Add comprehensive backend modules and deployment documentation` | `release/sec-001-20261031-084138` → `voornaamst` | ✅ Злито 04.11.2026. |
| **[#11](https://github.com/Tarasevych/hub/pull/11)** | 🔴 CLOSED | `ORCH-001 етапи 0–4 + незалежна й адверсарна перевірка: єдині правила, один конвеєр приймання...` | `feature/orch-001-20261031-112355` → `release/sec-001-20261031-084138` | ✅ Злито через спільний PR #16 (`7176e95`). |
| **[#10](https://github.com/Tarasevych/hub/pull/10)** | 📦 OPEN (Архів) | `Повний каталог конектора як справжні дії без позначки у розробці` | `cursor/connector-functies-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Історичний PR від 15.10.2026 (код у знімку `016093f`). |
| **[#9](https://github.com/Tarasevych/hub/pull/9)** | 📦 OPEN (Архів) | `Реальні дії конектора: лист, Диск, календар, дошка, пошук, GitHub` | `cursor/connector-uitvoeren-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Історичний PR від 15.10.2026 (код у знімку `016093f`). |
| **[#8](https://github.com/Tarasevych/hub/pull/8)** | 📦 OPEN (Архів) | `Окремі адреси конекторів ШІ, нідерландські назви та крокове під'єднання з грантами` | `cursor/connector-integraties-8d4d` → `claude/connector-v2-2026-10-15` | 📦 Історичний PR від 15.10.2026 (код у знімку `016093f`). |
| **[#7](https://github.com/Tarasevych/hub/pull/7)** | 📦 OPEN (Архів) | `Гранулярні дозволи Доступ ШІ для під'єднаних агентів та чутливих даних` | `cursor/ai-agent-scopes-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Історичний PR від 14.10.2026 (код у знімку `016093f`). |
| **[#6](https://github.com/Tarasevych/hub/pull/6)** | 📦 OPEN (Архів) | `Дошка ШІ-агентів, гранулярні дозволи Доступ ШІ та розумний переклад і контекст листів` | `cursor/ai-agent-board-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Історичний PR від 14.10.2026 (код у знімку `016093f`). |
| **[#5](https://github.com/Tarasevych/hub/pull/5)** | 📦 OPEN (Архів) | `ШІ-переклад на місці, вижимка та міжскриньковий контекст листів і документів` | `cursor/ai-vertaling-context-8d4d` → `cursor/mcp-spiegel-na-b-8d4d` | 📦 Історичний PR від 14.10.2026 (код у знімку `016093f`). |
| **[#4](https://github.com/Tarasevych/hub/pull/4)** | 📦 OPEN (Архів) | `Дві веб-простори: обліковий запис без управління, технічний профіль без користувацького` | `cursor/mcp-spiegel-na-b-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Історичний PR від 14.10.2026 (код у знімку `016093f`). |
| **[#3](https://github.com/Tarasevych/hub/pull/3)** | 📦 OPEN (Архів) | `MCP-конектор: відображення дверей (випуск, дошка, карта сервісів)` | `cursor/mcp-spiegel-tools-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Історичний PR від 14.10.2026 (код у знімку `016093f`). |
| **[#2](https://github.com/Tarasevych/hub/pull/2)** | 📦 OPEN (Архів) | `SSH-встановлення з’являється в історії й аудиті` | `cursor/ssh-uitrol-audit-8d4d` → `cursor/terminal-etap-c-8d4d` | 📦 Історичний PR від 13.10.2026 (код у знімку `016093f`). |
| **[#1](https://github.com/Tarasevych/hub/pull/1)** | 📦 OPEN (Архів) | `Etap C: термінал у браузері (xterm), вимкнений типово` | `cursor/terminal-etap-c-8d4d` → `claude/tech-profiel-2026-10-13` | 📦 Історичний PR від 13.10.2026 (код у знімку `016093f`). |

---

## 3. Повний реєстр GitHub Releases (18+ випусків)

За стандартом **TRACE-001** (`B-007` / `B-008`), кожен випуск публікується у [GitHub Releases](https://github.com/Tarasevych/hub/releases) і містить інсталяційний архів `mijn-ruimte-<versie>.tar.gz`, контрольний хеш `.tar.gz.sha256` та (для агентських передач) пакет `-overdracht.zip`:

| № | Тег випуску | Назва випуску | Дата (UTC) | Задача / Контекст |
|---|---|---|---|---|
| 1 | [`20261105-003823`](https://github.com/Tarasevych/hub/releases/tag/20261105-003823) | `IDENTITY-ACCOUNT · 20261105-003823` | 2026-11-05 00:38 | `IDENTITY-ACCOUNT` (попередній випуск) |
| 2 | [`20261104-204906`](https://github.com/Tarasevych/hub/releases/tag/20261104-204906) | `IDENTITY-ACCOUNT · 20261104-204906` | 2026-11-04 20:49 | `IDENTITY-002` (`feature/identity-account-ui-20261104-180000`) |
| 3 | [`20261104-191935`](https://github.com/Tarasevych/hub/releases/tag/20261104-191935) | `IDENTITY-ACCOUNT · 20261104-191935` | 2026-11-04 19:19 | `IDENTITY-001` (`feature/identity-account-20261104-120000`) |
| 4 | [`20261104-164906`](https://github.com/Tarasevych/hub/releases/tag/20261104-164906) | `IDENTITY-ACCOUNT · 20261104-164906` | 2026-11-04 16:49 | `IDENTITY-ACCOUNT` (попередній випуск) |
| 5 | [`20261104-160343`](https://github.com/Tarasevych/hub/releases/tag/20261104-160343) | `IDENTITY-ACCOUNT · 20261104-160343` | 2026-11-04 16:03 | `IDENTITY-ACCOUNT` (попередній випуск) |
| 6 | [`20261104-160049`](https://github.com/Tarasevych/hub/releases/tag/20261104-160049) | `MAILFIT-001 · 20261104-160049 (unsigned)` | 2026-11-04 16:00 | `MAILFIT-001` (`fix/mailfit-001-20261104-110700`) |
| 7 | [`20261104-155548`](https://github.com/Tarasevych/hub/releases/tag/20261104-155548) | `MAILFIT-001 · 20261104-155548 (unsigned)` | 2026-11-04 15:55 | `MAILFIT-001` (попередній випуск CI) |
| 8 | [`20261104-154942`](https://github.com/Tarasevych/hub/releases/tag/20261104-154942) | `MAILFIT-001 · 20261104-154942 (unsigned)` | 2026-11-04 15:49 | `MAILFIT-001` (попередній випуск CI) |
| 9 | [`20261104-154114`](https://github.com/Tarasevych/hub/releases/tag/20261104-154114) | `IDENTITY-ACCOUNT · 20261104-154114` | 2026-11-04 15:41 | `IDENTITY-ACCOUNT` (попередній випуск) |
| 10 | [`20261104-153759`](https://github.com/Tarasevych/hub/releases/tag/20261104-153759) | `IDENTITY-ACCOUNT · 20261104-153759` | 2026-11-04 15:38 | `IDENTITY-ACCOUNT` (попередній випуск) |
| 11 | [`20261104-075953`](https://github.com/Tarasevych/hub/releases/tag/20261104-075953) | `MAILPOLISH-001 · 20261104-075953 (unsigned)` | 2026-11-04 08:00 | `MAILPOLISH-001` (`feature/mailpolish-001-20261104-084133` — у `voornaamst`) |
| 12 | [`20261104-063430`](https://github.com/Tarasevych/hub/releases/tag/20261104-063430) | `MAILMOB-001 · 20261104-063430 (unsigned)` | 2026-11-04 06:34 | `MAILMOB-001` (`feature/mailmob-001-20261104-073200` — у `voornaamst`) |
| 13 | [`20261103-211554`](https://github.com/Tarasevych/hub/releases/tag/20261103-211554) | `MAILORBIT-001 · 20261103-211554 (unsigned)` | 2026-11-03 21:16 | `MAILORBIT-001` (`feature/mailorbit-001-20261103-205354` — у `voornaamst`) |
| 14 | [`login-001-candidate-20261102-092316`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-092316) | `LOGIN-001 · Непідписаний кандидат 20261102-092316` | 2026-11-02 09:23 | `LOGIN-001` (`feature/login-001-20261101-184800-chatgpt`) |
| 15 | [`login-001-candidate-20261102-070214`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-070214) | `LOGIN-001 · Непідписаний кандидат 20261102-070214` | 2026-11-02 07:02 | `LOGIN-001` (попередній випуск CI) |
| 16 | [`login-001-candidate-20261102-062359`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-062359) | `LOGIN-001 · Непідписаний кандидат 20261102-062359` | 2026-11-02 06:24 | `LOGIN-001` (попередній випуск CI) |
| 17 | [`login-001-candidate-20261102-053006`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-053006) | `LOGIN-001 · Непідписаний кандидат 20261102-053006` | 2026-11-02 05:30 | `LOGIN-001` (попередній випуск CI) |
| 18 | [`login-001-candidate-20261102-010425`](https://github.com/Tarasevych/hub/releases/tag/login-001-candidate-20261102-010425) | `LOGIN-001 · Непідписаний кандидат 20261102-010425` | 2026-11-02 01:04 | `LOGIN-001` (попередній випуск CI) |
| 19 | [`20261010-ux`](https://github.com/Tarasevych/hub/releases/tag/20261010-ux) | `mijn-ruimte-20261010-ux` | 2026-10-10 19:30 | Перший базовий реліз після переходу на self-hosting (`Latest`) |
