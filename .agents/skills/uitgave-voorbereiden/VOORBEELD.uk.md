# Відтворюваний приклад: збирання випуску та пам’ятка встановлення й повернення

## Призначення зразка

Показує практичне застосування обох напрямів навички `uitgave-voorbereiden`:
- **Напрям 1:** збирання випусків (основа, координація, PostgreSQL 18.6, каталог пошуку, `TRACE-001`, SHA-256).
- **Напрям 5:** пам’ятка встановлення (перевірка копій на ВМ та `R:\mijn-ruimte-reservekopie\`, схвалення в `admin.tarasevych.com/updates`, перевірки живого сайту та безпечне повернення).

## Напрям 1: Збирання випуску — відтворювана перевірка готовності

### Команди відтворення

```bash
node scripts/orch.mjs controleer
node scripts/orch.mjs wachtrij toon
node scripts/orch.mjs versheid --taak VAARD-002 --fase start
node scripts/zoek-ui-catalogus.mjs --controle
node scripts/eenheidstests.mjs uitrol-manifest.test.ts
node scripts/eenheidstests.mjs orch-kern
npm run typecheck:server
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
```

### Фактично спостережені результати (15.11.2026, дерево `stroom-vaard`)

- `node scripts/orch.mjs controleer`: **вихід 0** (`regelsVersie 1.4.14, hash 568ee500104c…`).
- `node scripts/orch.mjs versheid --taak VAARD-002 --fase start`: **вихід 0** (`vers · свіжо`).
- `node scripts/zoek-ui-catalogus.mjs --controle`: **вихід 0** (`actueel (1646 elementen)`).
- `node scripts/eenheidstests.mjs uitrol-manifest.test.ts`: **25/25 пройдено**.
- `node scripts/eenheidstests.mjs orch-kern`: **78/78 пройдено**.
- `npm run typecheck:server` та `npx tsc --noEmit`: **вихід 0**.

### Перевірені обмеження напряму 1

- У цьому ізольованому середовищі немає підключення до чистої тестової PostgreSQL 18.6 і права публікації в GitHub Releases; тому прогін нових міграцій (`deploy/uitrol/mijn-ruimte-migratie-proef.sh`) та перевірка точного SHA-256 оприлюдненого `.tar.gz`-файла в GitHub Release у цьому прогоні **не виконувалися** (але обов’язкові для справжнього випуску).
- Механізм отримання релізу сервером із GitHub уже впроваджено в `backend/uitrol-github-ontvangen.ts`, однак у робочому середовищі власник має окремо перевірити налаштування сховища та підпису запитів безпосередньо в розділі «Налаштування → GitHub».

## Напрям 5: Пам’ятка встановлення, запасних копій та повернення версії

### Складники в коді

- Запасні копії й відновлення: `deploy/backup-maken.sh`, `deploy/ВІДНОВЛЕННЯ.uk.md`, `deploy/HERSTEL.nl.md`, `deploy/installeer-app.sh`.
- Попередня перевірка, міграційна проба, схвалення ключем доступу та відкочування: `backend/uitrol-voorcontrole.ts`, `backend/uitrol-vereisten.ts`, `backend/uitrol-goedkeuring.ts`, `backend/uitrol-runs.ts`, `backend/uitrol-github-ontvangen.ts`, `backend/uitrol-telegram.ts`, `src/uitrol/Voorcontrole.tsx`, `scripts/rook-controle.mjs`.

### Послідовний приклад перед і після оновлення

1. Перевірити свіжу дзеркальну копію на сервері у `/srv/backups/mijn-ruimte/<останній штамп>/`: наявність `KLAAR`, `database.dump.age`, `uploads.tar.gz.age`, `systeem.tar.gz.age` та вихід `0` від `sha256sum -c SHA256SUMS`.
2. Передати власнику явну вимогу перевірити офлайнову копію на ПК у `R:\mijn-ruimte-reservekopie\` (`sleutels/herstelsleutel-age.txt`, `geheimen/geheimen-<stempel>.tar.age`, `vm-back-ups/`), не стверджуючи її наявності без доступу до `R:\`.
3. На `admin.tarasevych.com/updates` дочекатися зеленої попередньої перевірки та проби міграцій (`proef-inbox` на PostgreSQL 18.6) до натискання власником схвалення ключем доступу.
4. Після встановлення звірити `/api/version` (`versie` та `commit`), `/__gezondheid`, `diagnose.json` і `node scripts/rook-controle.mjs --live`.
5. У разі збою виконати повернення через `Admin → Оновлення → Відкотити` (`TERUGDRAAIEN`), а якщо новий випуск застосував несумісні міграції БД — додатково відновити БД із `database.dump.age` (`pg_restore`), оскільки міграції при кодовому поверненні автоматично не скасовуються.

### Перевірені обмеження напряму 5

- Доступ до робочої ВМ `<VM-IP>`, каталогу `/srv/backups/mijn-ruimte/` та диску `R:\` власника в цьому середовищі відсутній — перевірка копій та живого `/api/version` є обов’язковою передумовою на місці під час справжнього оновлення.
- Окремий бот випусків і шифрування архівів у темі Telegram впроваджено в `backend/uitrol-telegram.ts`, однак наявність чинного ключа `TELEGRAM_UITROL_BOT_TOKEN`, 256-бітного ключа шифрування та прав бота в темі потрібно підтвердити живою перевіркою з’єднання на сайті.

## Запис передавання роботи (`WERKOVERDRACHT`)

- **Ідентифікатор завдання:** `VAARD-002`
- **Складник:** збирання випусків і пам’ятка встановлення (`uitgave-voorbereiden`)
- **Що перевірено й посилання:** `orch controleer`, `orch versheid`, `zoek-ui-catalogus.mjs --controle`, `uitrol-manifest.test.ts` (25/25), `orch-kern.test.ts` (78/78), `typecheck:server`, `tsc --noEmit`
- **Невиконане й наступний крок:** перед реальним випуском виконати прогін нових міграцій (якщо є) на PostgreSQL 18.6, перевірити резервні копії на ВМ, підтвердити власнику перевірку `R:\mijn-ruimte-reservekopie\` і звірити SHA-256 оприлюдненого файла GitHub Release.
