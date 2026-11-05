> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./TZ-account-2026-11-04.uk.md) · [🇳🇱 **Nederlandse versie**](./TZ-account-2026-11-04.nl.md) · [🏠 Головна (UK)](../../../README.md) · [🏠 Hoofdpagina (NL)](../../../LEESMIJ.md) · [📚 Каталог статей / Index](../../INDEX.md)

# ТЗ: сторінка керування обліковим записом (варіант B)

**Дата:** 2026-11-04 · **Статус:** проєкт ТЗ, у прод нічого не змінено
**Макет:** `tijdelijke-bestanden\ontwerp-account-v2-2026-11-04.png` / `.html`
**Сервіс:** identity · `id.tarasevych.com` · сторінка `account`
**Дизайн-джерело:** `src/ontwerp/tokens.css` (лише токени, без нових hex)

---

## 1. Мета й межі

**Мета:** одна сторінка, де власник бачить і змінює все про акаунт: профіль, способи входу, безпеку, сесії, вигляд, дані, видалення.

**У межах:** новий екран `identity/account`, компоненти, i18n, тести.
**Поза межами:** зміна auth-політик, нові таблиці БД, увімкнення passkey, зміни в інших службах. Жодних змін у прод без окремого підтвердження.

---

## 2. Структура екрана

Порядок груп фіксований (mobile-first, одна колонка; на ≥860 px — центрована колонка 760 px):

| # | Група | Рядки |
|---|---|---|
| 1 | Профіль | аватар, ім'я, e-mail, «акаунт з …», «Змінити фото» |
| 2 | Вхід | Google (основний), Пароль + TOTP, Microsoft, Apple, Passkey (недоступно) |
| 3 | Безпека | Двоетапний вхід, Коди відновлення (n з m), Підтвердження для чутливих дій |
| 4 | Пристрої та сесії | поточний пристрій, інші пристрої, сесії вкладок; «Завершити», «Завершити всі» |
| 5 | Вигляд | Мова (UK/NL), Тема (світла/темна/авто), Простори (приватний/технічний) |
| 6 | Дані | Експорт усіх даних, Журнал подій |
| 7 | Небезпечна зона | Видалити акаунт (30 днів відновлення) |

Кожен рядок: іконка 40×40 → назва + підказка → значення/дія + шеврон. Висота рядка ≥ 56 px, ціль дотику ≥ 44 px.

---

## 3. Компоненти й файли

```
src/identity/account/
  AccountPage.tsx          — каркас, порядок груп, завантаження стану
  AccountGroup.tsx         — заголовок групи + контейнер рядків (border-radius 14)
  AccountRow.tsx           — універсальний рядок: icon, title, hint, value, action, chevron
  StatusDot.tsx            — крапка + текст (ok / muted / off), aria-hidden для крапки
  ProfileCard.tsx          — аватар, ім'я, e-mail, дата створення, зміна фото
  LoginMethods.tsx         — способи входу, стани connected/available/disabled
  SecuritySection.tsx      — TOTP, коди відновлення, step-up
  SessionsSection.tsx      — пристрої та вкладки, відкликання
  AppearanceSection.tsx    — мова, тема, простори
  DataSection.tsx          — експорт, журнал
  DangerZone.tsx           — видалення з step-up
  account-teksten.ts       — uk/nl словник (усі рядки, без хардкоду в JSX)
  account.css              — лише токени; жодних нових кольорів
tests/eenheid/account-*.test.ts       — стани, словник, доступність
tests/e2e/account.spec.ts             — наскрізні сценарії (Playwright)
```

Правила: без `dangerouslySetInnerHTML`; **іконки — лише `lucide-react`** (`user`, `key-round`, `shield-check`, `monitor`, `smartphone`, `clock`, `refresh-cw`, `globe`, `palette`, `layout-dashboard`, `download`, `file-text`, `trash-2`, `camera`, `chevron-right`); жодних текстових глифів (`⌘`, `☑`, `◐`) — вони рендеряться як «квадратики». Бренд-марки Google/Microsoft/Apple — окремі SVG з власними кольорами (`currentColor` не застосовувати), `aria-hidden="true"`. Аватар — `user.picture`, інакше градієнт + ініціали.

---

## 4. Дані та API (реальні маршрути)

