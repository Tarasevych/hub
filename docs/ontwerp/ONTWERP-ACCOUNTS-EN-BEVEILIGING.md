# Проєкт: акаунти, ідентичності та безпека / Ontwerp: accounts, identiteiten en beveiliging

Статус: погоджено власником (2026-10-03). Фазу 1 реалізовано на гілці `auth-fase-1` (локально,
не розгорнуто). Спочатку український текст, далі — нідерландський переклад.

Status: vastgesteld door de eigenaar (2026-10-03). Fase 1 is gebouwd op branch `auth-fase-1`
(lokaal, niet uitgerold). Eerst de Oekraïense tekst, daarna de Nederlandse vertaling.

---

# Частина 1 — Українською

## 1. Основні поняття

**Обліковий запис (акаунт)** — це випадковий UUID (`users.id`). Він нічого не «знає» про
e-mail чи телефон; e-mail — лише атрибут, а не ключ.

**Способи входу (login-ідентичності)** — Google, Microsoft, Apple, e-mail-посилання, телефон (SMS),
passkey, пароль. Кожна ідентичність — це пара *(провайдер, subject)*, наприклад
`(google, 1234567890)`. **Одна ідентичність належить рівно одному акаунту.** Один акаунт може мати
кілька способів входу.

**Підключені сервіси** — це не способи входу, а ресурси, з якими працює акаунт: кілька поштових
скриньок, дисків, AI-агентів, розумний будинок тощо. Одна й та сама скринька може бути спільною для
кількох акаунтів **лише з підтвердженням власника скриньки** і зі сповіщеннями всім, хто має доступ.

**Кілька акаунтів на одну людину** дозволено (наприклад, робочий і приватний). Об’єднання
акаунтів — **лише явне**: система може запропонувати об’єднання, але його мають підтвердити обидві
сторони (вхід в обидва акаунти). **Ніколи не об’єднуємо мовчки за e-mail.**

## 2. Два класи даних

**Клас 1 — особисті закриті дані** (нотатки, приватні документи, сейф).
- Шифруються на пристрої користувача персональним ключем даних (data key).
- Копії цього ключа зберігаються «загорнутими» (wrapped) під: паролем, ключем пристрою, passkey,
  кодом відновлення.
- **Адміністратор не може їх прочитати** — сервер бачить лише шифротекст.
- Мінімум **два способи відновлення** обов’язкові, інакше дані можна втратити назавжди.
- Необов’язково (opt-in): «ескроу» — довірена особа отримує загорнуту копію ключа.

**Клас 2 — дані сервісів** (пошта, файли, календар, індекси пошуку).
- Шифруються на сервері персональними ключами-конвертами (envelope keys) для кожного користувача;
  ці ключі загорнуті майстер-ключем.
- Доступ до рядків у базі обмежений RLS (row-level security) за `owner_id`.
- Кожен службовий доступ (наприклад, підтримка) записується в журнал аудиту.

## 3. Захист від зламу акаунта

- **Другий фактор на новому пристрої** (TOTP, passkey, код).
- **Сповіщення** про вхід, нові способи входу, зміну пароля — через канали, які обрав користувач
  (сайт, e-mail, Telegram…). У сповіщенні кнопка **«Це був не я»** — миттєво заморожує акаунт
  (усі сесії відкликаються, чутливі дії блокуються до перевірки).
- **Період охолодження 24–72 год** для чутливих дій з нового пристрою: видалення способу входу,
  зміна e-mail відновлення, експорт сейфу, видалення акаунта.

## 4. Випадкові дії

- Відв’язаний спосіб входу **не видаляється одразу**: 7 днів він зберігається вимкненим і може бути
  повернений за посиланням «скасувати» зі сповіщення.
- Те саме для видалених спільних доступів.

## 5. Видалення і неактивні акаунти

- Видалення акаунта: **30 днів м’якого видалення** (можна відновити), потім **крипто-знищення**
  (видаляються ключі — дані стають нечитабельними). Резервні копії старіють і зникають за власним
  графіком (не довше їхнього терміну зберігання).
- Неактивні акаунти: політика *попередити → заморозити → видалити* з чіткими строками і
  сповіщеннями на кожному кроці.

## 6. Гнучкий спільний доступ

Доступ видається **на окремий об’єкт**: лист, фото, альбом, папку, сторінку, сайт, розділ.
Кожен дозвіл (grant) має: отримувача, право (перегляд/коментар/редагування/керування), строк дії і
можливість відкликання. Перевірку робить база даних (RLS), а не лише код.

## 7. Два журнали

