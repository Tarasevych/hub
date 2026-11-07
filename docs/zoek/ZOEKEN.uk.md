> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./ZOEKEN.md)) · [🇳🇱 **Nederlandse versie**](./ZOEKEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Глобальний пошук «/zoek» — архітектура, індекс, API, ранжування

Стан: 22.10.2026 (випуск «zoek-kern-2»).
Супутні документи в цій теці: [`ZOEK-BEVEILIGING.uk.md`](./ZOEK-BEVEILIGING.uk.md) (ізоляція й безпека), [`ZOEK-BEHEER.uk.md`](./ZOEK-BEHEER.uk.md) (моніторинг, відновлення, міграції,
розгортання, повернення стану, продуктивність), [`ZOEK-UITBREIDEN.uk.md`](./ZOEK-UITBREIDEN.uk.md) (як додати нове джерело або тип об'єкта), [`ZOEK-TESTEN.uk.md`](./ZOEK-TESTEN.uk.md) (тести, набір оцінки).

## 1. Що це і що воно робить

Сторінка `hub.<домен>/zoek` (меню «Пошук») — один пошук по всьому, що доступне людині в її поточному просторі:

| Група | Джерела (`bron`) | Звідки береться |
|---|---|---|
| Інтерфейс сайту | `pagina`, `ui`, `instelling`, `hulp` | каталог інтерфейсу `backend/zoek/catalogus-ui.ts`: сторінки/вкладки (`shared/menu-model.ts`, `src/dienst-tab-labels.ts`), кнопки/заголовки/діалоги (`shared/zoek-ui-knoppen.generated.ts`, генерується з `src/**/*.tsx` скриптом `scripts/zoek-ui-catalogus.mjs`), налаштування з поясненням «?» (`shared/hulp-register.ts`), права ШІ (`shared/connector-v2/catalogus.ts`), інтеграції (`shared/integraties-catalogus.ts`, `shared/mail-aanbieders.ts`) |
| Пошта | `mail`, `bijlage` | проєкція `mail_items_v1` (Gmail REST; IMAP — див. обмеження), вкладення через Gmail API → витяг тексту Z3 |
| Файли | `cloud`, `drive` | власне сховище `cloud_items_v1` + `storage`, Google Drive (проєкція + експорт) |
| Календар | `agenda` | Google Calendar (проєкція), ICS/CalDAV (`app.agenda_externe_gebeurtenis`) |
| Дошка | `bord` | `app.mcp_console_items` (задачі, нотатки) |
| GitHub | `github` | репозиторії (≤60), README, issues/PR |
| Контакти, пристрої | `contact`, `apparaat` | зарезервовано в моделі; на 22.10.2026 **не індексуються** |

Користувач може не знати назви функції: працюють точні збіги, префікси (автодоповнення), повний текст, нормалізація (регістр,
діакритика, кирилиця ↔ латиниця), легка морфологія, нечіткий пошук (trigram, помилки 1–2 літери), синоніми й міжмовні
відповідники (uk, ru, nl, en, de, fr, pl, ro, bg), суржик/трансліт (`poshta`, «настройки почти»), опис призначення кнопки.
Кожна картка результату пояснює, **чому** вона знайдена (`uitleg`), показує шлях, фрагмент із підсвіткою, відсоток відповідності
(0–100, методика нижче) і безпечний перехід (`route`: лише хост служби + шлях, ніколи довільний URL).

## 2. Архітектура (шари)

```
браузер  src/zoek/ZoekPagina.tsx (+ ZoekVeld, ZoekKaart, ZoekFilters, zoek-api.ts, zoek-logica.ts, zoek-kern.ts)
   │  POST /api/owner/zoek            {q, bronnen, soorten, formaten, talen, sinds, tot, sorteer, pagina, perPagina, facets}
   │  POST /api/owner/zoek/suggesties {prefix, bronnen}
   │  POST /api/owner/zoek/stand      → стан кожного джерела
   │  POST /api/owner/zoek/geschiedenis/{lijst,open,bewaren,wis,wis-alles}
   ▼
сесія власника (backend/index.ts, ownerRequireSession) → ідентичність ЛИШЕ з сервера
   ▼
брама просторів (backend/ruimte-projecties.ts → projectieLaden / gegevensRuimteVeilig): для кожної служби — лада {userId, ruimte}
   │  закрита служба → її джерела не шукаються і перелічені у `gesloten` з поясненням uk/nl
   ▼
ядро (backend/zoek-index.ts): zoek(lade, vraag) / zoekInLaden(...) / suggesties(...) — один SQL на ладу, під alsGebruiker()
   ▼
PostgreSQL 16: app.zoek_objecten (FTS simple + стемер + trigram, GIN), RLS 0094, app.zoek_geschiedenis (0103), app.zoek_bron_stand
   ▲
індексація (backend/zoek/bronnen.ts + adapters.ts + wachtrij.ts): черга app.zoek_wachtrij, cron `zoek-index` (cron.json / systemd-timer),
   витяг тексту й OCR (backend/zoek/tekst-extractie.ts, tekst-kern.ts у worker_thread, ocr-engines.ts), архіви (archief.ts),
   маскування секретів (shared/geheim-patronen.ts) ПЕРЕД записом в індекс
```

Принципи:
- **Один індекс** (`app.zoek_objecten`) для всіх джерел; таблиця `app.zoek_document` (0096) застаріла й не використовується.
- **Лада з сервера.** `userId` + `ruimte` ніколи не читаються з тіла запиту. Брама — та сама, що для пошти/хмари/календаря.
- **Нічого не сканується під час пошуку.** Пошук читає лише індекс; OCR, архіви й обхід джерел — у фоновій черзі.
- **Без зовнішніх сервісів.** Усе на сервері власника: PostgreSQL (`pg_trgm`, `unaccent`, вбудовані стемери), Node, за бажанням `tesseract`.
- **Fallback.** Якщо для лади індекс порожній (`aantalInLade = 0`, напр. перший запуск до cron), `/api/owner/global-search`
  повертає результати з пам'яті (як до 22.10.2026) і `bron:'live'`, `index:false`; `/api/owner/zoek` чесно показує стан джерел «індексується».

## 3. Схема індексу (`migrations/0100_zoek_kern.sql` розширює 0093)

| Колонка | Тип | Призначення |
|---|---|---|
| `user_id`, `ruimte` | text NOT NULL | лада; CHECK `ruimte IN ('prive','technisch')`; RLS 0094: `user_id = app.huidige_gebruiker()` для ролі `mijnruimte_app` |
| `bron` | text `~ '^[a-z_]{2,32}$'` | джерело (`ZOEK_BRONNEN` у `shared/zoek-model.ts`) |
| `bron_id` | text ≤700 | стабільний id у джерелі (id листа, файла, `pagina:mail/inbox`, `hulp:tech.duur` …) |
| `soort`, `formaat`, `taal` | text | тип (`ZOEK_SOORTEN`), формат файла (фасет), мова вмісту (`uk ru nl en de fr pl ro bg` або `''`) |
| `titel`, `titels` (jsonb) | text | канонічна назва + назви за мовами (uk/nl для інтерфейсу); усі форми — вага A |
| `omschrijving` | text | що робить кнопка/сторінка; вага C |
| `tekst` | text ≤200 000 | повний текст (лист, документ, OCR); вага D |
| `trefwoorden` | text | ключові слова/альтернативні назви, з'єднані ` ; `; вага B |
| `pad`, `route` (jsonb) | | шлях для картки («Налаштування › Мови»); безпечний перехід `{host, pad, hash?, params?}` |
| `extra` (jsonb ≤8 KiB) | | метадані (відправник, MIME, розмір, repo, сторінка PDF …). **Без секретів** |
| `versie` | text | sha256 вмісту або версія джерела → повторна індексація незміненого об'єкта пропускається |
| `titel_norm`, `trefwoorden_norm`, `omschrijving_norm`, `tekst_norm`, `stam_norm` | text | нормалізовані форми, **обчислені в Node** (`zoekNorm`, `lichteStam`) — SQL-функція `app.zoek_norm` з 0093 видалена, бо ламалась при `datctype = C` |
| `zoek_vector` | tsvector GENERATED | `simple` по `*_norm` з вагами A/B/C/D |
| `zoek_stam` | tsvector GENERATED | стемер PostgreSQL за `taal` (dutch, english, german, french, romanian, russian) по оригінальному тексту; для uk/bg/pl — `simple` по `stam_norm` |
| `aangemaakt_op`, `bijgewerkt_op` | timestamptz | дати джерела (свіжість — допоміжний сигнал) |

Індекси: GIN(`zoek_vector`), GIN(`zoek_stam`), GIN trigram(`titel_norm`), btree(`user_id`,`ruimte`,`bron`,`bijgewerkt_op DESC`).
Унікальність: `(user_id, ruimte, bron, bron_id)`.

Супутні таблиці: `app.zoek_bron_stand` (стан джерела на ладу: `niet_gekoppeld | indexeert | gedeeltelijk | fout | klaar`, `voortgang` 0–100,
`documenten`, остання спроба/успіх/помилка), `app.zoek_wachtrij` (черга індексації: `wachtend/bezig/klaar/fout/geannuleerd`, lease,
експоненційні повтори), `app.zoek_ocr_tekst` (0102: OCR-кеш **по користувачу й простору**), `app.zoek_geschiedenis` (0103: історія на
ладу — лише `(bron,id)` знайденого, без назв/тексту), `app.zoek_synoniemen_eigenaar` (словник власника, без UI на 22.10.2026).

## 4. API (контракт `scratchpad/zoek-API.md` → код `shared/zoek-model.ts`)

Усі маршрути — POST, JSON, сесія власника; у тілі обов'язкові `service` і `tabContext` (як у всіх owner-маршрутах; без них 403
`OWNER_SESSION_CONTEXT_REQUIRED`).

### `POST /api/owner/zoek` — тіло `ZoekVraag`
`{ q, bronnen?, soorten?, formaten?, talen?, sinds?, tot?, sorteer?: 'relevantie'|'nieuwste'|'oudste'|'titel', pagina? (1…), perPagina? (1–100, типово 20), vaag? (true), synoniemen? (true), facets? (true) }`
Відповідь `ZoekAntwoord` + `gesloten: ProjectieGesloten[]` + `laden: {bron → ruimte}`:
`{ q, qNorm, items: ZoekTreffer[], facets?: {bron, soort, formaat, taal → count}, suggesties: ZoekSuggestie[], totaal, pagina, perPagina, bron: 'index'|'live', duurMs, versie: 'zoek-kern-2' }`
`ZoekTreffer = { id, bron, soort, titel, titels, omschrijving, pad, route, taal, formaat, bijgewerktOp, extra, integratie, score, percent (0–100), uitleg: [{code, uk, nl}], fragment: {tekst, bron, posities:[[van,tot]]} }`.
Невідомі значення фільтрів (`bronnen:['*']`, `sorteer:'user_id'`) відкидаються або дають 400 — ніколи не розширюють вибірку.

### `POST /api/owner/zoek/suggesties` — `{ prefix, bronnen? }` → `{ suggesties: ZoekSuggestie[] }`
`ZoekSuggestie = { soort: 'aanvulling'|'functie'|'pagina'|'categorie'|'correctie'|'synoniem', tekst, label?, bron?, id?, route?, aantal? }`.
Джерела підказок — лише лада користувача (завершення слів із `titel_norm`, функції/сторінки, категорії з лічильниками,
виправлення через `similarity` по словах лади + вбудовані синоніми). Виправлення **не підміняє** запит: UI показує «Можливо, ви мали на увазі» і дозволяє обидва.

### `POST /api/owner/zoek/stand` → `{ standen: ZoekBronStand[], gesloten }`
`ZoekBronStand = { bron, stand, voortgang, aantal (реальний count), laatsteOk, laatstePoging, fout, versie, bijgewerktOp }`.

### `POST /api/owner/zoek/geschiedenis/lijst|open|bewaren|wis|wis-alles` (Z4, 0103)
Запис історії: запит, нормалізований запит, фільтри, дата, версії алгоритму/індексу, `(bron,id)` знайденого (≤200), `totaal`, стан
`vers|verouderd|vernieuwd|fout`. При повторному відкритті клієнт повторює запит і сервер повертає `nieuw`/`weg` (нові / зниклі) —
без дублів, дата оновлюється. Назв і текстів у таблиці немає.

### `POST /api/owner/zoek/index/starten|stand|stoppen|geschiedenis` (зона D, технічний профіль)
Ручна повна/часткова індексація власних лад із живим ходом — див. `ZOEK-BEHEER.uk.md` §5. Лише з активною технічною активацією вкладки
(`backend/tech-profiel.ts` → `actieveActivatie`), інакше `403 ZOEK_INDEX_TECH_PROFIEL_VEREIST`.

### `POST /api/owner/global-search` (старий маршрут; також інструмент ШІ `site_search`)
Та сама форма відповіді, що раніше (`groups[{source, items[{id, title, subtitle, excerpt, relevance …}]}]`), тепер поверх індексу
(`mode:'zoek_kern_2'`); fallback у пам'ять, якщо індекс лади порожній (`index:false`).

## 5. Нормалізація, мови, синоніми (`shared/zoek-normalisatie.ts`, `shared/zoek-synoniemen.ts`)

- `zoekNorm(s)`: NFC → нижній регістр → кирилиця uk/ru/bg → латиниця (одна таблиця: х→kh, г→g, и→y, і→i, ї→yi, є→ye, щ→shch, ю→yu,
  я→ya; ь/'/апостроф → ∅) → ł/ß/ø/æ/œ/đ/ı → NFKD без діакритики → лише `\p{L}\p{N}@._-` → одинарні пробіли. Без фонетичного
  згортання (`Jan de Wijk` лишається `jan de wijk`). Однакова на сервері й у клієнті.
- `zoekTokens(s)`: унікальні токени ≥2 символів (розбиває і на `-_.@`), ≤12. Стоп-слова прибираються лише коли лишаються інші токени.
- `varianten(token)` (лише для **запиту**): суржик/трансліт — `y↔i`, `kh↔h`, `g↔h`, `ts↔c`, `ye↔e`, `yi↔i`, `iu↔yu`, `ia↔ya`, `w↔v`,
  `j↔y`, `shch↔sch↔sht`, `ii→i`; до 8 варіантів, кожен — OR-альтернатива з префіксом `:*`.
- `lichteStam(token)`: закритий список суфіксів (uk/ru/bg/pl у латинському записі: `-amy -ami -akh -iv -oyu -ovi -ykh -ymy -oho -omu
  -ty -la -sia …`, однолітерні `-a -y -i -u -o -e` для слів ≥5). **Межі**: немає чергування основ (кінь/коня), префіксів, словника.
  Для nl/en/de/fr/ro/ru працює справжній стемер PostgreSQL (`zoek_stam`).
- `taalRaden(s)`: кирилиця (і/ї/є/ґ → uk; и/е → ru; ' без и → bg), латиниця — голосування по стоп-словах nl/en/de/fr/pl/ro.
- Синоніми: `SYNONIEM_GROEPEN` ≥120 груп `{canoniek, taal:'multi', domein, synoniemen[]}` з членами 9 мовами («пошта/почта/mail/e-mail/
  post/courrier/poczta/poștă/поща», «налаштування/settings/instellingen/Einstellungen/paramètres/ustawienia/setări/настройки» …).
  У tsquery синоніми йдуть **без** префікса `:*` (щоб `post` не ловив `postcode`); літеральні токени запиту й їхні варіанти — з префіксом.
  Ідентифікатори, імена файлів і назви продуктів (`mijn-ruimte`, `passkey`, `Claude`) не перекладаються.
- Словник власника: `app.zoek_synoniemen_eigenaar` (RLS; `eigenSynoniemen(lade)`, `eigenSynoniemZetten`) додається до вбудованого на
  час запиту. **Як розширити вбудований словник**: додати групу в `SYNONIEM_GROEPEN` (`canoniek` — латиницею, члени всіма потрібними
  мовами, кирилицю лишати як є — нормалізація зробить латиницю), прогнати `zoek-kern-*` (перевіряє відсутність небажаних злиттів).

## 6. Ранжування і «Відповідність запиту» (`shared/zoek-rangschikking.ts` + SQL у `backend/zoek-index.ts`)

```
score = dekking² · ( 1.0·rank_simple + 0.6·rank_stam )            rank_* = ts_rank_cd(ваги {D:0.1, C:0.3, B:0.6, A:1.0}, …, 32) ∈ [0,1)
      + 3.0·exacte_titel + 1.2·volledige_zin + 0.6·voorvoegsel + 0.5·titelwoorden
      + 0.3·handeling   (soort ∈ ACTIE_SOORTEN і запит ≤ 3 токенів: «змінити мову» → налаштування вище за лист)
      + 0.08·exp(−вік/90 днів)                                       (свіжість — допоміжна)
      + 0.5·vaag·(word_similarity(q, titel_norm) − 0.6)⁺             лише якщо FTS не спрацював (нечіткі рядки без dekking)
dekking = частка OR-груп запиту, присутніх у zoek_vector; рядки з dekking < ½ відкидаються, якщо груп ≥ 2
percent = round(100 · (score / max_score_у_цьому_пошуку)^0.75), мінімум 1
```
Отже: точна назва > повна фраза > префікс > слова в назві > текст > синонім/нормалізація > нечіткий збіг; свіжість лише розводить
рівні. Відсоток — монотонна нормалізація до найкращого результату **в межах одного пошуку** (у найкращого завжди 100), однакова
для всіх джерел; не випадкова й не «вірогідність». `uitleg[]` формується з тих самих сигналів (SQL повертає exacte_titel /
volledige_zin / voorvoegsel / titelwoorden / dekking / rank_* / vaag / handeling / vers; Node додає synoniem / vertaling / translit).
Сортування `relevantie`: `score DESC, bijgewerkt_op DESC`; `nieuwste/oudste/titel` — за відповідною колонкою.

## 7. Індексація, кеш, затримки

- **Первинна**: cron `zoek-index` (запис у `cron.json`; systemd-таймер `mijn-ruimte-zoek-index.timer`) кожні 5 хв: для кожного
  approved-користувача й кожної лади, що відкрита брамою, — виявити джерела (`koppelFeit`), поставити повний скан у чергу, якщо
  останній успіх старіший за 15 хв або версія джерела змінилась; обробити N елементів черги (ліміт на запуск, `FOR UPDATE SKIP LOCKED`,
  lease 5 хв, повтори 30 с → 6 год, ≤6 спроб; незворотні помилки — без повторів). Каталог інтерфейсу індексується на ладу з версією
  `ui-<hash>`: змінився код UI → лише змінені об'єкти перезаписуються.
- **Інкрементальна**: створення/зміна → upsert за `versie` (sha256 вмісту або версія джерела; незмінене пропускається); видалення →
  `verwijder`; вимкнення служби/відкликання інтеграції → `verwijderBron` + стан `niet_gekoppeld`; повторна авторизація → повний скан.
- **Між перезапусками** індекс зберігається в PostgreSQL; пошук ніколи не читає джерела.
- **OCR** — окремі задачі черги (`soort:'ocr'`), ≤1 паралельно на процес, кеш `app.zoek_ocr_tekst` по (user_id, ruimte, sha256, сторінка,
  двигун, мови): незмінений документ не розпізнається вдруге.
- **Затримки (реальні, не обіцянки)**: нова сторінка/кнопка — після розгортання + перший cron (≤5 хв); лист/файл/подія — наступний cron після
  появи в проєкції (проєкції оновлюються власними синхронізаціями: пошта push/пул, Drive/Calendar — свої таймери), тобто типово 5–20 хв;
  вкладення/OCR — залежно від довжини черги (один документ ≤ 60 с на витяг + ≤45 с на сторінку OCR); GitHub — до 15 хв + ліміти API.
  Стан і час останнього оновлення кожного джерела — `/api/owner/zoek/stand` і панель «Стан джерел» на сторінці.

## 7a. Інтерфейс `/zoek` (Z4 + зона D, 22.10.2026)

- **Картки** (`src/zoek/ZoekKaart.tsx`): кольорова плитка-піктограма за джерелом (токени: інтерфейс/налаштування — info, пошта — ok,
  файли — accent, календар — warn, GitHub — нейтральна, дошка — змішана), для листа — фото/логотип відправника (`src/afzenders/AfzenderFoto`
  → `app.afzender_beeld`, як у пошті; без зображення — ініціали), для файла — формат у плитці (PDF, DOCX…), для GitHub/Drive — офіційний
  логотип із `src/merk` (ніколи власний малюнок). Далі: назва (посилання на справжній маршрут), джерело › шлях, фрагмент з підсвіткою
  позицій сервера, теги, дата, «Відповідність N%», дія за типом, «Чому релевантно».
- **Упорядкування** «За релевантністю» / «За джерелами»: друге групує результати за категоріями з заголовком-розділювачем (піктограма, назва,
  лічильник) у сталому порядку категорій (`groepeerPerCategorie`, `src/zoek/zoek-logica.ts`); порядок усередині групи — як дав сервер.
- **Список / сітка**: перемикач у смузі результатів; сітка = плитки (вертикальні картки, `.zk-lijst.is-raster`), на телефоні одна колонка.
  Вибір зберігається лише в цьому браузері (`localStorage`, `mr.zoek.weergave.v1`) — зручність, не дані.
- **Чипи категорій і фільтри** показують лічильники з фасетів сервера (жодних вигаданих чисел); «Останні пошуки» — рядки зі стрілкою,
  запитом і відносним часом («2 год тому», «вчора»; старше 7 днів — дата).
- **Технічний профіль**: смужка «Ви шукаєте в технічному просторі…» з посиланням на пошук в особистому просторі (нова вкладка), у
  «Стані джерел» біля кожного джерела — лада (особистий/технічний), кнопка «Індексація…» → плаваюче вікно ручної індексації
  (`ZOEK-BEHEER.uk.md` §5). Для звичайного користувача нічого з цього не показується.
- Більше двох недоступних у цьому просторі служб (у технічному профілі без вибору — сім) — один згортуваний блок «Недоступні в цьому
  просторі служби (N): …», усередині ті самі пояснення з кнопкою, що й на всьому сайті (`RuimteGeslotenVlak`).
- Фільтри на телефоні/планшеті (≤ 900 px) — нижній аркуш (`role=dialog`, `aria-modal`). Він живе в робочій області, а меню сайту
  (рейка/док), кнопки вгорі праворуч і «нагору» лежать у шарі вище; тому, поки аркуш відкритий, меню й «нагору» приховані, а аркуш
  починається під верхньою смугою (на 768 px прапорці раніше лежали під рейкою меню і не натискались).
- Темна тема — через токени (`src/ontwerp/tokens.css`), 390 px без горизонтального скролу, tap ≥ 44 px; axe 0 на сторінці й у вікні
  (стенд `zoek-axe`, `zoek-index-venster`).
- Мініатюри зображень/файлів у картках **не** показуються: у хмарі немає маршруту мініатюр, а відкривати байти файлів заради пошуку
  небезпечно (див. §8); замість них — формат у плитці.

## 8. Обмеження й відомі проблеми (чесно)

- `contact` і `apparaat` є в моделі, але не індексуються. IMAP-пошта індексується лише якщо її проєкція `mail_items_v1` заповнена;
  вкладення IMAP не індексуються (лише Gmail REST). Microsoft-пошта — ні.
- Морфологія uk/bg/pl — легка (суфікси), без словника; `кінь/коня` не збігаються. Семантичного (векторного) пошуку немає — усе
  працює без моделі, як вимагає специфікація.
- OCR потребує встановленого `tesseract` (+ traineddata) на сервері власника (`mijn-ruimte-installeer ocr-talen`); без нього джерело
  показує «OCR недоступний», документи індексуються лише за назвою й текстовим шаром.
- Архіви: zip (stored/deflate), tar, tar.gz, gz; zip64, шифровані zip, 7z, rar → «не підтримується» (чесно в `problemen`).
- Один cron-процес на сервер; при тисячах листів перший повний прохід триває годинами (ліміт елементів на запуск — див. `ZOEK-BEHEER.uk.md`).
- Словник власника без UI (лише функції ядра).
- `app.zoek_document` (0096) лишається в схемі для повернення стану, порожня.

## 9. Файли

`shared/zoek-model.ts`, `shared/zoek-normalisatie.ts`, `shared/zoek-synoniemen.ts`, `shared/zoek-rangschikking.ts`, `shared/zoek-formaten.ts`,
`shared/geheim-patronen.ts`, `shared/zoek-ui-knoppen.generated.ts` (+ `scripts/zoek-ui-catalogus.mjs`); `backend/zoek-index.ts`,
`backend/globaal-zoek.ts`, `backend/zoek-geschiedenis.ts`, `backend/zoek/{bronnen,adapters,wachtrij,stand,catalogus-ui,tekst-extractie,
tekst-kern,tekst-werker,ocr,ocr-engines,inhoud,archief,beheer}.ts` (beheer = ручна індексація, зона D); `src/zoek/*` (зокрема `ZoekIndexVenster.tsx`, `zoek-index-{api,logic}.ts`, `ZoekCategorieIcoon.ts`), `shared/zoek-hulp.ts`; `migrations/0100_zoek_kern.sql`, `0101_*` (Z2), `0102_zoek_ocr_tekst.sql`,
`0103_zoek_geschiedenis.sql`, `0104_zoek_gin_lade.sql`; `tests/eenheid/zoek-*.test.ts` (ручна індексація: `zoek-index-beheer-20261022`), `tests/eenheid/hulp/zoek-evaluatie.json`, стенд `tests/e2e/hulp/stand-zoek.ts`.
