---
name: reyestr-lohotypiv
description: Додавання чи використання будь-якого логотипа сервісу, компанії чи агента на сайті Mijn Ruimte — лише через єдиний реєстр src/merk, без ручних копій. Elk logo van een dienst, bedrijf of agent komt uit het ene merkregister src/merk, zonder eigen kopieën.
---

<!-- lang:uk -->
# Реєстр логотипів (REESTR-LOGO-001)

## Призначення

Застосовуй цю навичку щоразу, коли на сайті потрібен логотип сервісу, компанії чи агента: у меню, пошті, підключеннях, способах входу, «Макеті», на сторінках сервера. Кожен логотип береться з одного місця — `src/merk/`. Жодних власних `<svg>`/`<path>` брендів у компонентах, CSS, «Макеті» чи серверних сторінках. Правило записано в `AGENTS.md` (§3, §6).

## Як показати логотип

- React: `<Merk merk='telegram' naam='Telegram' vorm='gliefje' maat={24} />`; у списках — `MerkLogo`; для способів входу — `MethodeMerk`; у технічних панелях — `Logo` із `src/mcp-ui.tsx`.
- Сервер або перший екран (ще до завантаження частин збірки): `shared/merk-direct.ts` (`merkDirectDataUri('google' | 'telegram')`) у `<img src>`.
- Ключ бренду — через `merkSleutel()`; синоніми — у `MERK_ALIAS` (`src/merk/merk-register.ts`).

## Як додати новий офіційний знак

1. Знайти знак у вільній ліцензії (CC0/MIT, наприклад `@iconify-json/logos`). Жодних зовнішніх CDN.
2. Додати рядок у `KEUZE` у `scripts/merk-officieel-maken.mjs` (за потреби — у список `DIRECT` для першого екрана й сервера).
3. Запустити генератор: оновляться `src/merk/officieel/*.svg`, `HERKOMST.json`, `officieel-sleutels.ts`, `merk-officieel.ts`, `shared/merk-direct.ts`.
4. Якщо бренд був у великій таблиці `src/merk/merk-logos.ts` — прибрати його звідти (офіційний файл завжди має перевагу).
5. Якщо знак потрібен у «Макеті» — правити `scripts/identiteit-maquette/motor-aanpassingen.mjs` (блок ZNAKY), а не згенерований двигун.

## Порядок шарів

Власний логотип користувача → файл адміністратора → офіційний файл → форма з `merk-tabel.ts` → база логотипів → нейтральний знак → монограма.

## Власний логотип користувача

- Таблиця `app.merk_gebruiker` (міграція 0300), сервер — `backend/merk-gebruiker.ts`, вигляд — Налаштування → Теми → «Логотипи сервісів» (`src/merk/MijnLogos.tsx`).
- Діє лише для цієї людини й у її просторі (особистий чи технічний), доки вона його не видалить або не замінить. Простір визначає лише `gegevensRuimteVeilig`, ніколи тіло запиту.
- Сховище ключів увімкнено — файл зберігається лише зашифрованим (`dek1.`); ключ закрито — відповідь 423, нічого не зберігається. Журнал — без вмісту файла.

## Перевірка

- `node scripts/eenheidstests.mjs merk-een-register-20261116` — сторож ловить будь-яку копію форми логотипа поза `src/merk`.
- `merk-gebruiker-20261116` (з `DATABASE_URL`), `merk-officieel`, `merk-register`, `maquette-generator-gelijk`, `contrast-knoppen-logos-20261021`.
- Перед помітною зміною вигляду — знімки цілого екрана (ПК і телефон, світла й темна теми).

<!-- lang:nl -->
# Merkregister (REESTR-LOGO-001)

## Doel

Gebruik deze vaardigheid telkens wanneer de site een logo van een dienst, bedrijf of agent nodig heeft: menu, post, koppelingen, aanmeldmethoden, «Макет», serverpagina's. Elk logo komt uit één plaats: `src/merk/`. Geen eigen `<svg>`/`<path>` van merken in componenten, CSS, «Макет» of serverpagina's. De regel staat in `AGENTS.md` (§3, §6).

## Een logo tonen

- React: `<Merk merk='telegram' naam='Telegram' vorm='gliefje' maat={24} />`; in lijsten `MerkLogo`; voor aanmeldmethoden `MethodeMerk`; in technische panelen `Logo` uit `src/mcp-ui.tsx`.
- Server of eerste scherm: `shared/merk-direct.ts` (`merkDirectDataUri('google' | 'telegram')`) in `<img src>`.
- De merksleutel via `merkSleutel()`; synoniemen in `MERK_ALIAS`.

## Een nieuw officieel logo toevoegen

1. Logo met vrije licentie (CC0/MIT, bv. `@iconify-json/logos`); geen externe CDN.
2. Regel in `KEUZE` van `scripts/merk-officieel-maken.mjs` (zo nodig ook in `DIRECT`).
3. Generator draaien: `src/merk/officieel/*.svg`, `HERKOMST.json`, `officieel-sleutels.ts`, `merk-officieel.ts`, `shared/merk-direct.ts` worden bijgewerkt.
4. Stond het merk in de grote tabel `src/merk/merk-logos.ts`, haal het daar weg.
5. Voor «Макет»: `scripts/identiteit-maquette/motor-aanpassingen.mjs` (blok ZNAKY), niet de gegenereerde motor.

## Volgorde van de lagen

Eigen logo van de gebruiker → bestand van de beheerder → officieel bestand → vorm uit `merk-tabel.ts` → merkendatabase → neutraal teken → monogram.

## Eigen logo van de gebruiker

- `app.merk_gebruiker` (migratie 0300), `backend/merk-gebruiker.ts`, Instellingen → Thema's → «Logo's van diensten».
- Geldt alleen voor die persoon en in diens ruimte, tot het gewist of vervangen wordt; de ruimte komt alleen uit `gegevensRuimteVeilig`.
- Sleutelkluis aan → alleen versleuteld (`dek1.`); sleutel dicht → 423, niets bewaard. Journaal zonder bestandsinhoud.

## Controle

- `merk-een-register-20261116` (bewaker tegen kopieën), `merk-gebruiker-20261116`, `merk-officieel`, `merk-register`, `maquette-generator-gelijk`, `contrast-knoppen-logos-20261021`.
- Vóór een zichtbare wijziging: schermafdrukken van het hele scherm (pc en telefoon, licht en donker).