1. **Журнал безпеки** — лише дописування (append-only), записи зв’язані хешами в ланцюжок.
   Фільтри: тип, дія, користувач, IP, пристрій, період. Видаляти записи може лише уповноважений
   адміністратор, і саме видалення теж записується.
2. **Аналітика використання** — за замовчуванням анонімна. Персональна аналітика лише за явною
   згодою (GDPR: жодних попередньо поставлених галочок), з перемикачем у налаштуваннях. Користувач
   може запросити експорт своїх даних і видалення акаунта.

## 8. Три ролі бази даних (простими словами)

- **migrator** — «будівельник»: створює і змінює таблиці; використовується лише під час
  оновлення.
- **app** — «робітник»: працює застосунок; може читати/писати рядки, але **не може** змінювати
  структуру таблиць і **не може** обходити RLS.
- **system** — «прибиральник»: фонові задачі (очищення, синхронізація), окремі обмежені права.

## 9. RLS і `owner_id`

Кожен рядок з особистими даними має колонку `owner_id`. Політика RLS у Postgres пропускає лише
рядки, де `owner_id = current_setting('app.user_id')`. Код застосунку лише встановлює
`app.user_id` на початку запиту (з перевіреної сесії) — навіть якщо в коді є помилка, база не
віддасть чужі рядки.

## 10. Дорожня карта

| Фаза | Зміст | Стан |
|---|---|---|
| 1 | Вхід через Google для всіх (нові — `member`/`new`, власник за `OWNER_EMAIL`); без мовчазного об’єднання за e-mail; захист від login-CSRF; видалення застарілих маршрутів входу; «вийти всюди» покриває все; rate limiter закритий при збої БД; `huis` у списку входу | **Зроблено** (гілка `auth-fase-1`, не розгорнуто) |
| 2 | Колонка `owner_id` + три ролі БД + RLS, таблиця за таблицею | Заплановано |
| 3 | Step-up (повторна перевірка) для чутливих дій; окрема таблиця аудиту append-only; згода на аналітику | Заплановано |
| 4 | Персональні ключі; сейф класу 1 (шифрування на пристрої) | Заплановано |
| 5 | Гранти спільного доступу на об’єкти; явне об’єднання акаунтів з підтвердженням обох сторін | Заплановано |

### Фаза 1 — що саме зроблено
- `ensureUser`: акаунт шукається лише за *(google, subject)* (`account_identities`, потім старе
  `users.sub`). Новий Google-subject з e-mail, що вже належить іншому акаунту → **новий окремий
  акаунт** (`member`, `new`); існуючий акаунт отримує сповіщення (лише за id) і запис у
  `account_email_conflicts_v1` як підказку для майбутнього явного об’єднання (фаза 5).
- Виняток для власника: якщо акаунт з `OWNER_EMAIL` ще не має прив’язаної Google-ідентичності
  (перенесена база) — дозволено одне перше прив’язування, далі прив’язка фіксована. Роль власника
  ніколи не отримує другий акаунт з тим самим e-mail.
- `email_verified` перевіряється ще раз після userinfo.
- Login-CSRF: `transactions/create` ставить **окремий cookie для кожної транзакції**
  `__Secure-tsv_aanmeld_binding_<перші 16 hex хешу транзакції>` (HttpOnly, Secure, SameSite=Lax,
  Max-Age 15 хв). У транзакції зберігається лише SHA-256 від (хеш транзакції, хеш вкладки, значення),
  тобто cookie прив’язаний до цієї транзакції і вкладки (tab id). Callback (POST і старий GET)
  порівнює у сталий час і очищує **лише цей** cookie. Паралельні входи в кількох вкладках більше
  не перезаписують одне одного. Транзакції зі старою прив’язкою (v1) після оновлення не проходять
  (максимум 10 хв — просто увійти ще раз).
- Видимість за e-mail: сповіщення (`recipientEmail`) і запрошення до простору (`workspace_members`
  зі статусом `invited`) бачить/активує **лише оригінальний акаунт** з цією адресою — перший
  створений запис `users` з цим e-mail, і ніколи акаунт, який записаний як «новий» у
  `account_email_conflicts_v1`. Другий акаунт з тим самим e-mail (інший Google-subject) їх не бачить;
  сповіщення за id працюють як раніше. Код: `isEmailEigenaar` / `emailMeldingen` у `backend/index.ts`.
- Застарілі маршрути → `410 Gone`; міграція `0002` видаляє рядки старих сесій.
- «Вийти всюди» / «відкликати все»: усі сторінки сесій, вкладок і запам’ятованих браузерів,
  відкриті handoff-коди, незавершені транзакції входу, старі таблиці.
