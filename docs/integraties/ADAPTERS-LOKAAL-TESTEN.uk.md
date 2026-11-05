> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./ADAPTERS-LOKAAL-TESTEN.md)) · [🇳🇱 **Nederlandse versie**](./ADAPTERS-LOKAAL-TESTEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Локальне тестування адаптерів (UI-013 фаза 2)

Адаптери в `backend/verbinding-adapters/` виконують лише **перевірки на читання** (WebDAV PROPFIND Depth 1, S3 ListObjectsV2, MQTT CONNECT→CONNACK→DISCONNECT). Вони нічого не записують у зовнішні сервіси й не зберігають жодних даних.

## Локальні сервери (лише тестові значення)
1. WebDAV + MQTT: невеликий Node-скрипт із `webdav-server` (порт 59100) та `aedes` (порт 59200), користувач `proef` / `proefwachtwoord`.
2. S3: `moto_server` (Python, порт 59300), бакет `ui013-proef` із файлом `proef.txt`, ключ `proef` / `proefgeheim`.
   - Чесно: `moto` не перевіряє підпис SigV4 суворо. Тому сам підпис окремо протестовано на офіційному еталонному векторі AWS (модульний тест `integraties-fase2`).
   - Поточне завантаження MinIO відхиляє операції S3 без ліцензії; тому використано `moto`.

## Запуск
```
WEBDAV_URL=http://127.0.0.1:59100/ WEBDAV_GEBRUIKER=proef WEBDAV_WACHTWOORD=proefwachtwoord \
S3_URL=http://127.0.0.1:59300 S3_EMMER=ui013-proef S3_ID=proef S3_GEHEIM=proefgeheim \
MQTT_POORT=59200 MQTT_GEBRUIKER=proef MQTT_WACHTWOORD=proefwachtwoord \
npx tsx tests/lokaal/verbinding-adapters-lokaal.ts
```
Очікуваний результат: `8/8 geslaagd`. Після цього зупиніть сервери через їхні власні PID (ніколи не використовуйте `pkill` за шаблоном).

## Не протестовано
Справжній Nextcloud, справжній MinIO/AWS (сувора перевірка підпису), MQTT через TLS зі справжнім брокером у локальній мережі (LAN), Outlook/Graph (потребує ключів власника).
