> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./README-M5.md)) · [🇳🇱 **Nederlandse versie**](./README-M5.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# M5 Cloud Drivers — DevKit

Це виключно вихідні файли/патч для розробників, НЕ пакет оновлення сайту.

Використати на базі M4 із DevKit попереднього етапу або відповідної точної перевіреної версії.

- `cloud-full-integration-M5.patch` — тільки M5 зміни щодо M4.
- `changed/` — змінені та нові файли у дереві відносно кореня проєкту.
- `tests/eenheid/cloud-m5-aanbieder-golf.test.mjs` — тести модулів і мережевих контрактів із mock HTTP.
- `CLOUD-M5-IMPLEMENTATION-REPORT.uk.md` — стан, обмеження, офіційні API, вимоги до приймання.

Команди з кореня репозиторію:

```bash
node --experimental-strip-types --test tests/eenheid/cloud-m5-aanbieder-golf.test.mjs
node scripts/cloud-volledige-uitgave-poort.mjs # ЗОБОВ'ЯЗАНИЙ повернути BLOCKED доки немає live доказів
```

Не копіюйте API ключі у вихідні файли, архіви або браузер; реєстрація OAuth App і ключі B2/S3 виконуються лише на окремому staging.