- Rate limiter для входу/MFA закривається (429) при помилці БД.
- TODO (наступні фази): сповіщення через e-mail/Telegram (поки лише сайт); кнопка «Це був не я».

### Кілька акаунтів в одному браузері (вкладки)
- **Кореневий cookie** `__Secure-tsv_ecosystem_<APP_ID>` містить одну *якірну* сесію браузера
  (перший вхід). Кожна вкладка має власний 48-hex tab id (sessionStorage) і власний **оверлей** у
  `owner_tab_sessions_v1` (якір + хеш вкладки → акаунт). Bootstrap вкладки бере акаунт з її
  оверлею; список акаунтів браузера — окремі оверлеї на кожен акаунт.
- **Знайдена помилка (виправлено):** якщо дві вкладки починали вхід, коли браузер ще не був
  увійшов (обидві з intent `login`), друга callback створювала НОВУ кореневу сесію і перезаписувала
  кореневий cookie → перша вкладка (оверлей на старому якорі) переходила на акаунт другої. Так само
  будь-яка транзакція `login`, що завершувалась після іншої вкладки.
- **Виправлення (мінімальне):** при завершенні входу (callback і старий `redirect/finalize`), якщо
  браузер уже має дійсну кореневу сесію, завжди йде шлях `replace-tab`: створюється/оновлюється
  лише оверлей цієї вкладки, кореневий cookie не змінюється. Нова коренева сесія — лише якщо її ще
  немає. Тест `tests/eenheid/tabbladen.test.ts` (справжній handler, імітований Google): дві паралельні
  транзакції в одному cookie jar обидві завершуються; вкладка A лишається на A, B на B, і третій
  вхід (C) їх не перемикає. Без виправлення тест падає (A переходить на B).
- Залишкові обмеження (без змін): нова вкладка без власного оверлею показує кореневий акаунт або
  «вийшли», якщо в браузері є живі вкладки іншого акаунта; вихід з кореневої сесії стосується
  всіх вкладок браузера.

---

# Deel 2 — Nederlands (vertaling)

## 1. Basisbegrippen

**Account** — een willekeurige UUID (`users.id`). Het "kent" geen e-mailadres of telefoon; e-mail
is een eigenschap, geen sleutel.

**Login-identiteiten** — Google, Microsoft, Apple, e-maillink, telefoon (sms), passkey, wachtwoord.
Elke identiteit is een paar *(provider, subject)*, bijvoorbeeld `(google, 1234567890)`. **Eén
identiteit hoort bij precies één account.** Eén account kan meerdere inlogmethoden hebben.

**Gekoppelde diensten** — geen inlogmethoden maar bronnen waarmee een account werkt: meerdere
mailboxen, drives, AI-agents, slim huis enz. Eenzelfde mailbox kan door meerdere accounts gedeeld
worden **alleen met bevestiging van de mailboxeigenaar** en met meldingen aan iedereen die toegang
heeft.

**Meerdere accounts per persoon** mag (bijv. werk en privé). Samenvoegen gebeurt **alleen
expliciet**: het systeem mag het voorstellen, maar beide kanten moeten bevestigen (aangemeld in
beide accounts). **Nooit stil samenvoegen op e-mailadres.**

## 2. Twee dataklassen

**Klasse 1 — persoonlijk, gesloten** (notities, privédocumenten, kluis).
- Versleuteld op het apparaat van de gebruiker met een persoonlijke datasleutel.
- Kopieën van die sleutel worden "ingepakt" (wrapped) bewaard onder: wachtwoord, apparaatsleutel,
  passkey, herstelcode.
- **De beheerder kan ze niet lezen** — de server ziet alleen versleutelde tekst.
- Minimaal **twee herstelmethoden** verplicht, anders kunnen de gegevens voorgoed verloren gaan.
- Optioneel (opt-in): "escrow" — een vertrouwd persoon krijgt een ingepakte kopie van de sleutel.

**Klasse 2 — dienstgegevens** (mail, bestanden, agenda, zoekindexen).
- Server-side versleuteld met per-gebruiker envelopsleutels, ingepakt door een hoofdsleutel.
- Toegang tot databaserijen begrensd door RLS (row-level security) op `owner_id`.
- Elke dienst-toegang (bijv. ondersteuning) wordt in het auditlog vastgelegd.

## 3. Bescherming tegen accountovername

