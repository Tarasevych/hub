> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./ZOEK-BEHEER.uk.md) · [🇳🇱 **Nederlandse versie**](./ZOEK-BEHEER.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Пошук «/zoek» — експлуатація: моніторинг, відновлення, міграції, розгортання, відкат, продуктивність

Стан: 22.10.2026. Для власника сервера BYOS. Усе виконується на його сервері; жодних зовнішніх служб.

## 1. Що встановити (BYOS)

| Компонент | Обов'язково? | Для чого | Як |
|---|---|---|---|
| PostgreSQL 16+ з `pg_trgm`, `unaccent` (contrib) | так | індекс, нечіткий пошук | уже вимагається сайтом; розширення створює міграція 0093/0100 (`CREATE EXTENSION IF NOT EXISTS`) |
| Node 24 | так | витяг тексту (pdfjs-dist, officeparser/fflate у worker_thread) | уже є |
| `tesseract` (CLI) + traineddata `ukr nld eng rus` | ні (рекомендовано) | OCR сканів/зображень | `mijn-ruimte-installeer ocr-talen` (ставить пакет і мови в `/srv/mijn-ruimte/ocr/tessdata`) — див. `deploy/installeer-app.sh`; без нього стан «OCR недоступний» |
| `pdftoppm` (poppler-utils) | ні (рекомендовано) | растеризація сторінок PDF для OCR | той самий крок; без нього — `pdfjs-afbeelding` (повільніше) |

Змінні середовища (усі необов'язкові; повний перелік у `ENV-VARS.md`, розділ «Пошук»): `ZOEK_TEKST_MAX_BYTES` (25 MiB),
`ZOEK_TEKST_TIMEOUT_MS` (60 000), `ZOEK_TEKST_WERKER_MB` (512), `ZOEK_PDF_MAX_PAGINAS` (500), `ZOEK_OCR_MAX_PAGINAS` (50),
`ZOEK_OCR_MAX_BYTES` (20 MiB), `ZOEK_OCR_PAGINA_TIMEOUT_MS` (45 000), `ZOEK_OCR_PARALLEL` (1), `ZOEK_OCR_ENGINE` (`auto|tesseract-cli|tesseract-js|platform-ai|uit`),
`ZOEK_OCR_TALEN` (`ukr+nld+eng+rus`), `ZOEK_OCR_TALEN_MAP`, `ZOEK_OCR_TESSERACT_PAD`, `ZOEK_OCR_PDFTOPPM_PAD`, `ZOEK_ARCHIEF_MAX_*`,
ліміти індексації Z2 (`ZOEK_INDEX_*`, див. `backend/zoek/bronnen.ts`). Старий прапорець `ZOEK_INDEX=aan` **вилучено** — індекс завжди.

## 2. Де дивитись стан

- **На сайті**: `/zoek` → панель «Стан джерел» (підключено / індексується / частково / помилка / не підключено, прогрес, час останнього
  успіху, остання помилка, кількість об'єктів — **реальний count**, не оцінка).
- **API**: `POST /api/owner/zoek/stand` (сесія власника).
- **БД** (роль system):
  ```sql
  SELECT user_id, ruimte, bron, stand, voortgang, documenten, laatste_succes_op, laatste_poging_op, laatste_fout FROM app.zoek_bron_stand ORDER BY laatste_poging_op DESC;
  SELECT status, count(*) FROM app.zoek_wachtrij GROUP BY 1;                       -- черга: wachtend/bezig/klaar/fout/geannuleerd
  SELECT bron, soort, attempts, last_error, run_after FROM app.zoek_wachtrij WHERE status='fout' ORDER BY updated_at DESC LIMIT 50;
  SELECT user_id, ruimte, bron, count(*) FROM app.zoek_objecten GROUP BY 1,2,3;     -- розмір індексу
  SELECT * FROM app.cron_runs WHERE name='zoek-index' ORDER BY started_at DESC LIMIT 10;  -- запуски cron
  ```
- **systemd**: `systemctl status mijn-ruimte-zoek-index.timer`, `journalctl -u mijn-ruimte-cron@zoek-index -n 100`. У журналі — коди,
  лічильники, тривалість; **ніколи** текст документів.
- **Діагностика сервера** (`admin → Діагностика`): перевірка `zoek` показує таймер, довжину черги, кількість `fout`, наявність OCR.

## 3. Типові помилки й відновлення

| Симптом | Причина | Дія |
|---|---|---|
| «Індексується» не змінюється годинами | таймер не запущений / cron падає | `systemctl start mijn-ruimte-zoek-index.timer`; `journalctl -u mijn-ruimte-cron@zoek-index`; запустити вручну `systemctl start mijn-ruimte-cron@zoek-index.service` |
| джерело «Помилка: GOOGLE_… / GITHUB_…» | відкликаний токен, ліміт API | переавторизувати інтеграцію на сайті; стан оновиться наступним cron |
| «OCR недоступний» | немає `tesseract`/мов | `mijn-ruimte-installeer ocr-talen`; cron перевіряє доступність знову при наступному повному скані |
| елементи черги `fout` з `TIJDSLIMIET`/`GEHEUGENLIMIET` | великий/пошкоджений файл | нічого робити не треба: документ індексується лише за назвою; за потреби підняти `ZOEK_TEKST_TIMEOUT_MS`/`ZOEK_TEKST_WERKER_MB` |
| `KLUIS_GESLOTEN` у `laatste_fout` | ключ людини закритий (людина не входила) | норма: індексація пошти/Drive продовжиться після входу |
| пошук повертає `bron:'live'` (fallback) | індекс лади порожній | дочекатися cron, «Оновити індекс» (`POST /api/owner/zoek/bronnen/vernieuwen`) або ручна індексація з технічного профілю (§5) |
| повна переіндексація потрібна (зміна нормалізації/синонімів) | нова версія ядра | `UPDATE app.zoek_bron_stand SET versie=''` для потрібних лад (або `TRUNCATE app.zoek_objecten` — безпечно: індекс похідний); cron перебудує; `app.zoek_geschiedenis.stand` стане `verouderd` |
| черга «зависла» у `bezig` | процес убито під час обробки | lease 5 хв спливає сам; елемент повертається у `wachtend` |

Індекс — **похідні дані**: його можна видалити повністю (`TRUNCATE app.zoek_objecten, app.zoek_wachtrij; UPDATE app.zoek_bron_stand SET versie=''`)
без втрати жодного листа/файла; OCR-кеш (`app.zoek_ocr_tekst`) теж можна очистити (коштує повторний OCR).

## 4. Міграції (порядок, ідемпотентність, відкат)

| № | Файл | Що робить | Відкат |
|---|---|---|---|
| 0093 | `0093_zoek_index.sql` | `app.zoek_objecten` (початкова), `app.zoek_norm` | застаріла основа; не відкочувати окремо |
| 0094 | `0094_zoek_rls.sql` | RLS на `zoek_objecten` | `ALTER TABLE app.zoek_objecten DISABLE ROW LEVEL SECURITY; DROP POLICY zoek_objecten_eigen` (не рекомендовано) |
| 0096 | `0096_zoek_bronnen_index.sql` | `zoek_document` (застаріла), `zoek_wachtrij`, `zoek_ocr_cache` (старий), `zoek_bron_stand` | `DROP TABLE app.zoek_document, app.zoek_wachtrij, app.zoek_ocr_cache, app.zoek_bron_stand` |
| 0100 | `0100_zoek_kern.sql` (Z1) | один індекс: нові колонки, `*_norm` з Node, `zoek_stam`, видалення `app.zoek_norm`, `bron` за regex, `zoek_bron_stand.stand/voortgang/versie`, `zoek_synoniemen_eigenaar` | покроково в шапці файла (DROP нових колонок, перейменування назад, повторний запуск 0093); `TRUNCATE` допустимий — дані похідні |
| 0101 | `0101_*` (Z2) | індексація/черга (див. шапку файла) | у шапці файла |
| 0102 | `0102_zoek_ocr_tekst.sql` (Z3) | OCR-кеш по користувачу/простору, RLS | `DROP TABLE app.zoek_ocr_tekst` (повторний OCR) |
| 0103 | `0103_zoek_geschiedenis.sql` (Z4) | історія на ладу, RLS | `DROP TABLE app.zoek_geschiedenis` |
| 0104 | `0104_zoek_gin_lade.sql` (Z1) | розширення `btree_gin` + складені GIN-індекси `(user_id, ruimte, zoek_vector)` і `(user_id, ruimte, zoek_stam)`: лада й повнотекст одним індексом | `DROP INDEX IF EXISTS app.zoek_objecten_lade_vector_idx, app.zoek_objecten_lade_stam_idx` (розширення може лишатися) |

Усі міграції ідемпотентні (`IF NOT EXISTS`, `DROP … IF EXISTS` перед `ADD CONSTRAINT`), застосовуються `dist-server/migrate.mjs` під час
`mijn-ruimte-installeer installeren` **після резервної копії**. Жодна не рухає й не видаляє дані джерел.

## 5. Ручна індексація з технічного профілю (зона D, 22.10.2026)

Навіщо: не чекати cron (5 хв) і бачити, що саме робить індексатор — повна або часткова переіндексація з живим ходом і результатом.

**Де**: `/zoek` → кнопка «Індексація…» (лише коли в цій вкладці активний технічний профіль; звичайний користувач кнопки не має, сервер
відповідає `403 ZOEK_INDEX_TECH_PROFIEL_VEREIST`). Відкривається плаваюче вікно (`src/zoek/ZoekIndexVenster.tsx` на спільній системі
вікон `src/platform/vensters.tsx`): перетягування за заголовок, «Згорнути» у док, «Розгорнути», закриття, позиція/розмір запам'ятовуються;
на телефоні (< 560 px) вікно на весь екран, повернутись — через док. `modaal=false`: сторінка пошуку працює далі, індексація триває на сервері.

**Що індексується** — рівно те, що шукає ця вкладка (`backend/globaal-zoek.ts` → `ladeGroepen`): у технічній вкладці — технічна лада
(інтерфейс завжди) плюс особиста лада для служб, що стоять на «спільно»; служби на «власні дані» — технічна лада. Ніколи чужі користувачі:
черга читається лише для власних лад (`zoekOphalen(…, { userId, ruimtes })`), лічильники — лише з подій цієї людини.

| Режим | Що робить | Як |
|---|---|---|
| Повна | усі джерела з нуля; зниклі об'єкти видаляються | водяну лінію джерела скинуто (`waterlijn 0`, `volledig_op 0`, для `ui` — `versie ''`) + крок `volledig` у черзі; ядро пропускає незмінені версії (`overgeslagen`) |
| Часткова | вибрані джерела (інтерфейс, пошта, вкладення, хмара, Drive, календар, дошка, GitHub): без дати — **повністю**; з датою «лише змінені з …» — тільки змінене після неї | крок лише для вибраних; без дати `waterlijn 0`; з датою `waterlijn = min(поточна, дата)` — назад, ніколи вперед, а джерело, яке ще не сканувалося (`waterlijn 0`), лишається 0 (інакше старіші рядки ніколи не потрапили б в індекс) — `nieuweWaterlijn()`; те саме для `cursor.externWaterlijn` (ICS/CalDAV); «Вкладення» = скан пошти (вкладення випливають із листів) |

**Один індексатор одночасно**: той самий Postgres advisory lock, що й cron (`cron:zoek-index`, `server/cron.ts`, `backend/sleutelkluis-achtergrond.ts`).
Якщо він зайнятий (cron/фонова ронда/ручний запуск іншої людини), ручний запуск **приєднується** (статус `aangesloten`): стежить за чергою
своїх лад і щораз пробує замок знову; звільнився — обробляє сам.

**Ліміти** (ENV, `ENV-VARS.md`): `ZOEK_BEHEER_RUN_MS` (10 хв) і `ZOEK_BEHEER_ITEMS` (2000). Після них статус `tijd`/`limiet`, решту добирає cron.
«Зупинити» — стоп після поточного елемента + скасування **запланованих кроків сканування** цих лад (`status geannuleerd`, `last_error HANDMATIG_GESTOPT`;
поелементні завдання вкладень/вмісту лишаються — cron добере їх сам, а кроки сканування він і так планує заново).

**Що показує вікно**: прогрес (оброблено / у черзі / помилки / тривалість), поточний крок (джерело → скан або об'єкт → % джерела), таблиця за
джерелами (стан, оброблено, нових/оновлених/видалених, OCR, помилок), результат (`klaar|gestopt|tijd|limiet|fout`) з переліком помилок і кодами
(остаточно / повтор заплановано), журнал: ваші ручні запуски + cron-запуски (`app.cron_runs`: `zoek-index`, `zoek-index@server`, ручні — `zoek-index@handmatig`,
`detail` з лічильниками, без назв/тексту). Дані — тільки з сервера, polling 1,5 с під час роботи, 10 с у спокої.

**API** (сесія власника + активна технічна активація вкладки; `backend/zoek/beheer.ts`):
`POST /api/owner/zoek/index/starten {modus:'volledig'|'gedeeltelijk', bronnen?, sinds?}` → `{ok, run, bestond}`;
`POST …/stand` → `{run, bronnen, wachtrij, laden, cron, limieten, nu}`; `POST …/stoppen` → `{ok, run, geannuleerd}`; `POST …/geschiedenis` → `{eigen, runs}`.
Аудит: `zoek.index.starten` / `zoek.index.stoppen` (тип `beheer`, деталі: режим, джерела, лади, id запуску).

**Код вікна — технічний бандл**: `src/zoek/ZoekIndexVenster.tsx`, `zoek-index-api.ts`, `zoek-index-logica.ts` починаються з `// @tech-asset`
(`shared/tech-bundels.ts`) → збираються в `dist/assets/tech/`, які сервер віддає лише з cookie активної технічної активації; без нього (профіль
завершився, нова версія) сторінка показує вікно «не завантажилось — оновіть сторінку», а не падає. Каталог UI пошуку
(`scripts/zoek-ui-catalogus.mjs`, префікс `search/ZoekIndex` → «technisch») не показує ні вікна, ні його «?»-пояснень (`zoek.index.*`)
в особистому просторі — лише в технічному.

Коли вікно згорнуте, у доці видно хід: «Індексація пошуку — 45 %». Завислий рядок `running` у журналі (сервер перезапущено посеред запуску,
рядок старший за 2 год) показується як «перервано»; сам рядок не змінюється.

**Перевірка**: `tests/eenheid/zoek-index-beheer-20261022.test.ts` (маршрути, замок зайнятий → приєднано, зупинка, два користувачі, аудит,
`nieuweWaterlijn` і `plannen` на реальній БД, каталог, технічний бандл), стенд `zoek-index-venster` (390/768/1280, світла/темна, nl, axe).

## 6. Розгортання

Як будь-який випуск: архів `mijn-ruimte-<дата>.tar.gz` + SHA-256 → `mijn-ruimte-installeer installeren` (копія бази → міграції 0100–0104 →
збірка → перемикання `current` → перезапуск → `/__gezondheid`). Додатково в цьому випуску:
1. `inrichten`/`installeren` додає таймер `mijn-ruimte-zoek-index.timer` (TIMERS у `deploy/installeer-app.sh`) і запис `zoek-index` у `cron.json`.
2. Необов'язково: `mijn-ruimte-installeer ocr-talen` для OCR.
3. Перший cron заповнює індекс; до того `/zoek` показує «індексується», а `global-search` працює з пам'яті (як раніше).
4. Перевірка після розгортання: `POST /api/owner/zoek/stand` (усі підключені джерела → `klaar` протягом ~15 хв), `SELECT count(*) FROM app.zoek_objecten`,
   `journalctl -u mijn-ruimte-cron@zoek-index`.

## 7. Відкат

1. `mijn-ruimte-installeer terugdraaien` (попередній `current`): код до 22.10.2026 **не читає** нових колонок і не потребує їх; старий
   `/api/owner/global-search` працює з пам'яті (`ZOEK_INDEX` не виставлено → індекс не читається). Сторінка `/zoek` старої версії працює.
2. Таймер `mijn-ruimte-zoek-index.timer` зупинити (`systemctl disable --now`), інакше старий `cron.mjs` просто не знайде обробник (помилка в журналі, без шкоди).
3. Міграції відкочувати **не обов'язково** (нові колонки/таблиці старому коду не заважають). Якщо треба повністю: порядок 0104 → 0103 → 0102 → 0101 → 0100 за шапками файлів.
4. Дані джерел не зачіпаються ніколи.

## 8. Продуктивність: цілі й виміри

Цілі (задокументовані для перевірки на сервері власника): пошук p95 < 300 мс при 10 000 об'єктів у ладі; підказки p95 < 100 мс;
пагінація сторінки 20 — стала; індексація ≥ 500 об'єктів/с для об'єктів без витягу тексту; OCR/витяг — у фоні, ніколи в HTTP-запиті.

Фактично виміряно (тестова PG16 на 55432; `tests/eenheid/zoek-prestaties-20261022.test.ts`: 10 000 об'єктів однієї лади, 1 000 з текстом ~400 слів,
словник 34 «гарячих» + 3 000 рідкісних слів, запит збігається з 1–15 % рядків; «було» — сценарій `rapporten/z5-perf/perf-0093.mjs` на індексі 0093 із
30-слівним словником). Два прогони на ядрі zoek-kern-2: перший (~09:30, до оптимізацій Z1) і другий (~09:45, після двофазного SQL Z1):

| Вимір | «Було» (0093, пошук у SQL без синонімів/стемів) | zoek-kern-2, перший прогін | zoek-kern-2, після оптимізації Z1 | Ціль |
|---|---|---|---|---|
| пошук, 20 на сторінку, без фасетів, p50 / p95 | 65 / 69 мс | 376 / 1 069 мс | **96 / 463 мс** | p95 < 300 мс |
| пошук з фасетами p50 / p95 | — | 616 / 1 909 мс | 98 / 470 мс | p95 < 500 мс ✓ |
| найгірший випадок (слово у ~30 % рядків, totaal ≈ 4 200) | — | 2 300 мс | 500 мс | < 1 000 мс ✓ |
| підказки p50 / p95 | 1,3 / 1,9 мс (LIKE) · 3,4 / 5,1 мс (trigram) | 51 / 106 мс | 49 / 69 мс | p95 < 100 мс ✓ |
| пагінація (сторінки 1 / 5 / 25 / 50) | 40 → 45 мс | 2 200 → 3 000 мс | 500 / 820 / 240 / 320 мс | стала, < 300 мс (не досягнуто) |
| індексація (`indexeer`, без витягу тексту) | ≈ 4 900 об./с (сирий INSERT) | 1 744 об./с | 1 863 об./с | ≥ 500 об./с ✓ |
| повторна індексація 500 змінених | — | 222 мс | 212 мс | — |
| розмір таблиці / GIN vector / GIN stam / trgm на 10k | 11 / 5 / — / 5 MB | 23 / 6 / 5,8 / 7,5 MB | 9 / 12 / 12 / 14 MB | — |

Висновок з `EXPLAIN (ANALYZE, BUFFERS)` справжнього SQL ядра (перехоплено тестом, перший прогін): планувальник ішов через
`zoek_objecten_lade_soort_idx` → **усі 10 000 рядків лади**, фільтр відкидав лише ~1 500; GIN-індекси (vector/stam/trgm) **не використовувались**,
бо умова `… OR $q <% titel_norm` (нечіткість у тому ж WHERE) і сполучення з ладою не покриті одним індексом; для ~3 500 кандидатів рахувались
6 tsquery-перевірок, `word_similarity`, `to_tsvector('simple', titel_norm)` і переносився `left(tekst, 20000)` у сортування. Після оптимізації Z1
(CTE лише з id + сигналами, текст лише для сторінки) p95 упав утричі, але сканування всієї лади лишається: ціль 300 мс p95 на 10k **ще не
досягнута** (463 мс). Третій крок (Z1, міграція **0104**): `btree_gin` + складені GIN-індекси `(user_id, ruimte, zoek_vector)` і `(user_id, ruimte, zoek_stam)` —
лада й повнотекст ідуть одним індексом, читаються лише рядки цієї лади, що справді містять слова; нечіткість (`<%`) лишається другою
фазою лише коли FTS дав мало. **Фінальний прогін на остаточному дереві (22.10, 13:20, та сама тестова PG16, 10 000 об'єктів):** пошук без
фасетів **p50 116 / p95 209 мс** (ціль 300 ✓), з фасетами 119 / 207 мс ✓, найгірший випадок (totaal ≈ 4 200) 329 мс ✓, підказки
p50 68 / p95 83 мс ✓, індексація 1 635 об./с ✓. Пагінація вимірюється тим самим тестом; на сервері власника перевірити на заповненій
базі: `tests/eenheid/zoek-prestaties-20261022` (ENV `ZOEK_PRESTATIE_N` для іншого N). Відкрито: `titelwoorden` через мітку ваги `:*A`
по `zoek_vector` (дрібна оптимізація, не блокер).

## 9. Ліміти ресурсів фонової індексації

- Витяг тексту — окремий `worker_thread` з `--max-old-space-size=ZOEK_TEKST_WERKER_MB` і таймаутом; перевищення → `fout`, процес cron живий.
- OCR — `ZOEK_OCR_PARALLEL` (1) одночасно; tesseract — зовнішній процес, тимчасові файли в приватній tmp (`PrivateTmp=yes` у
  `mijn-ruimte-cron@.service`, режим 0600, завжди видаляються).
- Архіви — стрімінг, ліміти загального розміру/кількості/глибини/співвідношення (zip-бомби), заборона symlink і виходу з теки (zip slip).
- Один запуск cron обробляє обмежену кількість елементів (ліміт у `backend/zoek/bronnen.ts`); при великих скриньках перший повний прохід
  триває години — це нормально й видно в «Стан джерел» як прогрес.
- `TimeoutStartSec=15min` у `mijn-ruimte-cron@.service`: один запуск не триває довше; незавершене лишається в черзі.

---

## NL — kort

Installatie: PostgreSQL 16+ (`pg_trgm`, `unaccent`), Node 24; optioneel `tesseract` + traineddata en `pdftoppm` via
`mijn-ruimte-installeer ocr-talen`. Stand bekijken: pagina `/zoek` → «Stand van bronnen», `POST /api/owner/zoek/stand`, tabellen
`app.zoek_bron_stand` / `app.zoek_wachtrij` / `app.cron_runs`, `journalctl -u mijn-ruimte-cron@zoek-index`. De index is afgeleide data:
`TRUNCATE app.zoek_objecten` is altijd veilig, de cron bouwt hem opnieuw. Migraties 0100–0104 zijn idempotent en in hun kop
terugdraaibaar; terugdraaien van de code (`mijn-ruimte-installeer terugdraaien`) vereist géén migratie-terugdraai. Handmatig indexeren (zone D): `/zoek`
→ «Indexeren…» in het technisch profiel → zwevend venster (volledig / gedeeltelijk, voortgang, uitkomst, journaal); zelfde advisory lock als de cron,
alleen de eigen laden, grenzen `ZOEK_BEHEER_RUN_MS` / `ZOEK_BEHEER_ITEMS` (§5). Doelen: zoeken p95
< 300 ms bij 10k objecten, suggesties < 100 ms; gemeten waarden staan in §8.
