> 🌐 **Мова:** **Українська** · [Nederlands](PROEVEN-GOOGLE-TERUGKEERPAGINA-HERSTEL-001.nl.md)

# Перевірочні випробування сторінки повернення входу Google (`id.tarasevych.com`, `STATE_EXPIRED`) — `HERSTEL-001`

Цей документ фіксує результати аналізу мобільного знімка екрана `Screenshot_20261125_125840_com.android.chrome.jpg` (`id.tarasevych.com`, помилка завершення входу через Google з кодом `STATE_EXPIRED · HTTP 400`) та перевірочні випробування 4 складових виявленої проблеми (`GOOG-1`..`GOOG-4`).

Автоматизоване модульне випробування: [`tests/eenheid/herstel-001-google-terugkeer-staat-verlopen.test.ts`](../../tests/eenheid/herstel-001-google-terugkeer-staat-verlopen.test.ts).

---

## 1. `GOOG-1` — Оформлення (дизайн) самої сторінки повернення `id.tarasevych.com`

### Спостереження на знімку екрана
- На знімку `12:58:40` користувач після повернення з Google на `id.tarasevych.com` бачить суцільний порожній білий екран без картки «Мого простору», без шапки, без знака «Мій простір» чи значка Google з єдиного реєстру `src/merk`, без перемикача мови чи теми.
- Посилання **«Назад»** виглядає як звичайне чорне слово посеред тексту без рамки, без плашки, без стрілки (`←`) та без зони дотику `44 px` — візуально неможливо розпізнати, що це інтерактивна кнопка.

### Першопричина в коді
- У файлі [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (рядок 108) компонент `OwnerIdentityCallback` відмальовує голий `<main>` і `<section>` з вбудованими стилями (`background: 'var(--bg,#f5f7f6)'`, `color: 'var(--text,#173b3d)'`) та голе посилання `<a href={backTo} style={{color:'var(--accent,#146b6d)',fontWeight:700}}>{copy(locale).back}</a>`, яке через глобальне скидання стилів посилань у `src/index.css` стає звичайним чорним текстом.

### Перевірочна вимога (`GOOG-1`)
- Оформити сторінку повернення `id.tarasevych.com` як повноцінну картку стану входу «Мого простору» з підтримкою світлої й темної теми, знаком із реєстру `src/merk` та виразними кнопками дій висотою щонайменше `44 px`.

---

## 2. `GOOG-2` — Взаємодія з кодом проблеми (`Код збою: STATE_EXPIRED · HTTP 400`)

### Спостереження на знімку екрана
- Унизу під словом «Назад» виведено сірий рядок `Код збою: STATE_EXPIRED · HTTP 400`, який виглядає як мертвий статичний текст без стрілки розкриття, без кнопки швидкого копіювання коду й без людського пояснення самого коду `STATE_EXPIRED`.

### Першопричина в коді
- У [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (рядок 108) блок `<details><summary>` виводить сирий технічний код без візуальної плашки чи кнопки «Скопіювати код», а при розгортанні показує лише загальну фразу «Цей код можна безпечно надіслати розробнику. Не надсилайте адресу з параметрами OAuth» без розшифрування суті коду.

### Перевірочна вимога (`GOOG-2`)
- Оформити блок коду збою як зрозумілу інтерактивну плашку з видимим розкриттям, кнопкою «Скопіювати код» зі зворотним зв’язком («Скопійовано») та коротким поясненням технічного коду людською мовою.

---

## 3. `GOOG-3` — Відповідь для користувача (серверний код `STATE_EXPIRED` не розпізнається на клієнті)

### Спостереження на знімку екрана
- На екрані показано загальну фразу: **«Не вдалося завершити вхід Google. Поверніться назад і спробуйте ще раз.»**, хоча сервер повернув точний код причини `STATE_EXPIRED` (час очікування захищеної спроби входу сплив або сторінку повернення відкрито повторно з історії).

### Першопричина в коді
1. У [`backend/index.ts`](../../backend/index.ts) (рядок 669) функція `ownerGoogleCallbackPost` повертає коди `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_ATTACHED`, `STATE_TRANSACTION_MISMATCH`.
2. Натомість у [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (рядки 15 та 46–77) функції `failureCopy` та `callbackUitleg` перевіряють лише поштові коди `GOOGLE_SUITE_STATE_EXPIRED`, `GOOGLE_SUITE_STATE_NOT_FOUND` та неіснуючий `OWNER_OAUTH_EXPIRED`. Через це `STATE_EXPIRED` не збігається з жодною гілкою й повертає загальну заглушку `c.failed`.
3. Крім того, текст `c.expired` у [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (рядок 14) написаний лише для підключення пошти («Поверніться до Пошта → Акаунти й запустіть одну нову спробу»), що не підходить для входу в «Мій простір».

### Перевірочна вимога (`GOOG-3`)
- Додати в `callbackUitleg` та `failureCopy` точні двомовні (`uk` / `nl`) пояснення для `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT`, `TRANSACTION_NOT_FOUND`, `TRANSACTION_NOT_ATTACHED`, `STATE_TRANSACTION_MISMATCH`:
  - що саме сталося (час очікування захищеного входу Google — 10 хвилин — минув, або сторінку повернення відкрито повторно);
  - що обліковий запис у безпеці й нічого не змінено;
  - що потрібно зробити далі (почати нову спробу входу одним натисканням).

---

## 4. `GOOG-4` — Починання подальших дій із причиною (`returnTo`, `?aanmeld_fout` та кнопка нової спроби)

### Спостереження та поведінка
- Коли користувач натискає «Назад», він втрачає сторінку чи піддомен, з якого починав вхід, а на сторінці входу `hub.tarasevych.com` не відображається жодного повідомлення про причину перерваного входу й немає швидкої дії для повторної спроби.

### Першопричина в коді
1. У [`backend/index.ts`](../../backend/index.ts) (рядок 669) при `STATE_EXPIRED` або `STATE_NOT_FOUND` сервер одразу повертає `respond(false, '', stateLocale, 400, '', { reasonCode: ... })` без `returnTo` та `sourceOrigin`, хоча ідентифікатор транзакції `ownerTransactionRecordId` доступний і в записі `oauthState`, і в структурованому параметрі `state` (`ownerStateParts(state)`).
2. У [`src/EigenaarIdentiteitTerug.tsx`](../../src/EigenaarIdentiteitTerug.tsx) (рядки 102–108) параметр `?aanmeld_fout=<КОД>` додається до адреси повернення лише для `PLAATS_NODIG`, а для `STATE_EXPIRED` та інших помилок OAuth — не додається.
3. У словнику [`AANMELDEN` у `src/weigeringen.ts`](../../src/weigeringen.ts) (рядки 170–200), який використовує `useTerugFout` на сторінці входу, відсутні коди `STATE_EXPIRED`, `STATE_NOT_FOUND`, `TIMEOUT`, `TRANSACTION_NOT_FOUND`.

### Перевірочна вимога (`GOOG-4`)
- На сервері в `ownerGoogleCallbackPost` при `STATE_EXPIRED` / `STATE_NOT_FOUND` діставати транзакцію `OwnerTx` (за `oauthState.ownerTransactionRecordId` або `ownerStateParts(state)?.transactionRecordId`) і повертати збережені `returnTo` та `sourceOrigin`.
- На сторінці повернення `OwnerIdentityCallback` надати головну кнопку дії **«Повернутися й увійти знову»** (з передачею `?aanmeld_fout=<КОД>` на сторінку входу) та додати відповідні коди до словника `AANMELDEN` у `src/weigeringen.ts`.