| Блок | Джерело | Примітка |
|---|---|---|
| Профіль, e-mail, дата | `POST /api/account/overview` | авторитетне джерело; e-mail — атрибут, не ключ |
| Хто я | `GET /api/owner/session/who` | для шапки й перевірки сесії |
| Способи входу | `POST /api/security/overview` → `{ identities[], providers[], rules }`; `GET /api/auth/methods` — лише каталог провайдерів | реальні ідентичності, а не тільки каталог |
| TOTP | `POST /api/owner/access/totp/start`, `/confirm`, `/disable` | 503, якщо немає `TOTP_ENCRYPTION_KEY_V1` |
| Коди відновлення | `POST /api/owner/access/recovery/overzicht`, `/rotate`, `/intrekken`, `/bekeken` | показувати «n з m», не самі коди |
| Сесії | `POST /api/owner/session/accounts` (список grant'ів + `reauthRequired`), `POST /api/owner/session/logout-current`, `/logout-browser-all`, `/logout-account-browser`, `/logout-account-everywhere` | **`/api/identity/security/sessions*` — 410 Gone**, не використовувати |
| Passkey | — (немає маршруту) | чесно `disabled`: `ACCESS_WEBAUTHN_DISABLED` |
| Мова | профіль акаунта (cookie `tsv_ecosystem_preferences` v3) | мова належить акаунту |
| Тема | `ui_weergave` через існуючий контролер теми | не дублювати логіку |
| Простори | `tech_profielen` / `ruimte_keuze` | перехід у технічний — окреме підтвердження |
| Експорт | `POST /api/owner/privacy/export` | повний, без обрізання |
| Журнал | `POST /api/owner/journaal/beheer/export` або екран аудиту | лише читання |
| Видалення | `POST /api/owner/identity/account/delete` (+ `POST /api/account/recover`) | 30 днів; **власнику заборонено** (`OWNER_NIET_WISSEN`), потрібні `confirmEmail`, кодове слово і step-up |

**Заборонено:** брати `userId`/простір із тіла запиту; довіряти `x-forwarded-host`; показувати секрети (ключі, TOTP-секрет, коди відновлення після закриття).

### 4b. Звірено з кодом (04.11.2026)

- `POST /api/account/overview` → `{ user, workspaces[], activeWorkspaces[], archivedWorkspaces[], …notificationState }`; `user` = `publicUser`: `id, accountId, email, name, picture, customPicture, role, workspaceRole, permissions, status, accessLevel, entitlements, deletedAt, personRef, recoverableUntil, retiredAt, recoveryDays`.
- `GET /api/auth/methods` → `{ providers: providerCatalog }` (без сесії).
- `POST /api/owner/access/totp/start` → `{ ok, secret, otpauth, plaintextReturned: true }`; помилки `ACCESS_TOTP_KEY_MISSING` / `ACCESS_RECOVERY_PEPPER_MISSING` (503). Заміна вже підтвердженого TOTP вимагає step-up **і** поточного коду.
- `POST /api/owner/access/recovery/overzicht` → `{ ok, …herstelOverzichtVol }` — масковані коди (`••••-••••-••ab`), без step-up. `rotate` віддає коди одноразово (`plaintextReturned`), `intrekken` — зі step-up.
- `POST /api/owner/privacy/export` → повний експорт; потрібна owner-identity-сесія, step-up і ліміт 5/год (`RATE_LIMITED`).
- `POST /api/owner/identity/account/delete` → `{ ok, epoch }` + очищення cookie; вимагає `confirmEmail` (інакше `OWNER_EMAIL_CONFIRMATION_MISMATCH`), кодового слова, step-up `account-verwijderen`; для ролі `owner` — `OWNER_NIET_WISSEN` (403).
- `POST /api/owner/session/accounts` → grant-меню + `reauthRequired`; `logout-account-everywhere` відкликає сесії, вкладки й grant'и одним викликом.

---

## 5. Стани

Візуальна дошка: `tijdelijke-bestanden\ontwerp-account-v5-staten-2026-11-04.png` (шість станів на тих самих токенах).

| Стан | Поведінка |
|---|---|
| Завантаження | скелетон рядків (не спінер на всю сторінку) |
| Помилка 401 | редірект на вхід через handoff, без втрати шляху |
| Помилка 5xx | один банер угорі, решта сторінки лишається |
| Порожньо (немає сесій) | рядок «Інших сесій немає» — не ховати групу |
| Passkey | `недоступно` + підказка «серверна перевірка ще не готова»; без кнопки |
| Step-up потрібен | модальне підтвердження, після — повтор дії; без «тихого» пропуску |
| Експорт у процесі | рядок показує «готуємо…», кнопка неактивна, без блокування сторінки |
| Видалення | для власника — **недоступно** (пояснення замість кнопки); для інших — двоступеневе: пояснення → step-up → статус «видалено, 30 днів» |

---

## 6. Адаптивність, доступність, мова

- **Реflow за контейнером, не за вікном:** `.page{container-type:inline-size}` і `@container`, бо сторінка живе і в половині вікна на ПК. Правила: ≤820 px — ховати e-mail у шапці; ≤700 px — ховати крихти, менший заголовок; ≤560 px — значення під назвою, шеврон абсолютний; ≤360 px — менші відступи й іконки. **Метрики мобільного:** бокові відступи 16 px (13 px на 320), висота рядка ≥ 64 px, іконка 36 px (34 на 320), назва 14,5 px, підказка 12,5 px, між групами 22 px, кнопка профілю 40 px на всю ширину. **Ніколи не стискати кнопку**; `min-width:0` і `overflow-wrap:anywhere` скрізь. Перевірено на 320/360/390/430 px.
- **Доступність:** `role="list"`/`listitem` для груп; `aria-current` для активної навігації; фокус-кільце `--focus` 2 px; статуси дублюються текстом, не лише кольором; контраст ≥ 3:1 (текст ≥ 4,5:1) — перевіряє `scripts/kleur-contrast-controle.mjs`.
- **Мова:** усі тексти через `account-teksten.ts` (uk/nl), без рядків у JSX. URL — нідерландські slug (`/account`, `/beveiliging`, `/sessies`), внутрішні id не змінюються.
- **Тема:** лише класи `theme-*` на `<html>`; `prefers-color-scheme` не використовувати.

---

## 7. Тести

1. **Юніт:** рендер кожного стану (loading/error/empty/disabled), словник uk+nl, відсутність заборонених рядків.
2. **Контраст:** існуючий скрипт; нові пари не додаємо.
3. **E2E (Playwright):** зміна теми; відкликання чужої сесії; спроба відкликати поточну — кнопки немає; експорт → запит створено; видалення без step-up → відмова; passkey → `недоступно`; мобільний 390 px — усі групи доступні.
4. **Регресія:** сторінка не ламає `canonical-service.js` (tabs/identity мають збігатися).

---

## 8. Критерії приймання

- AC1: на 390×844 усі сім груп доступні без горизонтального скролу.
- AC2: жодного кольору поза `tokens.css`; контраст-скрипт зелений.
- AC3: passkey ніде не показується як «підключено».
- AC4: видалення неможливе без step-up; після — 30-денний статус.
- AC5: поточна сесія не має кнопки «Завершити».
- AC6: мова перемикається без перезавантаження й зберігається за акаунтом.
- AC7: усі тексти в словнику; `grep` не знаходить українських рядків у `.tsx`.
- AC8: жодного нового маршруту понад наведені; якщо потрібен — спершу рішення в `BESLUITEN.md`.
- AC9: для ролі `owner` небезпечна зона показує пояснення «видалення недоступне», без активної кнопки.
- AC10: відкликання сесій — лише через `logout-*`; сторінка не вдає поштучного `revoke` там, де маршруту немає.

---

## 9. План робіт

| Етап | Що | Оцінка |
|---|---|---|
| 1 | Каркас + `AccountGroup`/`AccountRow` + словник | 0,5 дня |
| 2 | Профіль, Вхід, Безпека (TOTP, recovery) | 1 день |
| 3 | Сесії, Вигляд, Дані | 0,5 дня |
| 4 | Небезпечна зона + step-up | 0,5 дня |
| 5 | Тести (юніт + e2e) і контраст | 0,5 дня |
| 6 | Перевірка на 320/390/768/1280, скриншоти | 0,25 дня |

**Разом:** ≈3,25 дня одного агента. Гілка `feature/account-ui-<дата-час>`, Task ID `ACCOUNT-001`, база — актуальний `basis.bronCommit` (після оновлення на `90f0d73`).

---

## 10. Ризики й відкриті питання

1. **Форми відповідей** `account/overview` і `identity/security/sessions` треба звірити з кодом перед реалізацією — у ТЗ наведено маршрути, не поля.
2. **Passkey** лишається вимкненим; якщо колись увімкнеться — рядок стане активним без зміни верстки.
3. **`ACCOUNT_DEFINITIEF_WISSEN`** — небезпечний перемикач; у UI показувати лише як «заплановано», поки власник не підтвердить.
4. **Експорт** може бути довгим — потрібен статус, а не блокування.
5. **Поштучне відкликання сесії** маршруту не має: є `logout-current`, `logout-browser-all`, `logout-account-browser`, `logout-account-everywhere`. UI має це відображати чесно, а не малювати «Завершити» на кожному рядку.
6. **Мова** вже прив'язана до акаунта; не дублювати логіку в сторінці.

---

## 11. Прототип-код (чернетки, поза репозиторієм)

- `tijdelijke-bestanden\prototype-account\account-model.ts` — чисті маппери: `mapProfile`, `mapIdentities` (з `security/overview`), `mapRecovery`, `mapSessions`, `securitySummary`. Без імпортів — кладеться в `shared/`.
- `tijdelijke-bestanden\prototype-account\account-teksten.ts` — словник uk/nl, усі рядки включно зі станами й прогресом.

Правило: ці файли — для рев'ю; у репозиторій потрапляють лише після задачі `ACCOUNT-001` і зелених тестів.

---

## 12. Що НЕ робимо

- Не змінюємо `AGENTS.md`, `beleid.json`, `regels.lock`.
- Не додаємо таблиць і міграцій.
- Не вмикаємо passkey, GitOps чи автоматичне встановлення.
- Не чіпаємо прод до окремого підтвердження власника.
