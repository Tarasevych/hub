> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./RELEASE-NOTITIES-UI013.md)) · [🇳🇱 **Nederlandse versie**](./RELEASE-NOTITIES-UI013.nl.md) · [📖 Інструкція UI-013](./ІНСТРУКЦІЯ-UI013.uk.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Примітки до випуску UI-013 (фаза 1) — каталог інтеграцій як центр підключень

База: головний архів 20261029-193103 (гілка `integratie`, коміт ba499d9). Міграція: **0180** (лише прапорець).

## Нове (за прапорцем `integraties-catalogus-v2`, типово ВИМКНЕНО)
- Каталог у Адмін → Інтеграції за **темами**, усередині кожної теми — групи зі **справжнього стану**: Потребують уваги · Підключені · Можна підключити ·
  Потребують налаштування · У розробці. Теми й групи можна згортати/розгортати; стан згортання, вигляд (сітка/список), порядок тем, фільтр теми та
  способу зберігаються для кожного акаунта в цьому браузері. Група «У розробці» типово згорнута.
- Помилки підключень стоять **завжди** вгорі («Потребують уваги зараз»), незалежно від фільтрів і згорнутих блоків.
- Картка: логотип, назва, тема + спосіб підключення, що «Мій простір» реально вміє, стан, акаунт/кількість (перекладено в коді), остання перевірка або «стан прочитано; ще
  немає перевірки». Головна дія: Підключити / Керувати / Відновити / Налаштувати / **План** (замість неактивної кнопки «Скоро»).
  «План» показує: офіційний спосіб, що потрібно, що ще зробити, обмеження провайдера.
- Обране («Обране») вгорі без зміни справжньої категорії (наявна зірочка).
- Один «?» на блок (реєстр довідки `integraties.v2-catalogus`). Пошук за назвою, темою, можливістю, провайдером/протоколом.
- Відкриті вкладки каталогу оновлюють одна одну через `BroadcastChannel('mr-integraties-stand')`.

## Одразу (без прапорця)
- **BUG повідомлення Google**: новий легкий маршрут `POST /api/owner/admin/integraties/google-stand` (`admin.read`, лише `googleSuiteOnboardingSnapshot`).
  Каталог спершу використовує його; важку діагностику — лише як резервний варіант. Повідомлення тепер показує код помилки. Причина: див. `ARCHITECTUUR-UI013.md`.
- `POST /api/owner/admin/integraties/stand` тепер також містить **підключення IMAP** власного акаунта (iCloud, Yahoo, Proton, Outlook, інші → IMAP)
  із часом останнього успішного входу сервера та кодом помилки. Наслідок також у старому поданні: картки IMAP отримують чип «Підключено»/«Помилка».

## Аудит і план
- `shared/integraties-register.ts`: машиночитаний реєстр усіх 160 позицій (`werkend` 21, `basis` 12, `geen` 127) із файлами-доказами (тест перевіряє,
  що вони існують). `docs/integraties/INVENTARIS.md` (згенеровано, `npx tsx scripts/integraties-inventaris.ts`). План у `docs/integraties/ARCHITECTUUR-UI013.md`.

## Змінені файли
`backend/beheer-integraties.ts` · `shared/integraties-detail.ts` · `shared/hulp-register.ts` · `shared/vlaggen.ts` · `shared/zoek-ui-knoppen.generated.ts` (під час збірки) ·
`src/integraties/Integraties.tsx` · `src/integraties/Detail.tsx` (лише тип) · `src/integraties/integraties.css` · нові: `shared/integraties-register.ts`,
`src/integraties/CatalogusV2.tsx`, `src/integraties/catalogus-v2-logica.ts`, `src/integraties/catalogus-vlag.ts`, `scripts/integraties-inventaris.ts`,
`migrations/0180_integraties_catalogus_v2_vlag.sql`, `tests/eenheid/integraties-catalogus-v2-20261029.test.ts`, `docs/integraties/*`.
Файли UFW та `integrations/` не змінювалися.

## Не у цій фазі
Кроки майстра, спільна смужка на тематичних сторінках, нові адаптери (Nextcloud/S3/MQTT), періодичні перевірки, `cloud-vnext` на базі реєстру. Див. план.

---

## UI-013 фаза 2 (за прапорцем `integraties-catalogus-v2`, типово ВИМКНЕНО; нова міграція не потрібна)

- **Майстер підключень (6 кроків)** `src/integraties/WizardV2.tsx` + `wizard-v2-logica.ts`: вибір → спосіб → авторизація → перевірка → дозволи → готово. Повторно використовує наявні сторінки OAuth (state/PKCE в наявних потоках) і наявний потік IMAP; жодної нової реалізації OAuth. Секрети вводяться через `GeheimInvoer`, надсилаються лише для перевірки, не зберігаються й після цього очищуються. Крок «дозволи» повідомляє, що ШІ-агенти не отримують автоматичного доступу.
- **Спільна смужка** `src/integraties/IntegratieStrook.tsx` на сторінках Пошта, Хмара, Фото, Календар, ШІ (`api/verbindingen`), Будинок і GitHub. Читає `doelDienst` із `shared/integraties-register.ts`, показує готовність у каталозі (не стан акаунта) з одним «?» (`integraties.strook`) і посиланням на каталог.
- **Періодичні перевірки** `POST /api/owner/admin/integraties/controleer-alle` (`admin.read`): щонайбільше 1× на 30 хв на користувача, лише перевірки на читання, записує `app.integratie_controles`. Каталог викликає його щонайбільше 1× на годину. Перевірки, старіші за 24 год, показуються як «застарілі».
- **Адаптери (лише читання)** `backend/verbinding-adapters/`: WebDAV/Nextcloud (PROPFIND), S3 (SigV4, ListObjectsV2), MQTT (CONNECT/CONNACK, лише TLS, без приватних адрес через маршрут). Маршрут `POST /api/owner/admin/integraties/adapter-controle` (`apps.manage`, 10/хв, аудит без секретів, нічого не зберігається).
- **Реєстр**: поле `adapter`; `nextcloud`/`s3` з адаптером; нові базові рядки `mqtt` і `zigbee2mqtt`. Залишаються `basis` (не «Працює»): з'єднання ще не зберігається.
- **cloud-vnext** читає з реєстру через `src/cloud-vnext/register-koppeling.ts` (додатковий бейдж «Каталог: …», за тим самим прапорцем).
- **Outlook/Graph**: не побудовано. Імітований сервер нічого не доводить щодо справжнього Graph-OAuth; залишається «потребує ключів власника».
- Тести: `tests/eenheid/integraties-fase2-20261029.test.ts` (15/15), локально `tests/lokaal/verbinding-adapters-lokaal.ts` (8/8 проти `webdav-server`, `moto_server`, `aedes`), див. `ADAPTERS-LOKAAL-TESTEN.md`.
- Без змін: `integrations/`, файли UFW, наявні картки.