- **Tweede factor op een nieuw apparaat** (TOTP, passkey, code).
- **Meldingen** bij aanmelden, nieuwe inlogmethoden, wachtwoordwijziging — via kanalen die de
  gebruiker kiest (site, e-mail, Telegram…). In de melding een knop **"Dit was ik niet"** die het
  account direct bevriest (alle sessies ingetrokken, gevoelige acties geblokkeerd tot controle).
- **Afkoelperiode van 24–72 uur** voor gevoelige acties vanaf een nieuw apparaat: inlogmethode
  verwijderen, herstel-e-mail wijzigen, kluis exporteren, account verwijderen.

## 4. Per ongeluk

- Een ontkoppelde inlogmethode wordt **niet direct verwijderd**: 7 dagen blijft ze uitgeschakeld
  bewaard en kan ze via de "ongedaan maken"-link in de melding terug.
- Hetzelfde voor ingetrokken deelrechten.

## 5. Verwijderen en slapende accounts

- Account verwijderen: **30 dagen zacht verwijderd** (herstelbaar), daarna **crypto-shred**
  (sleutels weg — gegevens onleesbaar). Back-ups verouderen en verdwijnen volgens hun eigen
  bewaartermijn.
- Slapende accounts: beleid *waarschuwen → bevriezen → verwijderen* met duidelijke termijnen en
  meldingen bij elke stap.

## 6. Flexibel delen

Toegang wordt **per object** gegeven: brief, foto, album, map, pagina, site, sectie. Elk deelrecht
(grant) heeft: ontvanger, recht (bekijken/reageren/bewerken/beheren), vervaldatum en intrekking.
De database dwingt dit af (RLS), niet alleen de code.

## 7. Twee logboeken

1. **Beveiligingsauditlog** — alleen toevoegen (append-only), regels met hashes aan elkaar
   geketend. Filters: type, actie, gebruiker, IP, apparaat, periode. Alleen een gemachtigde
   beheerder mag regels verwijderen, en dat verwijderen wordt zelf ook gelogd.
2. **Gebruiksanalyse** — standaard anoniem. Persoonlijke analyse alleen na uitdrukkelijke
   toestemming (AVG/GDPR: geen vooraf aangevinkte vakjes), met een schakelaar in de instellingen.
   Gebruikers kunnen een export van hun gegevens en verwijdering van hun account aanvragen.

## 8. Drie databaserollen (eenvoudig uitgelegd)

- **migrator** — de "bouwer": maakt en wijzigt tabellen; alleen gebruikt tijdens een update.
- **app** — de "werker": de applicatie; mag rijen lezen/schrijven, maar **niet** de tabelstructuur
  wijzigen en **niet** om RLS heen.
- **system** — de "schoonmaker": achtergrondtaken (opruimen, synchroniseren), eigen beperkte rechten.

## 9. RLS en `owner_id`

Elke rij met persoonlijke gegevens krijgt een kolom `owner_id`. Het RLS-beleid in Postgres laat
alleen rijen door waar `owner_id = current_setting('app.user_id')`. De code zet alleen
`app.user_id` aan het begin van een verzoek (uit de gecontroleerde sessie) — ook als er een fout in
de code zit, geeft de database geen rijen van anderen terug.

## 10. Stappenplan

| Fase | Inhoud | Stand |
|---|---|---|
| 1 | Google-login voor iedereen (nieuw = `member`/`new`, eigenaar via `OWNER_EMAIL`); geen stille e-mailsamenvoeging; login-CSRF dicht; verouderde aanmeldroutes weg; "overal afmelden" dekt alles; rate limiter faalt dicht bij DB-storing; `huis` in de loginlijst | **Gedaan** (branch `auth-fase-1`, niet uitgerold) |
| 2 | Kolom `owner_id` + drie databaserollen + RLS, tabel voor tabel | Gepland |
| 3 | Step-up (opnieuw bevestigen) voor gevoelige acties; aparte append-only audittabel; toestemming voor analyse | Gepland |
| 4 | Per-gebruiker sleutels; kluis klasse 1 (versleuteling op het apparaat) | Gepland |
| 5 | Deelrechten per object; expliciet samenvoegen van accounts met bevestiging van beide kanten | Gepland |

### Fase 1 — wat er precies gedaan is
- `ensureUser` zoekt het account alleen op *(google, subject)* (`account_identities`, daarna het
  oude `users.sub`). Een nieuw Google-subject met een e-mailadres dat al bij een ander account hoort
  → **nieuw apart account** (`member`, `new`); het bestaande account krijgt een melding (alleen op
  id) en een rij in `account_email_conflicts_v1` als hint voor een latere expliciete samenvoeging
  (fase 5). Code: `backend/account-koppeling.ts`, `backend/index.ts` (`ensureUser`,
  `meldEmailConflict`).
