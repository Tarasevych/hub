> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./WERKBLAD.uk.md) · [🇳🇱 **Nederlandse versie**](./WERKBLAD.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Робочий стіл · Werkblad (hub.*/overzicht)

Зона F, 22.10.2026. Українська версія — спочатку, Nederlandse versie — eronder.

---

## UA

### Що це

«Робочий стіл» — головна сторінка хаба (`/overzicht`). Це сітка блоків інтерфейсу, які читають **лише справжні дані** з уже наявних маршрутів сервера. Користувач перетягує блоки інтерфейсу, змінює їхній розмір, додає нові з каталогу, обирає фон. Розкладка зберігається **на сервері, окремо для кожної лади** (особистий простір / технічний простір) і кешується локально для миттєвого першого відмальовування.

### Архітектура

| Шар | Файл | Що робить |
|---|---|---|
| Чисті правила | `shared/werkblad-indeling.ts` | Каталог блоків інтерфейсу, тип розкладки `{v:2, items:[{tid,id,k,r,inst?}], achtergrond}`, `normaliseerWerkblad` (браузер **і** сервер), права (`toegestaan` — технічні блоки інтерфейсу лише в технічній ладі, «скоро» — ніде), `plaatsen` (розміщення без перекриттів на 12/6/1 колонках), `neerzetIndex` (куди падає перетягнутий блок інтерфейсу), перенесення старого столу (`vanBureau`) і старих блоків (`vanBlokken`), `eersteWerkblad`, `standaardWerkblad`, тексти «?» (`HELP_WERKBLAD`). |
| База | `migrations/0112_werkblad_indeling.sql` | `app.werkblad_indeling` — один рядок на `(user_id, ruimte)`, `indeling jsonb`, `achtergrond_eigen` (data-URL ≤ 400 кБ), `herkomst`, `versie`. RLS: `user_id = app.huidige_gebruiker()`; права в `migrations/rechten.sql`. |
| Сервер | `backend/werkblad.ts` | `POST /api/owner/hub/werkblad/laden · bewaren · terugzetten · tech`. Лада = `gegevensRuimteVeilig(userId, {tabContext})` — ніколи з тіла запиту. Кожен запит — `alsGebruiker()` (RLS) **плюс** явний `WHERE user_id = $1 AND ruimte = $2`. `bewaren` нормалізує для **цієї** лади, веде `versie` (старіший клієнт → 409 `WERKBLAD_VEROUDERD` + актуальний рядок). `/tech` — лише в технічній ладі з активним технічним профілем у цій вкладці (або власник): зведення з `admin-diagnostiek.overzicht()`, `uitrol-runs.runsLijst()`, `release-info` та `os` — без шляхів сервера. |
| Клієнт | `src/werkblad/Werkblad.tsx` | Оболонка: завантаження (кеш → сервер → перенесення старого при першому відкритті), режим «Налаштувати», перетягування/розмір на pointer events, клавіатура (стрілки / Shift+стрілки / Delete), кнопки «вище/нижче» на телефоні, каталог і фон у `<Venster>`. |
| | `src/werkblad/api.ts` | Маршрути + локальний кеш `localStorage['tsv:werkblad-v2:<user>:<профіль>']`. |
| | `src/werkblad/gegevens.ts` | Лоадери з кешем (60 с): повторно використовує `src/bureau/gegevens.ts` (hub/blocks/data, board/list, mijn-diensten) + історія пошуку, `/__gezondheid`, `/tech`; `useBron` (скелет/помилка/перезавантаження), `useZichtbaar` (лінива підгрузка — лише коли плитка в полі зору). |
| | `src/werkblad/widgets/*` | Вміст блоків інтерфейсу: `Start.tsx` (привітання, швидкий доступ, швидкі дії, підказка, ШІ — у головному чанку, бо формують LCP), `Post`, `Agenda`, `Taken` (завдання/нотатки/дошка), `Bestanden` (файли/сховища), `Overig` (пошуки, служби, система, технічні, старі блоки) — ліниві чанки через `React.lazy`. `Vlak.tsx` — спільні стани: скелет, порожньо, помилка з кодом, «не під'єднано → Під'єднати» з правильним посиланням, закрита лада. |
| | `src/werkblad/werkblad.css` | Лише токени `src/ontwerp/tokens.css` (жодного hex). Сітка 12/6/1, `--wb-rij: 96px`, скло-картки, фони-градієнти з токенів (`.wb-achtergrond-*`), власний фон через `--wb-eigen`. |
| Під'єднання | `src/App.tsx` | На «Огляд» — `<Werkblad>` (lazy); старі блоки на «Огляд» більше не відмальовуються окремо (вони всередині як `oud-blok` / `snelkoppeling`), на «Останні» — як раніше. |

### Сітка, телефон, планшет

- **ПК (12 колонок)**: ширина блока інтерфейсу 2…12 колонок, висота 1…6 рядів по 96 px. `plaatsen()` кладе блоки інтерфейсу по черзі на перше вільне
  місце (зліва-згори) — без перекриттів; стандартна розкладка заповнює сітку **без жодної порожньої клітинки** (юніт-тест).
- **Планшет (6 колонок, ≤ 1100 px)**: блок інтерфейсу займає половину (ширина < 8 з 12) або всю ширину (≥ 8) — спокійна двоколонкова сітка без
  «дірок» в одну колонку. Замість кнопок ± (які на планшеті нічого б не змінили) — «вище/нижче»; ручка розміру лишається.
- **Телефон (≤ 700 px)**: одна колонка в порядку списку, висота кожної плитки = її вміст (без фіксованих рядів, нічого не обрізано),
  перестановка — кнопками «вище/нижче» (≥ 44 px), ручки розміру немає, горизонтального скролу немає.
- Кількість рядків у блоці інтерфейсу рахує `regelsVoor(r, kolommen, …)` (на телефоні — 5); вузькі плитки підлаштовуються через
  container queries (`container-type: inline-size` на вмісті плитки: ховаються мітки завдань, зменшуються плитки швидкого доступу).
- **Перетягування**: під час руху змінюється лише *попередній перегляд* розміщення (`voorbeeld` → позиції в сітці), порядок у DOM —
  лише після відпускання (інакше React переносить вузол із pointer-capture і відпускання губиться). Запасний обробник на `window`
  (`pointerup`/`pointercancel`/`blur`). Після переміщення з клавіатури чи кнопками фокус лишається на тому ж елементі тієї ж плитки,
  а зміна оголошується в `aria-live`.
- **Лічильники**: блок інтерфейсу повідомляє число в заголовок плитки (`zetTeller`): непрочитані листи, відкриті завдання; ті самі числа — на
  плитках «Пошта» і «Завдання» у «Швидкому доступі».

### Стандартна розкладка (за прикладом власника)

Особистий простір (12 колонок): привітання 9×1 | **«Системна інформація» 3×2 праворуч угорі (на місці погоди)**; «Швидкий доступ» 5×3,
«Календар» 4×3, праворуч «Нещодавні пошуки» 3×3; «Пошта» 5×3, «Завдання» 4×3, праворуч «Швидкі дії» 3×2; ряд «Останні файли» /
«Хмарні сховища» / «ШІ для вас» / «Статус служб» по 3×3; унизу смуга-підказка 12×1 («Мої блоки інтерфейсу» + «Налаштувати»).
Технічний простір: привітання, «Системна інформація», «Швидкий доступ», «Сервер», «Діагностика», «Оновлення», «Статус служб»,
«Нещодавні пошуки».

### Лади (особистий / технічний простір)

Сервер визначає ладу з сесії та `tabContext` (технічна вкладка з активним профілем → `technisch`). Кожна лада має **свій рядок** і свою стандартну розкладку (`standaardWerkblad(ctx)`): особиста — привітання, швидкий доступ, календар, пошта, завдання, пошуки, швидкі дії, файли, сховища, ШІ, служби, система, підказка; технічна — привітання, швидкий доступ, сервер, оновлення, діагностика, служби, пошуки, система. Технічні блоки інтерфейсу в особистій ладі відкидає `normaliseerWerkblad` і на клієнті, і на сервері.

### Перенесення старого (F5)

Перше відкриття без рядка на сервері → `eersteWerkblad({bureau, blokken}, ctx)`:
1. старий стіл (`hub_bureau_v1`, `src/bureau/api.ts haalBureau`) має плитки → кожна стає блоком інтерфейсу (`BUREAU_NAAR_WERKBLAD`, формат і налаштування зберігаються), плюс блоки-посилання; `herkomst: 'bureau'`;
2. інакше — стандартна розкладка **плюс** старі блоки `App.tsx`, які людина **сама змінила** (`blokAangepast`: власний блок, інша
   назва/опис/адреса/розмір/подання/колір або прихований): видимі `mail/files/calendar` → блок інтерфейсу `oud-blok` (той самий `HubBlockWidget`
   з presentation/itemLimit/showMeta), блоки з https-адресою → `snelkoppeling`, перед смугою-підказкою; `herkomst: 'blokken'`.
   Шість блоків, які сервер кладе в КОЖЕН новий простір (`STANDAARD_BLOKKEN` = `backend/index.ts const defaults`, юніт-тест звіряє),
   незмінені — це не налаштування людини: їхній вміст (пошта, файли, календар) уже є блоками інтерфейсу стандарту;
3. інакше стандарт.

Приховані старі блоки **не кладуться** на стіл, але лишаються в каталозі (категорія «Старі блоки»). Старі таблиці не змінюються й не видаляються.

### Як додати блок інтерфейсу

1. `shared/werkblad-indeling.ts`: додайте id до `WerkbladWidgetId` і запис у `WERKBLAD_WIDGETS` — `titel`/`uitleg` uk+nl, `k/r/minK/minR`, `stand: 'klaar'` **лише** з реальним `bron` (маршрут має існувати в backend — юніт-тест перевіряє), `ruimtes`, за потреби `enkel`.
2. Якщо потрібні дані: лоадер у `src/werkblad/gegevens.ts` (через `viaBak`, щоб кілька плиток не били в один маршрут).
3. Компонент у `src/werkblad/widgets/` (props `WidgetProps`: `item`, `acties`, `zichtbaar`, `kolommen`, `zetTeller`, `weg`, …); кількість
   рядків — `regelsVoor(item.r, kolommen, …)`, щоб вміст поміщався у плитку без внутрішнього скролу. Стани через `Vlak.tsx`: скелет поки `!zichtbaar || bezig`, `Fout` з кодом сервера, `NietGekoppeld` з правильним посиланням, `Leeg`. Навігація — лише через `acties` (`hubTab`, `dienst`, `zoek`), ніколи `location.*` у блоці інтерфейсу.
4. `src/werkblad/Werkblad.tsx`: `WIDGET_ICOON[id]` і `case` у `Inhoud` (лінивий імпорт для важких).
5. Тести: `tests/eenheid/werkblad-indeling-20261022.test.ts` (каталог/права/перенесення), за потреби крок у `tests/e2e/hulp/stand-werkblad.ts`.
6. Жодних вигаданих логотипів: лише `src/merk/MerkLogo` (офіційні), інакше піктограма lucide.

### Погода

Погоди немає навмисно: немає дозволеного локального джерела без зовнішньої хмари. Замість неї блок інтерфейсу «Системна інформація» (`/__gezondheid`, час/пояс, онлайн, мова/тема).

### Тести

`werkblad-indeling-20261022` (69), `werkblad-routes-20261022` (28; з `run-test-rls.sh` — 29, у т.ч. RLS), `hub-bureau-20261019` (54,
оновлено рядок про App.tsx), `hulp-register` (17; `src/werkblad` тепер під сканером), `hub-agenda-notities-20261019` (64).
Стенд: `tests/e2e/hulp/stand-werkblad.ts` (`werkblad-*`: leeg, gevuld + LCP, instellen, catalogus, sleep, toetsenbord, telefoon, axe, tech).

---

## NL

### Wat het is

Het «Werkblad» is de hoofdpagina van de hub (`/overzicht`): een raster van widgets die **alleen echte gegevens** lezen uit routes die er al zijn. De gebruiker sleept widgets, wijzigt hun formaat, voegt er toe uit de catalogus en kiest een achtergrond. De indeling staat **op de server, per lade** (persoonlijke / technische ruimte) met een lokale cache voor de eerste weergave.

### Architectuur

- **Zuivere regels** — `shared/werkblad-indeling.ts`: catalogus, vorm `{v:2, items:[{tid,id,k,r,inst?}], achtergrond}`, `normaliseerWerkblad` (browser én server), rechten (`toegestaan`: technische widgets alleen in de technische lade, «binnenkort» nergens), `plaatsen` (plaatsing zonder overlap op 12/6/1 kolommen), `neerzetIndex`, overzetting van het oude bureaublad (`vanBureau`) en de oude blokken (`vanBlokken`), `eersteWerkblad`, `standaardWerkblad`, `HELP_WERKBLAD`.
- **Database** — `migrations/0112_werkblad_indeling.sql`: `app.werkblad_indeling`, één rij per `(user_id, ruimte)`, RLS op `user_id`, rechten in `migrations/rechten.sql`.
- **Server** — `backend/werkblad.ts`: `POST /api/owner/hub/werkblad/laden · bewaren · terugzetten · tech`. De lade komt uit `gegevensRuimteVeilig(userId, {tabContext})`, nooit uit het verzoek; elke query onder `alsGebruiker()` (RLS) **en** met `WHERE user_id = $1 AND ruimte = $2`; `versie` tegen stil overschrijven (409 `WERKBLAD_VEROUDERD`); `/tech` alleen in de technische lade met een actieve activering in dit tabblad (of de eigenaar).
- **Client** — `src/werkblad/Werkblad.tsx` (bediening), `api.ts` (routes + cache), `gegevens.ts` (laders, `useBron`, `useZichtbaar`), `widgets/*` (inhoud; zware widgets als `React.lazy`-chunks), `werkblad.css` (alleen tokens).
- **Aansluiting** — `src/App.tsx`: `<Werkblad>` op «Overzicht»; de oude blokken staan daar niet meer los (ze zitten erin als `oud-blok` / `snelkoppeling`).

### Een widget toevoegen

1. `shared/werkblad-indeling.ts`: id bij `WerkbladWidgetId` + record in `WERKBLAD_WIDGETS` (uk+nl, formaat, `stand: 'klaar'` alleen met een bestaande `bron`, `ruimtes`, eventueel `enkel`).
2. Zo nodig een lader in `src/werkblad/gegevens.ts` (met `viaBak`).
3. Component in `src/werkblad/widgets/` met `WidgetProps`; toestanden via `Vlak.tsx` (skelet, fout met code, «niet gekoppeld → Koppelen», leeg); navigatie alleen via `acties`.
4. `Werkblad.tsx`: `WIDGET_ICOON[id]` en een `case` in `Inhoud`.
5. Tests in `tests/eenheid/werkblad-indeling-20261022.test.ts`; eventueel een stap in `tests/e2e/hulp/stand-werkblad.ts`.
6. Geen verzonnen logo's: alleen `src/merk/MerkLogo`, anders een lucide-icoon.

### Raster

12 kolommen (pc; breedte 2…12, hoogte 1…6 rijen van 96 px), tablet 6 kolommen (halve of hele breedte), telefoon één kolom met
tegels zo hoog als hun inhoud. Slepen werkt met een voorbeeld van de plaatsen (DOM-volgorde pas bij loslaten), toetsenbord en knoppen
houden de focus vast en worden aangekondigd (aria-live). Oude blokken gaan alleen mee als de mens ze zelf veranderde
(`blokAangepast`); de zes standaardblokken van elke nieuwe werkruimte zitten al als widgets in de standaardindeling.

### Weer

Er is bewust geen weerwidget (geen externe cloud); «Systeeminformatie» neemt die plek in.
