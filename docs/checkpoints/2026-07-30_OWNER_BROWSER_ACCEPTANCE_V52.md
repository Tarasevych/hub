> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.uk.md) · [🇳🇱 **Nederlandse versie**](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Приймання в браузері власника v52 (Власник Browser Acceptance v52)

## Обсяг робіт

- B-003 Ротація сесій та зміцнення оновлення токенів (Сесія Rotation та Refresh Hardening)
- B-004 Поширення відкликання доступу (Revocation Propagation)
- B-005 Приймання в браузері власника (Власник Browser Acceptance)
- L-002 Продовження двомовного зміцнення інтерфейсу (Bilingual Hardening Continuation)

## Контрольоване розгортання

Канаркова версія для власника працює на наявних власних доменах лише за наявності параметра `owner_test=1`. Стандартні продуктивні маршрути, продуктивний секрет OAuth і продуктивний центр авторизації не замінюються цією контрольною точкою.

Відкат (Rollback): продуктивна версія AppDeploy v51 (`1785379626280`).

## URL-адреси для власника

- Hub: `https://hub.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- AI: `https://ai.tarasevych.com/?owner_test=1&tab=workspace&lang=uk`
- Mail: `https://mail.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Cloud: `https://cloud.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- GitHub: `https://github.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Профіль Identity: `https://id.tarasevych.com/?owner_test=1&tab=profile&lang=uk`
- Сесії Identity: `https://id.tarasevych.com/?owner_test=1&tab=sessions&lang=uk`
- Відновлення Identity: `https://id.tarasevych.com/?owner_test=1&tab=recovery&lang=uk`
- Безпека API: `https://api.tarasevych.com/?owner_test=1&tab=testing&lang=uk`
- Двомовний QA API: `https://api.tarasevych.com/?owner_test=1&tab=bilingual&lang=uk`
- Системна істина (System truth): `https://api.tarasevych.com/?owner_test=1&tab=truth&lang=uk`

## Межа доказової бази

Автоматизований QA підтверджує детерміновану поведінку оновлення сесій, ротацію cookie на технічному хості, записи про відкликання, перевірки центральної епохи (`epoch`), цілісність геш-ланцюжка аудиту та двомовність критичних маршрутів. Зовнішній Google OAuth, життєвий цикл спливних вікон браузера, специфічне для браузера відновлення вкладок і перевірка cookie на власних доменах залишаються спостереженнями у браузері власника, доки власник не завершить контрольний список.
