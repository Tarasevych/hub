> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([орієнтир](./identity-coverage.md)) · [🇳🇱 **Nederlandse versie**](./identity-coverage.nl.md) · [🏠 Головна (UK)](../../../README.md) · [🏠 Hoofdpagina (NL)](../../../LEESMIJ.md) · [📚 Каталог статей](../../INDEX.md)

# Покриття категорії `identity` — 12 розділів (`identity-coverage.uk.md`)

- **Джерело переліку:** `shared/menu-model.ts → MENU_PAGINAS.identity` та `src/identiteit/identiteit-tabs.ts`.
- **Живий прототип:** [`identity-live.html`](./identity-live.html).
- **Робочий UI у застосунку:** `src/identiteit/IdentiteitAccountPagina.tsx`, `src/identiteit/Profielfoto.tsx`, `src/identiteit/identiteit-account.css` (`IDENTITY-002`).
- **Технічне завдання:** [`TZ-account-2026-11-04.uk.md`](./TZ-account-2026-11-04.uk.md).

| # | Розділ | Що реалізовано в прототипі та застосунку | Стан |
|---|---|---|---|
| 1 | `account` | Фото кліком по аватару (пристрій / сервіс / HTTPS-посилання), центрована камера 22px, смітничок 24px у куті, ім'я, e-mail, роль, захист власника від видалення (`OWNER_NIET_WISSEN`) | ✅ |
| 2 | `identity` | Список ідентичностей із логотипами провайдерів, позначка основної, прив'язування/відв'язування | ✅ |
| 3 | `methods` | Google, пароль + TOTP, Microsoft, Apple, Passkey (чесний статус доступності) | ✅ |
| 4 | `sessions` | Пристрої та сесії браузера, поточна сесія без кнопки примусового скидання, «Вийти всюди» | ✅ |
| 5 | `security` | TOTP (налаштування/скидання), step-up підтвердження, сповіщення безпеки | ✅ |
| 6 | `recovery` | Резервні коди відновлення, генерація нових, завантаження `.txt` | ✅ |
| 7 | `personalization` | Щільність інтерфейсу, анімації, підказки | ✅ |
| 8 | `themes` | 4 палітри (`Grifel`, `Puur`, `Violet`, `Kleur`), режим світла/темна/авто | ✅ |
| 9 | `languages` | Мова інтерфейсу (`uk`/`nl`), формат дат | ✅ |
| 10 | `menu` | Порядок служб, видимість, налаштування бічної панелі та дока | ✅ |
| 11 | `widgets` | Порядок і видимість віджетів робочого столу | ✅ |
| 12 | `sharing` | Спільний доступ, рівні прав і гостьові сесії | ✅ |

**Разом: 12/12 розділів реалізовано на одній сторінці з меню-змістом (`.ia-toc`) і `scroll-spy`.**
