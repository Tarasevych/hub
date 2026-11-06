> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./TZ-account-2026-11-04.uk.md) · [🇳🇱 **Nederlandse versie**](./TZ-account-2026-11-04.nl.md) · [🏠 Головна (UK)](../../../README.md) · [🏠 Hoofdpagina (NL)](../../../LEESMIJ.md) · [📚 Каталог статей / Index](../../INDEX.md)

# ТЗ: сторінка керування обліковим записом (`TZ-account-2026-11-04.uk.md`)

**Дата:** 2026-11-04 (оновлено після реалізації `IDENTITY-002` та аудиту 2026-11-05)
**Живий прототип:** [`identity-live.html`](./identity-live.html)
**Реалізація в застосунку:** `src/identity/IdentityAccountPagina.tsx`, `src/identity/Profielfoto.tsx`, `src/identity/identity-account.css`, `src/identity/identity-tabs.ts`
**Дизайн-джерело:** `src/ontwerp/tokens.css` (лише токени, без сторонніх hex-кольорів)

---

## 1. Мета й межі

**Мета:** єдина сторінка категорії `identity`, де власник і користувачі бачать та змінюють усі 12 розділів облікового запису: персоналізацію, меню, теми, мови, віджети, спільний доступ, ідентичності, профіль і дані, сесії та пристрої, способи входу, безпеку та відновлення доступу.

**У межах:** єдиний екран `src/identity/IdentityAccountPagina.tsx` із меню-змістом (`.ia-toc`), компонент фото профілю `src/identity/Profielfoto.tsx` з трьома джерелами, двомовні підписи (`uk`/`nl`) та юніт-тести (`tests/eenheid/identity-account-ui.test.ts`).
**Поза межами:** зміна серверних політик автентифікації, нові таблиці БД, примусове видалення облікового запису власника (`OWNER_NIET_WISSEN`).

---

## 2. Структура екрана та 12 розділів

Усі 12 розділів `IDENTITY_TABS` (`src/identity/identity-tabs.ts`) відображаються послідовно на одній сторінці:

| # | Ідентифікатор | Заголовок (🇺🇦 UK) | Заголовок (🇳🇱 NL) |
|---|---|---|---|
| 1 | `personalization` | Персоналізація | Personalisatie |
| 2 | `menu` | Меню | Menu |
| 3 | `themes` | Теми | Thema’s |
| 4 | `languages` | Мови | Talen |
| 5 | `widgets` | Віджети | Widgets |
| 6 | `sharing` | Спільний доступ | Delen |
| 7 | `identity` | Ідентичності | Identiteiten |
| 8 | `account` | Акаунт і дані | Account en gegevens |
| 9 | `sessions` | Сесії та пристрої | Sessies en apparaten |
| 10 | `methods` | Способи входу | Aanmeldmethoden |
| 11 | `security` | Безпека | Beveiliging |
| 12 | `recovery` | Відновлення доступу | Toegangsherstel |

---

## 3. Компоненти та аудит виправлень (05.11.2026)

1. **Меню-зміст (`.ia-toc`) та секції (`.ia-sectie`):**
   - `.ia-toc` має `position: sticky; top: 70px;` (`top: 62px;` на екранах `≤ 700px`), щоб не заїжджати під фіксовану верхню шапку (`.app-header`).
   - `.ia-sectie` має `scroll-margin-top: 170px;` (`150px` на `≤ 700px`), щоб під час прокрутки заголовок секції не перекривався ні шапкою, ні sticky меню-змістом.
2. **Аватар і діалог фото (`Profielfoto.tsx`):**
   - Іконка камери `.ia-avatar-camera` (`22×22 px`) розташована по центру аватара (`top: 50%; left: 50%; transform: translate(-50%, -50%)`).
   - Кнопка смітничка `.ia-avatar-prullenbak` (`24×24 px`) винесена в правий верхній кут (`top: -6px; right: -6px`) і не перекриває камеру.
   - Модальне вікно вибору фото `.ia-dialoog-achtergrond` має `z-index: 99500` (вище за `.app-header` із `z-index: 99000`) та верхній відступ `max(var(--ruimte-4), calc(76px + env(safe-area-inset-top, 0px)))`.
   - Діалог підтримує 3 джерела: **Пристрій** (JPEG/PNG/WebP), **Сервіс** (поточне фото провайдера входу) та **Посилання** (`https://`).

---

## 4. Дані та серверні маршрути API

| Розділ | Серверний маршрут | Примітка |
|---|---|---|
| Профіль та огляд акаунта | `POST /api/account/overview` | Авторитетне джерело профілю й просторів |
| Активна сесія | `GET /api/owner/session/who` | Перевірка поточної сесії |
| Способи входу та ідентичності | `POST /api/security/overview`, `GET /api/auth/methods` | Реальні прив'язані ідентичності та каталог провайдерів |
| Двоетапна перевірка (TOTP) | `POST /api/owner/access/totp/start`, `/confirm`, `/disable` | Потребує `TOTP_ENCRYPTION_KEY_V1` |
| Коди відновлення | `POST /api/owner/access/recovery/overzicht`, `/rotate`, `/intrekken` | Маскований огляд та ротація зі step-up |
| Сесії браузера | `POST /api/owner/session/accounts`, `POST /api/owner/session/logout-*` | Поштучне керування групою сесій |
| Експорт даних | `POST /api/owner/privacy/export` | Повний архів даних зі step-up |
| Видалення акаунта | `POST /api/owner/identity/account/delete` | 30 днів відновлення; власнику заборонено (`OWNER_NIET_WISSEN`) |

---

## 5. Критерії приймання та перевірка

- Усі 12 секцій доступні на одній сторінці на ширинах 320–1440 px без горизонтального прокручування (`@container ia-account`).
- Жодного кольору поза `src/ontwerp/tokens.css`; `node scripts/kleur-contrast-controle.mjs` та `node scripts/plaatsing-controle.mjs` проходять без помилок.
- Юніт-тести `node scripts/eenheidstests.mjs identity-account-ui.test.ts` підтверджують усі 6 інваріантів.
