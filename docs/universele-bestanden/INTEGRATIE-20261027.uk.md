# Мій простір · Universal File Workspace v0.3 · інтеграція поверх випуску 2026-10-27 21:14:25

**Джерело:** наданий власником архів `mijn-ruimte-20261027-211425.tar.gz`. **Режим:** нова candidate-збірка без розгортання на сервері.

## 0. Висновок аудиту

В останній збірці вже існує багатоформатний і складний файловий перегляд. Тому стара ідея «створити PDF/Office/Archive-переглядачі з нуля» скасована. Визначення форматів і рендерери **не перезаписували**. Від старого UFW v0.2 взято контракти й тести в ізольований `integrations/universal-file-workspace-core-v0.2/`, а інтеграційний шар v0.3 використовує наявні рендерери.

Підтверджено кодом останнього архіву:

- `src/MailBijlageVoorbeeld.tsx` — великий диспетчер формату; окремі рендерери PDF, DOCX, spreadsheet, presentation, archive, signature, media та спеціалізованих форматів.
- `src/MailBijlageVensters.tsx` — окремі draggable/resizable Mail-вікна із системою `platform/vensters`.
- `src/DriveBrowser.tsx` — Google Drive **вже повторно використовує** `loadMailAttachmentPreviewFromBlob` і `MailAttachmentPreviewBody`.
- `shared/bestandsformaten.ts` — спільна таксономія 13 файлових сімейств для UI.
- `src/platform/vensters.tsx` — єдиний менеджер вікон, док, пріоритети і геометрія.
- `src/mail-bijlage-lader.ts` — читання поштових attachment chunks, обмеження 32 MiB, кеш та concurrency limit.
- `package.json` — вже містить pdfjs-dist, pdf-lib, officeparser, xlsx, fflate, tesseract.js та інші бібліотеки.

Увага: наявність вихідних модулів **не доводить**, що всі окремі формати працюють у реальному браузері і з реальним файлом. Такі сценарії мають окремі acceptance tests.

### Зміна ідентичності (важливо)

У новому `backend/deployment-identity.ts` канонічний стан — **self-hosted**, `APP_ID='migrated-bg2v4h'`, `API_COOKIE_PATH='/'`, піддомени `*.tarasevych.com`. Історичні `app-8ppuax` та `c28444ec7eb73654e9` **не повертати**. Файли авторизації, OAuth, політик, конфігурації proxy, міграцій БД, Service Worker та самого інсталятора не змінювалися.

## 1. Зміни у v0.3

| Файл | Дія | Наслідок |
|---|---|---|
| `src/bestand/universeel-bestand.ts` | Додано | Єдиний `openUniverseelBestand()` для авторизованих `Blob`, перелік джерел, черга lazy-mount, 32 MiB preview limit, max 4 вікна, очищення pending blobs при зміні сесії |
| `src/bestand/UniverseelBestandVenster.tsx` | Додано | Спільне адаптивне вікно у **вже наявній** системі `Venster`, `MailAttachmentPreviewContent`, джерело, розмір, download, локальний file picker |
| `src/bestand/universeel-bestand.css` | Додано | Ізольовані класи, мобільна адаптація, без `!important` |
| `src/MailBijlageVoorbeeld.tsx` | 1 export | Існуючий чистий `MailAttachmentPreviewContent` відкрито для інших сервісів; жодної зміни алгоритму |
| `src/DriveBrowser.tsx` | 1 UI-кнопка | `У спільному вікні / In gedeeld venster` у вже існуючому Google Drive preview: повторне використання вже авторизованого `preview.blob` |
| `src/MailBijlageVensters.tsx` | Підготовлено адаптер | Legacy Mail лишається активним, перехід до спільного вікна заблоковано консервативним прапорцем `UNIVERSELE_MAIL_ENABLED=false` до QA |
| `integrations/universal-file-workspace-core-v0.2/` | Додано, ізольовано | v0.2 source registry, engine registry, typed contracts, sniff та самодостатній пакет тестів: в production ще НЕ ввімкнено |

**Не виконано:** backend endpoint `/api/owner/universal-files/v1/*`; серверні source-adapters GitHub/Dropbox/OneDrive; engine settings зі справжнім реєстром встановлених renderer implementations; конвертація, злиття, розділення, криптографічна валідація підпису; production deploy. Наявні сторонні viewer packages не були замінені на вигадані еквіваленти.

