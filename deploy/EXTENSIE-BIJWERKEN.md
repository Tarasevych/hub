> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./EXTENSIE-BIJWERKEN.uk.md) · [🇳🇱 **Nederlandse versie**](./EXTENSIE-BIJWERKEN.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# Розширення браузера: оновлення · Browserextensie bijwerken

Станом на 18.10.2026 · Stand 18.10.2026 (audit, punt 9)

## Українською

**Що було.** Код розширення на сайті мав версію 0.4.0, а опублікований підписаний пакет (CRX) — 0.3.4. Збірка (`scripts/bouw-extensie.mjs`) правильно не публікувала застарілий CRX, але й не казала чому; сайт не показував, що є нова версія. Скрипт підпису мовчки створював **новий** ключ, якщо старого не було поруч — це дало б інший ідентифікатор розширення, і всі наявні встановлення більше ніколи не отримали б оновлення.

**Що тепер.**
- Версія розширення — **0.4.1** (команда `UPDATE_CHECK`, власна перевірка версії, значок «↑»). Мінімальна робоча версія — **0.4.0** (`shared/extensie-update.ts`, `EXT_MIN_VERSIE`; одне джерело для сайту і збірки).
- `extension-version.json` тепер містить `minVersion`, `crxStatus` (`actueel` / `verouderd` / `ontbreekt` / `ongeldig`) і `ondertekendeVersie`. Застарілі `mijn-ruimte-extension.crx` і `updates.xml` з попередньої збірки видаляються, щоб Chrome не «оновив» до старої версії.
- На кожній сторінці сайту, коли розширення старіше за опубліковане, з'являється смуга **«Доступне оновлення розширення X → Y»**:
  - **«Оновити автоматично»** — лише якщо розширення встановлене з нашого CRX (у маніфесті є `update_url`) і опублікований CRX новіший. Розширення просить Chrome перевірити оновлення (`chrome.runtime.requestUpdateCheck`) і перезапускається. Нічого не встановлюється без натискання.
  - **«Як оновити вручну»** — кроки для «Завантажити розпаковане»: завантажити zip, замінити файли в тій самій теці, у `chrome://extensions` натиснути ↻.
  - **«Нагадати пізніше»** — ховає на 24 години. Для обов'язкового оновлення (нижче 0.4.0) цієї кнопки немає.
- Саме розширення раз на 6 годин читає `https://mcp.tarasevych.com/downloads/extension-version.json` і показує «↑» на значку з підказкою.

**Що потрібно від власника (одноразово, на ПК з ключем).** Ключ підпису не лежить у репозиторії (і не повинен). Щоб автоматичне оновлення запрацювало для 0.4.1:
```
node scripts/onderteken-extensie.mjs T:\mijn-ruimte\geheim\extension-signing-key.pem
```
Скрипт перевіряє, що ключ дає той самий ідентифікатор `ofpffonakgjioahgfejmiblfmbkobmmi`; інакше нічого не записує (exit 3). Без ключа — exit 2 і пояснення. Новий ключ — лише свідомо: `--nieuwe-sleutel` (тоді наявні встановлення оновлення не отримають). Після підпису — новий пакет: `extension/signed/*` потрапить у збірку, з'являться `crx` і `updates.xml`, `crxStatus: actueel`.

Хто зараз має 0.3.4 з CRX: Chrome оновить сам, щойно буде опубліковано CRX 0.4.1 (`update_url` у старому пакеті вказує на той самий `updates.xml`). Хто має «розпаковане» 0.4.0: смуга покаже ручні кроки.

## Nederlands

**Wat was er.** De extensiecode op de site was 0.4.0, de gepubliceerde ondertekende CRX 0.3.4. De build publiceerde de verouderde CRX terecht niet, maar zei niet waarom; de site meldde geen nieuwe versie. Het ondertekenscript maakte stil een **nieuwe** sleutel als de oude ontbrak — dat geeft een ander extensie-id, waarna bestaande installaties nooit meer een update krijgen.

**Wat nu.**
- Extensie **0.4.1** (`UPDATE_CHECK`, eigen versiecontrole, badge «↑»). Minimale werkende versie **0.4.0** (`shared/extensie-update.ts`, één bron voor site en build).
- `extension-version.json` bevat `minVersion`, `crxStatus` en `ondertekendeVersie`; een verouderde crx/updates.xml uit een eerdere build wordt verwijderd.
- Strook **«Update van de extensie beschikbaar X → Y»** op elke pagina: «Automatisch bijwerken» (alleen CRX-installatie met `update_url` en een nieuwere gepubliceerde CRX), «Handmatig bijwerken» (stappen voor «Uitgepakt laden»), «Later herinneren» (24 u; niet bij een verplichte update onder 0.4.0).
- De extensie controleert zelf elke 6 uur en zet «↑» op het pictogram.

**Nodig van de eigenaar (eenmalig, op de pc met de sleutel):** `node scripts/onderteken-extensie.mjs <pad-naar-sleutel.pem>`. Het script controleert dat de sleutel hetzelfde id `ofpffonakgjioahgfejmiblfmbkobmmi` geeft (anders exit 3, niets geschreven); zonder sleutel exit 2 met uitleg; een nieuwe sleutel alleen bewust met `--nieuwe-sleutel`. Daarna een nieuw pakket bouwen: `crx` + `updates.xml` verschijnen, `crxStatus: actueel`.

Tests: `tests/eenheid/ui-audit-g.test.ts` (updatebeleid, consistentie build ↔ manifest, ondertekenscript), `browser-extensie`, `extensie-toestand`; harness `/tmp/h-G/test.py` (strook in uk/nl, licht/donker, 390 px).
