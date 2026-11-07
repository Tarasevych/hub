> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./README-M7.uk.md) · [🇳🇱 **Nederlandse versie**](./README-M7.nl.md) · [🏠 Головна (UK)](./README.md) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [📚 Каталог статей / Index](./docs/INDEX.md)

# Повна інтеграція Хмари M7 (Повна інтеграція Хмари M7) · Набір розробки з пріоритетом безпеки

База: M6 DevKit із робочого архіву `20261027-212158` (не підтвердження поточної production-версії).

## Перевірка

```bash
node --test tests/eenheid/cloud-*mjs
node scripts/cloud-volledige-uitgave-poort.mjs
node scripts/kaart-controle.mjs --stil
```

Очікуваний результат: модульні тести проходять успішно; шлюз випуску (release gate) повертає `BLOCKED` (код виходу `2`); перевірка карти файлів — без помилок.

**Не встановлювати** в production, не оновлювати GitHub `main`/`voornaamst`, не застосовувати міграцій без попередньої перевірки на staging. Не вставляти ключ відновлення користувача (користувач recovery ключ) або вивід WebAuthn PRF у лог, аналітику, мережевий запит чи серверний HTML.

Опис меж довіри та незакритих питань: [`docs/CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md`](./docs/CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md) ([🇳🇱 NL](./docs/CLOUD-M7-PRIVACY-ARCHITECTURE.nl.md)).