## 2. Контракт для інших компонентів

```tsx
import {openUniverseelBestand} from '../bestand/universeel-bestand';

// У конкретному сервісі спочатку перевірити сесію, owner/space, connector permission,
// account та відповідний provider authorization, отримати Blob через чинний backend.
openUniverseelBestand({
  bron: 'github', // також 'mail'|'google-drive'|'private-cloud'|'browser-file' та інші
  bestand: alreadyAuthorizedBlob,
  bestandsnaam: 'README.md',
  contentType: 'text/markdown',
  bronLabel: 'GitHub',
});
```

Не передавати OAuth secret, token, cookie, signed URL, filesystem path чи довільну зовнішню адресу. Viewer не має права самостійно скачувати URL із `intent`. Цей API виключно для Blob, який вже легітимно отриманий джерелом. Для серверних handle use cases використати окремий перевірений ACL endpoint після наступного етапу.

## 3. Як перевіряти й увімкнути

1. Розгорнути кандидата **лише в staging** після перевірки SHA256, без автоматичного production overwrite.
2. Використати Node.js **24+** (вимога саме цього `package.json`), встановити залежності `npm ci`, провести `npm run build` та `npm run typecheck:server`.
3. Chrome E2E з реальною авторизацією: відкрити PDF/DOCX/XLSX/PPTX, ZIP/ASiC, P7S, ICS/VCF, невідомий формат, порожній/пошкоджений/дуже великий файл, мобільне/ПК вікно; перевірити старі inline preview і upload/download.
4. Перевірити Google Drive нову кнопку: вона використовує **ті самі байти**, ніколи не створює нового OAuth grant; зворотна навігація та scroll збережені.
5. Перевірити відсутність витоку між 2 Gmail/Drive-акаунтами, між приватним і технічним простором, logout, перехід в інший tab, TTL кешу та відсутність сирих даних у localStorage.
6. Лише після QA змінити `UNIVERSELE_MAIL_ENABLED` на `true` і повторити весь набір mail regression E2E; до цього старі mail-вікна працюють без змін.
7. Після успішного staged rollout поступово підключати додаткові джерела через їх існуючі ACL backend endpoints, без універсального SSRF fetch endpoint.

## 4. Розподіл паралельних агентів

- **Агент A — inventory:** обов'язково перевірити всі сучасні `*Voorbeeld`, MIME/magic-byte, permissions, кеш, асинхронні уривки, old preview regression. Нічого не переписувати.
- **Агент B — adapters:** джерела Google Drive, приватний Cloud, GitHub, OneDrive/Dropbox тільки там, де існують авторизовані provider endpoints. Жодних raw URLs та токенів у клієнтському `FileRef`.
- **Агент C — UX:** інтеграційний `Venster`, режими narrow/mobile/wide, source attribution, access states, розміри, кілька вікон, клавіатура, screen readers і незайманий `CanonicalChrome`.
- **Агент D — engines/QA:** діагностувати фактичні preview implementations, формати, шкідливі макроси/HTML/SVG, ZIP-bombs, fallback and cap, ліцензійні обмеження; додати engine registry тільки після ідентифікації виконуваних пакетів.
- **Інтегратор:** власник єдиної базової гілки й release manifest, синхронізація merge; жодне паралельне відгалуження не може замінити новіші production-файли старими.

## 5. Відомі обмеження перевірок у середовищі підготовки

- ✅ v0.2 isolated core: 34/34 юніт-тестів.
- ✅ v0.3 bridge: 15/15 інваріантів.
- ✅ `node scripts/kaart-controle.mjs --stil` — успішно, одне **попередження, що вже існувало** про назву `editor-schil-20261026.test.ts`.
- ✅ TypeScript `transpileModule` перевірив синтаксис 5 дотичних змінених/нових файлів.
- ⚠️ Повний Vite/React build та e2e **не виконано**: наявний Node.js 22.16.0, а app вимагає 24+, `npm ci` не завершилося, відсутні потрібні dependencies.
- ⚠️ `plaatsing-controle.mjs` не виконався через відсутній dependency; це не доводить дефект самого коду.
- ⚠️ `universal-file-workspace-core-v0.2` ще не підключений runtime як source of truth: він збережений для контрольованої поступової міграції.

Не називати цей архів deployed або ready-to-production: це **candidate, pending full build and QA**.
