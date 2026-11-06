> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./ACCESS_PLANE_V1.md)) · [🇳🇱 **Nederlandse versie**](./ACCESS_PLANE_V1.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Access Plane v1 — єдиний контур входу

## Проблема
Identity логін читав `GOOGLE_OAUTH_CLIENT_SECRET`, а Google Suite — окремі `GOOGLE_SUITE_CLIENT_ID` / `GOOGLE_SUITE_CLIENT_SECRET` / `GOOGLE_SUITE_REDIRECT_URI`. Чотири Секрет Entry замість одного Google Web OAuth Client.

## Контракт
- Один Web OAuth Client (`google_suite_web_oauth_client`) для identity + mail + Drive + calendar + photos.
- Канонічний секрет: `GOOGLE_OAUTH_CLIENT_SECRET`. `GOOGLE_SUITE_CLIENT_SECRET` лишається alias.
- Redirect завжди `https://id.tarasevych.com/`.
- Адмін зберігає/ротаціює CLIENT_SECRET у панелі (`/?service=admin&tab=contour`). Значення в UI після збереження не повертається.
- Vault-override має пріоритет над platform Секрет Entry.
- Не можна видалити останній живий секрет або останній спосіб входу.

## Методи
Користувач може прив’язувати, відв’язувати й замінювати Google, пароль, Microsoft, Apple, Facebook, телефон — незалежно від того, чим увійшов зараз. Кілька Google-акаунтів на один профіль лишаються через наявний principal isolation.

## MFA
- TOTP + коди відновлення — живі.
- SMS, push, WebAuthn — чесні «не налаштовано», без фейкового connected.
