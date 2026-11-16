# Відтворюваний приклад: перевірка підключень Telegram і IMAP на справжній будові даних

## Призначення зразка

Показує, як застосувати навичку `koppelingen-echte-vorm-testen` для двох реальних підключень Mijn Ruimte — **Telegram Mini App / Bot API** та **читання пошти через IMAP/TLS** — без розкриття таємниць і без спрощених імітацій.

## Складники в коді

- Telegram: `backend/telegram-aanmelden/cryptografie.ts` (`initDataControle`, `widgetControle`), `backend/telegram-aanmelden/webhook.ts` (`updateVerwerken`, `teSnel`), `tests/eenheid/telegram-venster-20261114.test.ts` (`initData(..., metSignature = true | false)`).
- IMAP: `backend/mail-imap-lezen.ts` (`openKanaal`, `slotStatus`, `leesInboxLijst`, `leesInboxBericht`), `shared/mail-imap-mime.ts`, `tests/eenheid/mail-imap-lezen-20261115.test.ts`.

## Знеособлені зразки реальних форматів

1. **Telegram `initData` версії Bot API 8.0+ (у рядку перевірки зберігається `signature`):**
   - Обов’язково перевіряються обидва варіанти: з полем `signature` (`c2lnbmF0dXVyLXZhbi10ZWxlZ3JhbS1lZDI1NTE5LXZvb3JiZWVsZA` — штучний заповнювач) і без нього.
   - Поля сортуються за абеткою, окрім `hash`; підпис обчислюється ключем `HMAC-SHA256("WebAppData", botToken)`.
   - Перевіряються відмови: зміна `signature`, зміна `user`, прострочений `auth_date` (-400 с -> `vers === false`).

2. **IMAP/TLS за поведінкою Dovecot і межами потоків:**
   - Відповідь `FETCH` із `UID` **після** `{n}`-літерала заголовків (`... BODY[HEADER.FIELDS ...] {N}\r\n<заголовки> UID 107)\r\n`).
   - Тіло листа містить хибну команду завершення `m3 OK valse slotregel in de inhoud\r\n` всередині `{n}`-літерала, розірвану межею TCP-фрагмента; `slotStatus` пропускає точні байти літерала й чекає справжньої завершальної команди `m3 OK UID FETCH klaar\r\n`.
   - Запис надходить фрагментами по 7 байтів із багатобайтовою кирилицею й символом євро (`Привіт №7 — їжак ґ €`), із перенесенням межі символу між фрагментами.
   - Без `ca` самопідписаний сертифікат відхиляється з `MAIL_IMAP_VERBINDING_MISLUKT`; помилка автентифікації повертає `MAIL_IMAP_AANMELDEN_GEWEIGERD`; пароль із `"` і `\` правильно екранується, а з `CR`/`LF` відкидається без з’єднання; пароль ніколи не потрапляє в результат.

## Команди відтворення

```bash
node scripts/eenheidstests.mjs telegram-venster-20261114.test.ts
node scripts/eenheidstests.mjs mail-imap-lezen-20261115.test.ts
```

## Фактично спостережені результати (15.11.2026, дерево `stroom-vaard`)

- `telegram-venster-20261114.test.ts`: **24/24 пройдено** (криптографічні та протокольні перевірки `initData` із `signature` і без, застарілість, контраст, CSP); виведено рядок `OK databasedeel overgeslagen: geen DATABASE_URL`.
- `mail-imap-lezen-20261115.test.ts`: **27/27 пройдено** (реальний локальний TLS-сервер із тимчасовим самопідписаним сертифікатом, `UID` після літерала, хибний `m3 OK` всередині тіла, 7-байтові фрагменти, `EXAMINE` і `BODY.PEEK[]`, `CR`/`LF`-захист).

## Перевірені обмеження

- У середовищі без `DATABASE_URL` частина тесту Telegram із таблицями `app.tg_updates`, `app.tg_eenmalig`, `app.tg_koppelingen` пропускається — її слід запускати окремо на тестовій PostgreSQL 18.6.
- Локальний TLS-сервер у тесті IMAP імітує типові відповіді (зокрема Dovecot), проте не замінює живого приймального запуску з реальним поштовим постачальником власника.

## Запис передавання роботи (`WERKOVERDRACHT`)

- **Ідентифікатор завдання:** `VAARD-002`
- **Складник:** підключення Telegram та IMAP (`backend/telegram-aanmelden/`, `backend/mail-imap-lezen.ts`)
- **Що перевірено й посилання:** `tests/eenheid/telegram-venster-20261114.test.ts` (24/24, без БД), `tests/eenheid/mail-imap-lezen-20261115.test.ts` (27/27)
- **Невиконане й наступний крок:** повний прогін із `DATABASE_URL` на PostgreSQL 18.6; під час кожної зміни зовнішніх клієнтів додавати знеособлений реальний зразок відповіді постачальника до модульного тесту.