- Uitzondering voor de eigenaar: heeft het account met `OWNER_EMAIL` nog geen gekoppelde
  Google-identiteit (gemigreerde database), dan mag de eerste koppeling eenmalig; daarna ligt die
  vast. Een tweede account met hetzelfde adres krijgt nooit de eigenaarsrol.
- `email_verified` wordt na userinfo opnieuw geëist.
- Login-CSRF: `transactions/create` zet **per transactie een eigen cookie**
  `__Secure-tsv_aanmeld_binding_<eerste 16 hex van de transactiehash>` (HttpOnly, Secure,
  SameSite=Lax, Max-Age 15 min). De transactie bewaart alleen SHA-256 van (transactiehash, tabhash,
  waarde), dus de cookie hoort bij precies deze transactie en dit tabblad (tab-id). De callback (POST
  en de oude GET) vergelijkt tijdconstant en wist **alleen die** cookie. Parallelle aanmeldingen in
  meerdere tabbladen overschrijven elkaar niet meer. Transacties met de oude binding (v1) slagen na
  de update niet (hooguit 10 min — gewoon opnieuw aanmelden). Code: `backend/aanmeld-binding.ts`.
- Zichtbaarheid op e-mail: meldingen (`recipientEmail`) en ruimte-uitnodigingen
  (`workspace_members` met status `invited`) ziet/activeert **alleen het oorspronkelijke account** met
  dat adres: het eerst aangemaakte `users`-record met dat e-mailadres, en nooit een account dat als
  "nieuw" in `account_email_conflicts_v1` staat. Een tweede account met hetzelfde adres (ander
  Google-subject) ziet ze niet; meldingen op id werken zoals voorheen. Code: `isEmailEigenaar` /
  `emailMeldingen` in `backend/index.ts`.
- Verouderde routes → `410 Gone` (`VEROUDERDE_ROUTE_WEG`); migratie
  `migrations/0002_verouderde_sessies_opruimen.sql` verwijdert rijen van de oude sessiemodellen.
- "Overal afmelden" / "alles intrekken": alle pagina's sessies, tabsessies en onthouden browsers,
  openstaande handoff-codes, afgeronde niet-ingewisselde aanmeldtransacties, oude tabellen
  (`ownerAllesIntrekken`). API-sleutels en gekoppelde diensten blijven bewust staan.
- Rate limiter voor aanmelden/MFA faalt dicht (429) bij een databasefout.
- TODO (volgende fasen): meldingen via e-mail/Telegram (nu alleen op de site); knop "Dit was ik
  niet"; afkoelperiode; 7-dagen-uitgeschakeld bij ontkoppelen.

### Meerdere accounts in één browser (tabbladen)
- De **rootcookie** `__Secure-tsv_ecosystem_<APP_ID>` bevat één *anker*-sessie voor de browser (de
  eerste aanmelding). Elk tabblad heeft een eigen tab-id van 48 hex (sessionStorage) en een eigen
  **overlay** in `owner_tab_sessions_v1` (anker + tabhash → account). Bootstrap van een tabblad neemt
  het account uit die overlay; de accountlijst van de browser bestaat uit aparte overlays per account.
- **Gevonden fout (opgelost):** begonnen twee tabbladen een aanmelding terwijl de browser nog niet
  was aangemeld (allebei intent `login`), dan maakte de tweede callback een NIEUWE root-sessie en
  overschreef de rootcookie → het eerste tabblad (overlay op het oude anker) schakelde om naar het
  account van het tweede. Hetzelfde gold voor elke `login`-transactie die na een ander tabblad afrondde.
- **Oplossing (minimaal):** bij het afronden (callback en de oude `redirect/finalize`) wordt, als de
  browser al een geldige root-sessie heeft, altijd het `replace-tab`-pad genomen: alleen de overlay
  van dit tabblad wordt gemaakt/bijgewerkt, de rootcookie blijft ongemoeid. Een nieuwe root-sessie
  komt er alleen als er nog geen is. Test `tests/eenheid/tabbladen.test.ts` (echte handler,
  nagebootste Google): twee parallelle transacties in één cookiejar ronden allebei af; tab A blijft A,
  tab B blijft B, en een derde aanmelding (C) schakelt ze niet om. Zonder de fix faalt de test
  (A wordt B).
- Resterende beperkingen (ongewijzigd): een nieuw tabblad zonder eigen overlay toont het
  root-account, of "afgemeld" als er levende tabbladen van een ander account zijn; afmelden van de
  root-sessie geldt voor alle tabbladen van de browser.
