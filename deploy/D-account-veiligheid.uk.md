> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./D-account-veiligheid.md)) · [🇳🇱 **Nederlandse versie**](./D-account-veiligheid.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Звіт D: безпека облікового запису (4.1–4.4)

Гілка `werk-20261024`. Перший прохід — `agent/rapport-dg`. Цей допис закриває адмін-шлях і дірки 4.4, які лишились після нього.
Перевірка — `node scripts/eenheidstests.mjs account-wissen-20261026` і `browser-extensie`.
Postgres у цьому середовищі немає. «Жоден рядок не лишився» на живій базі **не** доведено.

## 4.1 Видалення одразу, без м’якого вікна

**Частково** (м’яке вікно з нових маршрутів знято; живого доказу на Postgres немає).

Самовидалення і адмін-видалення більше не кличуть `deleteRecoverably`.

- `POST /api/account/delete` і `POST /api/owner/identity/account/delete`: `kritiekStapOp(..., 'account-verwijderen')`, `codewoordEis`, `OWNER_NIET_WISSEN`, `accountMeteenWissen`.
- `deleteManagedUser` / `POST /api/owner/admin/users/:id/delete`: той самий момент. Користувач отримує `status: deleted`, `recoverableUntil: 0`, `retiredAt: now`, сесії відкликаються, далі `accountMeteenWissen`. `recoverDeletedAccount` кидає `RECOVERY_WINDOW_EXPIRED`, бо `retiredAt` вже стоїть. Журнал: `admin_user_deleted` з `{meteen:true}`. Власник як і раніше захищений (`OWNER_PROTECTED` / `ADMIN_OWNER_ACCOUNT_PROTECTED` і `OWNER_NIET_WISSEN` на самовидаленні).
- Функція `deleteRecoverably` лишилась у файлі для старих м’яких записів і прибиральної роботи. Нові маршрути її не кличуть (у `index.ts` рівно одне `deleteRecoverably(` — саме оголошення).
- У адмінці рядок зі `retiredAt` каже «стерто одразу, відновити не можна», а не «без обмеження часу». Старе м’яке вікно (є `recoverableUntil`, немає `retiredAt`) у тексті лишається, доки такий запис ще є.
- Реєстр `DELETE` у `accountMeteenWissen` іде одним `BEGIN` / `COMMIT` (`ROLLBACK`, якщо крок упав). `wisRecordsVanAccount` (надгробок і файли) лишається другим кроком після коміту: це не лише SQL.
- `users`, `records`, `audit` зі SQL вимкнені. `app.audit` append-only. Підписи (`actor_id`, `gewijzigd_door`, …) і `app.uitrol_runs` не є рядком цього облікового запису.

## 4.2 Критичні дії через сильний крок

**Частково.** Матриця не змінювалась у цьому дописі.

- Дії `account-verwijderen`, `aanmeldmethode`, `herstelcodes`, `ai-hoog`. Методи: `passkey`, `app-code`, `herstelcode`, `codewoord`. `googleAlleenVolstaat` для них хибний.
- Якщо в облікового запису немає passkey, TOTP і кодів відновлення, `sterkeStapOpFout` усе ще пускає свіжий Google (без «запам’ятати»). Кодове слово — брама сесії, не повторний запит на кожну зміну методу.

## 4.3 Кодове слово (argon2id або scrypt)

**Частково.** Argon2id не додавали. Лишився scrypt (`backend/codewoord.ts`, N=16384). Порожній `CODEWOORD_PEPER`, якщо змінна середовища порожня, — дірка конфігурації, не цього допису.

## 4.4 GeheimInvoer і екранна клавіатура

**Частково.**

- Секрети, PEM і SSH як і раніше через `GeheimInvoer`.
- `extension/shared.js` `isSensitiveField` тепер також істинний для `data-geheim-invoer` і `data-scherm-toetsenbord`, тож багаторядковий секрет розширення не заповнює як звичайний текст.
- Усі дев’ять клавіш `SchermToetsenbord` виходять на `if (!e.isTrusted) return` до `preventDefault`. Синтетичний `pointerdown` (зокрема з `dispatchEvent`) нічого не друкує. Справжній дотик лишається.
- `browser.script` / `evaluate_script` досі може виконати довільний JS поза цими клавішами. Це не закрито.

## Висновок

| Пункт | Стан |
| --- | --- |
| 4.1 | частково: нові шляхи одразу, без живого Postgres |
| 4.2 | частково (Google лишається, якщо немає сильнішого фактора) |
| 4.3 | частково (scrypt, argon2id не додавали) |
| 4.4 | частково (`browser.script` досі довільний JS) |
