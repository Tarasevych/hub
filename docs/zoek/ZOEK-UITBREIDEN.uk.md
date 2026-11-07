> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./ZOEK-UITBREIDEN.md)) · [🇳🇱 **Nederlandse versie**](./ZOEK-UITBREIDEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Пошук «/zoek» — як додати новий тип об'єкта або нове джерело

Стан: 22.10.2026. Покроково, з файлами. Правило: нове джерело **ніколи** не вигадує власний пошук чи власну таблицю — воно лише
постачає `ZoekObject`-и в єдине ядро і проходить ту саму браму просторів.

## A. Новий тип об'єкта (`soort`) у наявному джерелі

1. `shared/zoek-model.ts` → `ZOEK_SOORTEN`: додати назву (a–z). Якщо це «дія/налаштування/сторінка» (короткі запити-команди мають
   отримувати бонус), додати і в `ACTIE_SOORTEN`.
2. Адаптер джерела (`backend/zoek/adapters.ts` або `catalogus-ui.ts`): віддавати об'єкти з новим `soort`.
3. UI: `src/zoek/ZoekKaart.tsx` — піктограма й підпис типу (uk + nl), дія переходу; `src/zoek/zoek-logica.ts` — фільтр «Тип» бере значення з
   `ZOEK_SOORTEN`, тож нова назва з'явиться сама, але підпис uk/nl треба додати.
4. Тести: `tests/eenheid/zoek-kern-*.test.ts` (модель), додати 1–2 запити в `tests/eenheid/hulp/zoek-evaluatie.json` з очікуваним `soort`.
5. Міграція **не потрібна** (`soort` — вільний text).

## B. Нове джерело (`bron`), напр. «контакти» або «пристрої»

1. **Модель** — `shared/zoek-model.ts`:
   - `ZOEK_BRONNEN`: додати ім'я (`^[a-z_]{2,32}$` — це CHECK у 0100; міграція не потрібна);
   - `DIENST_VAN_BRON`: до якої ділимої служби належить (`mail | cloud | agenda | contacten | ai | bord | github`) або `null`
     (лежить у базовій ладі вкладки). Це визначає, **яка брама** вирішує доступ;
   - `BRON_NAAM` (uk/nl), `SOORT_VAN_BRON`.
2. **Адаптер** — `backend/zoek/adapters.ts`: функція `xxxObject(rij, lade): ZoekObject` → `{ id (стабільний у джерелі), bron, soort, titel,
   titels?, omschrijving?, tekst?, trefwoorden?, pad, route {host, pad, hash?, params?} (лише хост служби сайту), taal, formaat, bijgewerktOp,
   versie (hash вмісту або версія джерела), extra (≤8 KiB, без секретів), rechten: {userId, ruimte} }`. Текст файлів — тільки через
   `tekstUit()` (`backend/zoek/tekst-extractie.ts`), ніколи власним аналізатором. Секрети маскує ядро/`maskeerGeheimen` — але не кладіть
   їх і в `extra`.
3. **Читання джерела** — `backend/zoek/bronnen.ts`:
   - `koppelFeit(bron, lade, besluit)`: чи під'єднане джерело для цієї лади (реальна перевірка, не припущення) і код помилки;
   - у `volledigeScan`/`verwerk` (назви за файлом): прочитати рядки **лише через `projectieLade` + `hoortBij`** (або `alsGebruiker`), ніколи
     через фільтр лише по `ownerUserId`; віддати в `indexeer(lade, objecten)`; видалені → `verwijder`; вимкнене → `verwijderBron`;
   - дотримуватися `kluisStand(lade)`: якщо джерело потребує DEK (OAuth-токени), при `gesloten` повертати `KLUIS_GESLOTEN` без спроб.
4. **Стан джерела**: `standZetten(lade, bron, {...})` на початку (`indexeert`, `voortgang`), наприкінці (`klaar`/`gedeeltelijk`/`fout`, `laatsteOk`).
5. **Інкрементальність**: де джерело має події (вебхук, push, синхронізація проєкції) — ставити елемент у чергу (`zoekMelden` у `wachtrij.ts`)
   замість чекати повного скану; інакше повний скан за інтервалом (задокументуйте реальну затримку у `ZOEKEN.md` §7).
6. **UI**: `src/zoek/zoek-logica.ts` (категорія, лічильник показується лише коли джерело під'єднане), `ZoekKaart.tsx` (піктограма, дія),
   панель стану (назва з `BRON_NAAM`).
7. **Синоніми**: якщо у джерела свої терміни — група в `shared/zoek-synoniemen.ts` (9 мов) або `trefwoorden` в об'єкті.
8. **Тести** (обов'язково перед релізом):
   - `tests/eenheid/zoek-bronnen-*.test.ts`: адаптер на зразкових рядках (без мережі — нагляд `hulp/nep-google.ts`/`nep-github.ts`);
   - `tests/eenheid/zoek-isolatie-20261022.test.ts`: додати документ нового джерела в `docs()` для A і B (однакова назва) — тест сам
     перевірить, що немає перетину; якщо джерело має службу — і сценарій «закрита служба»;
   - `tests/eenheid/hulp/zoek-evaluatie.json`: ≥3 запити (точний, з помилкою, іншою мовою) із `verwacht:[{bron:'xxx', id:…}]`.
9. **Документація**: рядок у таблиці джерел `ZOEKEN.md` §1 і затримка у §7; `ZOEK-BEHEER.md` §2 (як перевірити стан).

## C. Нове джерело в каталозі інтерфейсу (нова сторінка/кнопка/налаштування)

Нічого робити не треба, якщо: сторінка/вкладка оголошена в `shared/menu-model.ts` + `src/dienst-tab-labels.ts`; кнопка — звичайний
JSX із текстом uk/nl у `src/**/*.tsx` (генератор `scripts/zoek-ui-catalogus.mjs` збирає їх у `shared/zoek-ui-knoppen.generated.ts` під час
`npm run build`; тест `zoek-bronnen-*` перевіряє актуальність); налаштування має `data-hulp='<ключ>'` і запис у `shared/hulp-register.ts`
(той самий ключ — це і `route.params.focus`, до якого сторінка прокручує). Нові права ШІ — `shared/connector-v2/catalogus.ts`; інтеграції —
`shared/integraties-catalogus.ts`. Після розгортання перший cron перезапише лише змінені об'єкти (версія `ui-<hash>:<id>`).

## D. Нова мова запиту

`shared/zoek-normalisatie.ts`: транслітерація (якщо нова абетка), `STOPWOORDEN`, `taalRaden`; `shared/zoek-model.ts` → `ZOEK_TALEN`,
`PG_STEMMER` (лише стемери, що **існують** у PG: `select cfgname from pg_ts_config`); `0100` → CHECK `zoek_objecten_taal_check` (міграція
`01xx`: `DROP CONSTRAINT`/`ADD CONSTRAINT`) і гілка в `zoek_stam`; групи синонімів доповнити формами нової мови; запити в наборі оцінки.
