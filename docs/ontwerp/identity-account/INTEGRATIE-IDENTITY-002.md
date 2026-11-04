# Інтеграція сторінки акаунта в застосунок — IDENTITY-002

Чернетка задачі для наступного випуску. Складена за фактами репозиторію (посилання на файли й маршрути перевірені), без припущень про те, чого в коді немає.

## 1. Що вже є в застосунку

| Потрібно за дизайном | Що вже існує | Де |
|---|---|---|
| 12 сторінок категорії `identity` | перелік у моделі меню | `shared/menu-model.ts:23` — `personalization, menu, themes, languages, widgets, sharing, identity, account, sessions, methods, security, recovery` |
| Знімок доступу для методів, TOTP, recovery, паски, коди | `POST /api/owner/access/snapshot` | `src/ToegangslaagWeergave.tsx:81` |
| Фото акаунта | `POST /api/owner/profile/photo` з попереднім стисненням до 512 px | `src/App.tsx` (`changeProfilePhoto`) |
| Passkey | `/api/owner/access/passkeys/{lijst,registreren,registreren/opties,hernoemen,verwijderen,goedkeuring/*}` | `backend` |
| TOTP | `/api/owner/access/totp/{start,confirm,disable}` | `backend` |
| Коди відновлення | `/api/owner/access/recovery/{overzicht,rotate,intrekken,bekeken}` | `backend` |
| Надані доступи (sharing) | `/api/owner/access/toegangscodes/{lijst,maken,wijzigen,intrekken}`, `/api/owner/access/gast-sessies/{lijst,intrekken}` | `backend` |
| Прив'язка методів | `/api/owner/access/method/{unbind,herstel}`, `/api/owner/access/binding/unbind`, `.../password/{set,remove}`, `.../phone/save` | `backend` |
| Крок-вгору (step-up) | `/api/owner/access/stap-op/*` + `bevestigToegang` | `src/beveiliging/Beveiliging.tsx`, `src/ToegangslaagWeergave.tsx:126` |
| Мова, меню, тема | `POST /api/owner/ui/preferences/save` | `src/App.tsx` (`changeLanguage`) |
| Сесії браузера | `POST /api/owner/session/accounts`, `.../logout-browser-all`, `.../logout-account-browser` | `src/App.tsx` |

Висновок: **даних і маршрутів достатньо**, нових таблиць не потрібно. Бракує не API, а одного екрана й навігації.

## 2. Головна перешкода: меню зараз перемикає сторінки

`MENU_PAGINAS.identity` дає 12 окремих пунктів, а `src/CanoniekOmlijsting.tsx` будує з них навігацію. Вимога власника — одна сторінка з прокруткою. Тому інтеграція — це не «перенести 12 компонентів», а змінити модель переходу для `identity`:

1. У `shared/menu-model.ts` додати ознаку, що сторінки `identity` живуть на одній сторінці (наприклад, `SCROLL_GROEPEN = { identity: [...] }`), не ламаючи інші служби.
2. У `CanoniekOmlijsting.tsx` для такої групи: клік → `scrollIntoView` до `#identity/<pagina>` замість зміни маршруту; активний пункт — за scroll-spy (`IntersectionObserver`).
3. Пряме посилання `#identity/themes` має відкривати ту саму сторінку й прокручувати до розділу (сумісність зі старими посиланнями).

Це єдина зміна, яка торкається спільного коду; решта — нові файли.

## 3. Запропонована структура

```
src/identity/
  IdentityAccountPagina.tsx    один екран: 12 секцій, меню-зміст, scroll-spy
  secties/                     по одному файлу на секцію (12)
  FotoDialoog.tsx              пристрій / сервіс / посилання, прев'ю, «Застосувати»
  identity-account.css         токени, container queries, 320–430 px
  identity-account.test.ts     меню, scroll-spy, діалог, повернення ініціалів
```

Правила з ТЗ, які легко зламати під час перенесення:

- кнопки на ≤ 640 px — на всю ширину й однакові; бейджі компактні;
- reflow за контейнером (`@container`), а не за вікном: сторінка живе всередині канонічного обрамлення;
- смітничок фото — 24 px у куті, камера в центрі не перекривається;
- логотипи Google/Microsoft/Apple — справжні, іконки — lucide, жодних текстових гліфів;
- жодного нового запису в базу: все через `access/snapshot` і наявні `POST`.

## 4. Межі, щоб не перетнути чужі роботи

- **Не чіпати** `src/accountmenu-v2/*` (це LOGIN-001) і `src/App.tsx`, крім одного місця, де сторінка монтується.
- **Не змінювати** `src/ToegangslaagWeergave.tsx` і `src/beveiliging/Beveiliging.tsx` доти, доки нова сторінка не покриє їхні дії; після покриття — або лишити старі маршрути як редирект, або видалити окремим рішенням власника.
- **Не послаблювати** крок-вгору: кожна чутлива дія (`recovery/rotate`, `passkeys/verwijderen`, `toegangscodes/maken`) проходить через `bevestigToegang`, як зараз.
- Гілка від **встановленого** прода, не від цієї: після встановлення `20261104-154114` базою стане він.

## 5. Критерії приймання

1. 12 секцій на одній сторінці; меню прокручує, не перемикає; scroll-spy підсвічує активну.
2. `#identity/<pagina>` відкриває потрібну секцію; переходи `#svc/…` поводяться як раніше.
3. Ширини 320/360/390/430 px: кнопки на всю ширину, без горизонтального скролу, бейджі не розтягуються.
4. Фото: три джерела, прев'ю, «Застосувати», смітничок 24 px повертає ініціали; на сервер іде стиснене зображення.
5. `npm run typecheck:server`, `npm run orch:controleer`, `npm run orch:test` — зелені; є юніт-тести на меню/scroll-spy/діалог.
6. Контраст: `npm run build` містить `kleur-contrast-controle` — без нових порушень.

## 6. Шлях випуску

1. `node scripts/orch.mjs taak-start --id IDENTITY-002 --agent claude --basis <коміт встановленого прода> --tak feature/identity-account-20261105-090000`.
2. Робота в `src/identity/*`, тести, `typecheck:server`.
3. Журнал `orchestratie/ontwikkelarchieven/IDENTITY-002.json` **з блоком `privacy`** (без нього сайт відхиляє пакет — це вже перевірено на `20261104-153759`).
4. Пакет + GitHub Release з тим самим SHA-256, `UITROL-BASIS` = встановлена версія.
5. Встановлення — лише passkey-рішенням власника.

## 7. Відомі ризики

- `App.tsx` — 74 КБ щільного коду; монтаж сторінки робити одним малим патчем, інакше конфлікти з іншими гілками.
- Пункти меню `identity` використовуються ще в `shared/uiterlijk.ts` і `shared/werkblad-register.ts` — зміну моделі треба перевірити там само.
- `identity` має акцент `grijs` у `DIENST_ACCENT`; палітри Grifel/Puur/Violet/Kleur мають лишитися сумісними з ним.
